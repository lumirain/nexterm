//! 会话运行时：每个标签一个 PTY + 一棵终端网格。
//!
//! 统一用「PTY 里跑一个子进程」的模型，好处是：
//! * 本地 shell 与 `ssh.exe` 走同一条代码路径；
//! * 子进程能看到真正的终端，密码提示、分页器、行编辑都能正常工作
//!   （管道模型下 `ssh` 会因为读不到终端而直接判认证失败）。

use nexterm_core::model::{Palette, Protocol, Session};
use nexterm_core::vt::Term;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

pub struct Tab {
    pub id: u64,
    pub title: String,
    pub session_id: String,
    pub state: String,
    pub note: String,
    pub term: Arc<Mutex<Term>>,
    pub writer: std::sync::Arc<std::sync::Mutex<Option<Box<dyn Write + Send>>>>,
    pub child: Option<Box<dyn Child + Send + Sync>>,
    pub master: Option<Box<dyn MasterPty + Send>>,
    pub palette: Palette,
    pub sent: u64,
    pub cols: u16,
    pub rows: u16,
}

pub struct Runtime {
    pub tabs: HashMap<u64, Tab>,
    next: u64,
}

impl Runtime {
    pub fn new() -> Self {
        Runtime { tabs: HashMap::new(), next: 1 }
    }

    pub fn next_id(&mut self) -> u64 {
        let id = self.next;
        self.next += 1;
        id
    }

    pub fn get_mut(&mut self, id: u64) -> Option<&mut Tab> {
        self.tabs.get_mut(&id)
    }

    /// 移除标签并交还子进程句柄，由调用方在锁外销毁。
    pub fn detach(&mut self, id: u64) -> Option<Box<dyn Child + Send + Sync>> {
        match self.tabs.remove(&id) {
            Some(mut tab) => {
                tab.master = None;
                tab.child.take()
            }
            None => None,
        }
    }

}

/// 打开一个标签：建 PTY、起子进程、把输出接到终端网格上。
pub fn open(tab_id: u64, session: &Session, palette: Palette, cols: u16, rows: u16) -> Result<Tab, String> {
    let pty = native_pty_system();
    let pair = pty
        .openpty(PtySize {
            rows: rows.max(2),
            cols: cols.max(20),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("创建 PTY 失败：{e}"))?;

    let mut cmd = build_command(session)?;
    cmd.env("TERM", &session.terminal_type);
    cmd.env("COLORTERM", "truecolor");

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("启动 {} 失败：{e}", prog_label(session)))?;
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("获取读端失败：{e}"))?;
    let writer: std::sync::Arc<std::sync::Mutex<Option<Box<dyn Write + Send>>>> =
        std::sync::Arc::new(std::sync::Mutex::new(Some(
            pair.master
                .take_writer()
                .map_err(|e| format!("获取写端失败：{e}"))?,
        )));

    let term = Arc::new(Mutex::new(Term::new(cols as usize, rows as usize)));

    // 读线程：PTY → 网格。进程退出后保持在最后状态，由前端显示「已断开」。
    {
        let term = term.clone();
        let writer = writer.clone();
        let trace = std::env::var_os("NEXTERM_TRACE").is_some();
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            let mut log: Vec<u8> = Vec::new();
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        if trace {
                            log.extend_from_slice(&buf[..n]);
                            let _ = std::fs::write(
                                std::env::temp_dir().join(format!("nexterm-trace-{tab_id}.log")),
                                &log,
                            );
                        }
                        let reply = {
                            match term.lock() {
                                Ok(mut t) => {
                                    t.feed(&buf[..n]);
                                    t.rev += 1;
                                    if t.outbox.is_empty() {
                                        None
                                    } else {
                                        Some(std::mem::take(&mut t.outbox))
                                    }
                                }
                                Err(_) => None,
                            }
                        };
                        // 终端查询的应答必须在锁外回写，否则会和命令线程抢锁
                        if let Some(bytes) = reply {
                            if let Ok(mut guard) = writer.lock() {
                                if let Some(w) = guard.as_mut() {
                                    let _ = w.write_all(&bytes);
                                    let _ = w.flush();
                                }
                            }
                        }
                    }
                    Err(_) => break,
                }
            }
        });
    }

    Ok(Tab {
        id: tab_id,
        title: display_title(session),
        session_id: session.id.clone(),
        state: "已连接".into(),
        note: format!("{} · {}", prog_label(session), session.terminal_type),
        term,
        writer,
        child: Some(child),
        master: Some(pair.master),
        palette,
        sent: 0,
        cols,
        rows,
    })
}

fn prog_label(session: &Session) -> &'static str {
    match session.protocol {
        Protocol::Local => "本地 shell",
        Protocol::Ssh => "ssh",
        Protocol::Telnet => "telnet",
        Protocol::Serial => "串口",
    }
}

fn display_title(session: &Session) -> String {
    match session.protocol {
        Protocol::Local => session.name.clone(),
        _ => {
            if session.user.is_empty() {
                session.host.clone()
            } else {
                format!("{}@{}", session.user, session.host)
            }
        }
    }
}

fn build_command(session: &Session) -> Result<CommandBuilder, String> {
    match session.protocol {
        Protocol::Local => {
            #[cfg(windows)]
            {
                let mut c = CommandBuilder::new("powershell.exe");
                c.args(["-NoLogo", "-NoProfile", "-NoExit"]);
                Ok(c)
            }
            #[cfg(not(windows))]
            {
                let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into());
                Ok(CommandBuilder::new(shell))
            }
        }
        Protocol::Ssh => {
            if session.host.is_empty() {
                return Err("会话缺少主机地址".into());
            }
            let mut c = CommandBuilder::new("ssh");
            c.arg("-tt");
            c.arg("-p");
            c.arg(session.port.to_string());
            c.arg("-o");
            c.arg("ServerAliveInterval=30");
            c.arg("-o");
            c.arg("StrictHostKeyChecking=accept-new");
            let target = if session.user.is_empty() {
                session.host.clone()
            } else {
                format!("{}@{}", session.user, session.host)
            };
            c.arg(target);
            Ok(c)
        }
        Protocol::Telnet => Err(
            "Telnet 尚未接线：需要实现 IAC 选项协商，当前版本请使用 SSH 或本地会话".into(),
        ),
        Protocol::Serial => Err(
            "串口尚未接线：需要 Win32 COM 句柄与波特率配置，当前版本请使用 SSH 或本地会话".into(),
        ),
    }
}

pub fn write(tab: &mut Tab, data: &[u8]) -> Result<(), String> {
    match tab.writer.lock() {
        Ok(mut guard) => match guard.as_mut() {
            Some(w) => {
                w.write_all(data).map_err(|e| format!("写入失败：{e}"))?;
                w.flush().ok();
                tab.sent += data.len() as u64;
                Ok(())
            }
            None => Err("通道未连接".into()),
        },
        Err(_) => Err("写端忙碌".into()),
    }
}

pub fn resize(tab: &mut Tab, cols: u16, rows: u16) -> Result<(), String> {
    if cols == tab.cols && rows == tab.rows {
        return Ok(());
    }
    if let Some(master) = tab.master.as_mut() {
        master
            .resize(PtySize {
                rows: rows.max(2),
                cols: cols.max(20),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("调整窗口尺寸失败：{e}"))?;
    }
    if let Ok(mut t) = tab.term.lock() {
        t.resize(cols as usize, rows as usize);
    }
    tab.cols = cols;
    tab.rows = rows;
    Ok(())
}
