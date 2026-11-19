//! 凭证保管：SSH 密码的存取。
//!
//! 设计与桌面终端工具的安全实践一致：
//! * 密码保存在**操作系统级凭据库**——Windows 凭据管理器 / macOS 钥匙串 /
//!   Linux Secret Service（由 `keyring` crate 抽象），绑定当前登录用户；
//! * **密码本体永不写入 store.json**，配置里只有 `save_password` 开关；
//! * 连接时通过 `SSH_ASKPASS` 自动应答：ssh 把本程序自身作为 askpass 子进程
//!   启动（环境里带有本模块注入的 `NEXTERM_ASKPASS_SESSION` 标记），
//!   子进程从凭据库读出密码写往 stdout，全程不落盘。

use keyring::Entry;

/// 凭据库里的 service 名（按会话隔离）。
fn service(session_id: &str) -> String {
    format!("nexterm.session.{session_id}")
}

/// 凭据条目的账号字段。固定值即可：定位凭据只需要 (service, user) 二元组，
/// 会话的登录用户名已经存在 store.json 的 `user` 字段里。
const ACCOUNT: &str = "ssh-password";

pub fn set_password(session_id: &str, password: &str) -> Result<(), String> {
    let entry = Entry::new(&service(session_id), ACCOUNT).map_err(|e| format!("打开凭据库失败：{e}"))?;
    entry
        .set_password(password)
        .map_err(|e| format!("保存密码失败：{e}"))
}

/// 读密码。`Ok(None)` 表示没有保存过（或已被用户在系统里清掉）。
pub fn get_password(session_id: &str) -> Result<Option<String>, String> {
    let entry = Entry::new(&service(session_id), ACCOUNT).map_err(|e| format!("打开凭据库失败：{e}"))?;
    match entry.get_password() {
        Ok(pw) => Ok(Some(pw)),
        Err(keyring::Error::NoEntry) => Ok(None),
        // Windows 上「条目存在但被清空」等场景报 Ambiguous/Platform，按无密码处理
        Err(keyring::Error::Ambiguous(_)) => Ok(None),
        Err(e) => Err(format!("读取密码失败：{e}")),
    }
}

/// 是否已保存密码（不回传明文给前端）。
pub fn has_password(session_id: &str) -> bool {
    matches!(get_password(session_id), Ok(Some(_)))
}

/// 删除凭据。返回是否真的删掉了一条。
pub fn delete(session_id: &str) -> Result<bool, String> {
    let entry = Entry::new(&service(session_id), ACCOUNT).map_err(|e| format!("打开凭据库失败：{e}"))?;
    match entry.delete_credential() {
        Ok(()) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(format!("删除密码失败：{e}")),
    }
}

/// askpass 应答的标记变量。只有被 ssh 派生出来的 askpass 子进程
/// 才会带着它，正常启动的主进程环境里没有。
pub const ASKPASS_SESSION_ENV: &str = "NEXTERM_ASKPASS_SESSION";

/// 当前进程是否是「被 ssh 调用的 askpass」。
pub fn is_askpass_invocation() -> Option<String> {
    std::env::var(ASKPASS_SESSION_ENV).ok()
}

/// askpass 主体：从凭据库读密码写到 stdout（ssh 从管道读走）。
///
/// GUI 子系统的程序在父进程给定管道时，stdout 句柄依然可写——
/// ssh 正是这么调用 askpass 的，因此这里不需要任何控制台。
pub fn askpass_main(session_id: &str) -> i32 {
    match get_password(session_id) {
        Ok(Some(pw)) => {
            use std::io::Write;
            let mut out = std::io::stdout();
            let _ = writeln!(out, "{pw}");
            let _ = out.flush();
            0
        }
        _ => 1, // 没有凭据：非零退出，ssh 回落到终端提示
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn service_name_isolated_per_session() {
        // 仅验证命名规则稳定（不真正碰系统凭据库）
        assert_eq!(super::service("s-abc"), "nexterm.session.s-abc");
        assert_ne!(super::service("s-1"), super::service("s-2"));
    }
}
