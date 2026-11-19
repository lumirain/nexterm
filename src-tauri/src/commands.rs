//! Tauri 命令层：前端只能通过这里访问数据与终端。

use nexterm_core::model::*;
use crate::pty::{self, Runtime, Tab};
use nexterm_core::store as st;
use nexterm_core::vt::{Color, Row, Span, Term};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, State};

pub struct App {
    pub dir: PathBuf,
    pub store: Mutex<Store>,
    pub runtime: Mutex<Runtime>,
}

impl App {
    pub fn new(dir: PathBuf) -> Self {
        let store = st::load(&dir);
        App { dir, store: Mutex::new(store), runtime: Mutex::new(Runtime::new()) }
    }

    pub fn persist(&self) -> Result<(), String> {
        let store = self.store.lock().unwrap();
        st::save(&self.dir, &store)
    }
}

fn hex(palette: &Palette, c: Color, fallback: &str) -> String {
    match c {
        Color::Default => fallback.to_string(),
        Color::Indexed(i) => palette
            .ansi
            .get(i as usize)
            .cloned()
            .unwrap_or_else(|| if i < 16 { "#888888".into() } else { fallback.into() }),
        Color::Rgb(r, g, b) => format!("#{r:02x}{g:02x}{b:02x}"),
    }
}

#[derive(Serialize)]
pub struct SpanDto {
    t: String,
    fg: String,
    bg: String,
    b: bool,
    i: bool,
    u: bool,
    s: bool,
}

fn span_dto(sp: &Span, palette: &Palette) -> SpanDto {
    let (mut fg, mut bg) = (
        hex(palette, sp.fg, &palette.foreground),
        hex(palette, sp.bg, &palette.background),
    );
    if sp.attr.reverse {
        std::mem::swap(&mut fg, &mut bg);
    }
    SpanDto {
        t: sp.text.clone(),
        fg,
        bg,
        b: sp.attr.bold,
        i: sp.attr.italic,
        u: sp.attr.underline,
        s: sp.attr.strike,
    }
}

#[derive(Serialize)]
pub struct RowDto {
    spans: Vec<SpanDto>,
}

fn row_dto(row: &Row, palette: &Palette) -> RowDto {
    RowDto { spans: row.spans.iter().map(|s| span_dto(s, palette)).collect() }
}

#[derive(Serialize)]
pub struct Cursor {
    x: usize,
    y: usize,
    visible: bool,
}

#[derive(Serialize)]
pub struct Snapshot {
    ok: bool,
    rev: u64,
    unchanged: bool,
    state: String,
    note: String,
    title: String,
    cols: u16,
    rows: u16,
    sent: u64,
    cursor: Cursor,
    bg: String,
    fg: String,
    lines: Vec<RowDto>,
}

#[derive(Serialize)]
pub struct AppInfo {
    name: &'static str,
    version: &'static str,
    data_dir: String,
    store_file: String,
}

#[tauri::command]
pub async fn app_info(app: State<'_, App>) -> Result<AppInfo, String> {
    Ok(AppInfo {
        name: "NexTerm",
        version: env!("CARGO_PKG_VERSION"),
        data_dir: app.dir.display().to_string(),
        store_file: st::store_path(&app.dir).display().to_string(),
    })
}

#[tauri::command]
pub async fn store_get(app: State<'_, App>) -> Result<Store, String> {
    Ok(app.store.lock().unwrap().clone())
}

#[tauri::command]
pub async fn session_upsert(app: State<'_, App>, session: Session) -> Result<Store, String> {
    {
        let mut s = app.store.lock().unwrap();
        match s.sessions.iter_mut().find(|x| x.id == session.id) {
            Some(slot) => *slot = session,
            None => s.sessions.push(session),
        }
    }
    app.persist()?;
    Ok(app.store.lock().unwrap().clone())
}

#[tauri::command]
pub async fn session_delete(app: State<'_, App>, id: String) -> Result<Store, String> {
    {
        let mut s = app.store.lock().unwrap();
        s.sessions.retain(|x| x.id != id);
    }
    app.persist()?;
    Ok(app.store.lock().unwrap().clone())
}

#[tauri::command]
pub async fn folder_upsert(app: State<'_, App>, folder: Folder) -> Result<Store, String> {
    {
        let mut s = app.store.lock().unwrap();
        match s.folders.iter_mut().find(|x| x.id == folder.id) {
            Some(slot) => *slot = folder,
            None => s.folders.push(folder),
        }
    }
    app.persist()?;
    Ok(app.store.lock().unwrap().clone())
}

#[tauri::command]
pub async fn folder_delete(app: State<'_, App>, id: String) -> Result<Store, String> {
    {
        let mut s = app.store.lock().unwrap();
        s.folders.retain(|x| x.id != id);
        // 子分组与组内会话一并上浮到根，避免出现"孤儿"
        for f in s.folders.iter_mut() {
            if f.parent.as_deref() == Some(id.as_str()) {
                f.parent = None;
            }
        }
        for x in s.sessions.iter_mut() {
            if x.folder.as_deref() == Some(id.as_str()) {
                x.folder = None;
            }
        }
    }
    app.persist()?;
    Ok(app.store.lock().unwrap().clone())
}

#[tauri::command]
pub async fn settings_set(app: State<'_, App>, settings: Settings) -> Result<Store, String> {
    {
        let mut s = app.store.lock().unwrap();
        s.settings = settings;
    }
    app.persist()?;
    Ok(app.store.lock().unwrap().clone())
}

#[tauri::command]
pub async fn highlight_upsert(app: State<'_, App>, set: HighlightSet) -> Result<Store, String> {
    {
        let mut s = app.store.lock().unwrap();
        match s.highlight_sets.iter_mut().find(|x| x.id == set.id) {
            Some(slot) => *slot = set,
            None => s.highlight_sets.push(set),
        }
    }
    app.persist()?;
    Ok(app.store.lock().unwrap().clone())
}

#[tauri::command]
pub async fn highlight_delete(app: State<'_, App>, id: String) -> Result<Store, String> {
    {
        let mut s = app.store.lock().unwrap();
        s.highlight_sets.retain(|x| x.id != id);
        // 引用被删集合的会话回落到第一个可用集合
        let fallback = s.highlight_sets.first().map(|x| x.id.clone()).unwrap_or_default();
        for sess in s.sessions.iter_mut() {
            if sess.highlight_set == id {
                sess.highlight_set = fallback.clone();
            }
        }
    }
    app.persist()?;
    Ok(app.store.lock().unwrap().clone())
}

#[derive(Serialize)]
pub struct TabInfo {
    id: u64,
    title: String,
    session_id: String,
    state: String,
    note: String,
    cols: u16,
    rows: u16,
}

fn tab_info(t: &Tab) -> TabInfo {
    TabInfo {
        id: t.id,
        title: t.title.clone(),
        session_id: t.session_id.clone(),
        state: t.state.clone(),
        note: t.note.clone(),
        cols: t.cols,
        rows: t.rows,
    }
}

#[tauri::command]
pub async fn tab_open(app: State<'_, App>, session_id: String) -> Result<TabInfo, String> {
    let (session, palette) = {
        let s = app.store.lock().unwrap();
        let session = s
            .sessions
            .iter()
            .find(|x| x.id == session_id)
            .cloned()
            .ok_or_else(|| format!("会话不存在：{session_id}"))?;
        let palette = s
            .palettes
            .iter()
            .find(|p| p.id == session.palette)
            .or_else(|| s.palettes.first())
            .cloned()
            .ok_or("没有可用的配色方案")?;
        (session, palette)
    };

    let mut rt = app.runtime.lock().unwrap();
    let id = rt.next_id();
    let tab = pty::open(id, &session, palette, session.cols, session.rows)?;
    let info = tab_info(&tab);
    rt.tabs.insert(id, tab);
    Ok(info)
}

#[tauri::command]
pub async fn tab_write(app: State<'_, App>, id: u64, data: String) -> Result<(), String> {
    let mut rt = app.runtime.lock().unwrap();
    let tab = rt.get_mut(id).ok_or("标签不存在")?;
    pty::write(tab, data.as_bytes())
}

#[tauri::command]
pub async fn tab_resize(app: State<'_, App>, id: u64, cols: u16, rows: u16) -> Result<(), String> {
    let mut rt = app.runtime.lock().unwrap();
    let tab = rt.get_mut(id).ok_or("标签不存在")?;
    pty::resize(tab, cols, rows)
}

#[tauri::command]
pub async fn tab_close(app: State<'_, App>, id: u64) -> Result<bool, String> {
    // 先在锁内把子进程摘出来，再在锁外杀：kill 可能阻塞（例如 ssh 卡在认证），
    // 持锁 kill 会把后续所有命令一起堵死。
    let child = {
        let mut rt = app.runtime.lock().unwrap();
        rt.detach(id)
    };
    if let Some(mut c) = child {
        std::thread::spawn(move || {
            let _ = c.kill();
        });
    }
    Ok(true)
}

#[tauri::command]
pub async fn tab_set_palette(app: State<'_, App>, id: u64, palette_id: String) -> Result<(), String> {
    let palette = {
        let s = app.store.lock().unwrap();
        s.palettes
            .iter()
            .find(|p| p.id == palette_id)
            .cloned()
            .ok_or("配色方案不存在")?
    };
    let mut rt = app.runtime.lock().unwrap();
    if let Some(tab) = rt.get_mut(id) {
        tab.palette = palette;
    }
    Ok(())
}

#[tauri::command]
pub async fn tab_snapshot(
    app: State<'_, App>,
    id: u64,
    known_rev: Option<u64>,
) -> Result<Snapshot, String> {
    let known_rev = known_rev.unwrap_or(u64::MAX);
    let mut rt = app.runtime.lock().unwrap();
    let tab = rt.get_mut(id).ok_or("标签不存在")?;

    // 子进程退出后把状态改成"已断开"，前端据此显示状态点
    if tab.state == "已连接" {
        if let Some(child) = tab.child.as_mut() {
            if let Ok(Some(status)) = child.try_wait() {
                tab.state = format!("已断开（{}）", status.exit_code());
            }
        }
    }

    let rev = tab.term.lock().map(|t| t.rev).unwrap_or(0);
    if rev == known_rev {
        return Ok(Snapshot {
            ok: true,
            rev,
            unchanged: true,
            state: tab.state.clone(),
            note: tab.note.clone(),
            title: tab.title.clone(),
            cols: tab.cols,
            rows: tab.rows,
            sent: tab.sent,
            cursor: Cursor { x: 0, y: 0, visible: false },
            bg: tab.palette.background.clone(),
            fg: tab.palette.foreground.clone(),
            lines: Vec::new(),
        });
    }

    let guard = tab.term.lock().map_err(|_| "终端锁定失败")?;
    let term: &Term = &guard;
    let lines: Vec<RowDto> = term.snapshot().iter().map(|r| row_dto(r, &tab.palette)).collect();
    Ok(Snapshot {
        ok: true,
        rev,
        unchanged: false,
        state: tab.state.clone(),
        note: tab.note.clone(),
        title: tab.title.clone(),
        cols: tab.cols,
        rows: tab.rows,
        sent: tab.sent,
        cursor: Cursor { x: term.cx, y: term.cy, visible: term.cursor_visible },
        bg: tab.palette.background.clone(),
        fg: tab.palette.foreground.clone(),
        lines,
    })
}

/// 让前端能拿到一个"尚未实现"的统一说法，避免各处文案不一致。
#[tauri::command]
pub async fn feature_reason(feature: String) -> String {
    match feature.as_str() {
        "telnet" => "Telnet 需要 IAC 选项协商实现，当前版本未接线".into(),
        "serial" => "串口需要平台 COM 句柄封装，当前版本未接线".into(),
        "sftp" => "文件传输面板尚未接入，当前版本不含 SFTP".into(),
        "tunnel" => "端口转发尚未接入".into(),
        "script" => "脚本引擎尚未接入".into(),
        other => format!("{other} 尚未实现"),
    }
}

/// 应用启动时准备好数据目录与全局状态。
pub fn init(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&dir)?;
    app.manage(App::new(dir));
    Ok(())
}
