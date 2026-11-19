//! NexTerm 桌面端入口。
//!
//! 分层：`nexterm-core`（模型 / 存储 / VT）→ `pty`（会话运行时）
//! → `commands`（暴露给前端的唯一入口）。

pub mod commands;
pub mod cred;
mod pty;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            commands::init(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::store_get,
            commands::session_upsert,
            commands::session_delete,
            commands::folder_upsert,
            commands::folder_delete,
            commands::settings_set,
            commands::highlight_upsert,
            commands::highlight_delete,
            commands::tab_open,
            commands::tab_write,
            commands::tab_resize,
            commands::tab_close,
            commands::tab_set_palette,
            commands::tab_snapshot,
            commands::tab_scrollback,
            commands::credential_set,
            commands::credential_delete,
            commands::credential_exists,
            commands::feature_reason,
        ])
        .run(tauri::generate_context!())
        .expect("NexTerm 启动失败");
}
