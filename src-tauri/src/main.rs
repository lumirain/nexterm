// Windows 下 release 不弹控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // ssh 的 askpass 会被指到本程序自身：被 ssh 派生时环境里带有
    // NEXTERM_ASKPASS_SESSION 标记（正常启动不会有），据此分流——
    // 把保存的密码写到 stdout 给 ssh，然后立刻退出，绝不启动 GUI。
    if let Some(session_id) = nexterm_lib::cred::is_askpass_invocation() {
        std::process::exit(nexterm_lib::cred::askpass_main(&session_id));
    }
    nexterm_lib::run()
}
