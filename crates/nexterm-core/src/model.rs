//! NexTerm 自有数据模型。
//!
//! 这里定义的每一个结构体都是本项目独立设计的，与任何第三方终端软件的
//! 配置文件格式、字段命名、序列化方式**没有任何对应关系**：
//!
//! * 存储格式：本项目自有的 JSON（`store.json`），字段名与语义自成体系；
//! * 不解析、不导入、不兼容任何外部会话文件；
//! * 颜色使用 `#rrggbb` 字符串，而不是 Windows `COLORREF` 之类的平台相关整数。

use serde::{Deserialize, Serialize};

/// 会话协议。刻意只声明本项目真正实现的四种，避免出现"能选但打不开"的项。
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Protocol {
    /// 本机 shell（ConPTY / forkpty）
    Local,
    /// 通过系统 OpenSSH 客户端连接
    Ssh,
    /// 裸 TCP + Telnet 选项协商
    Telnet,
    /// 串口（预留，未接线时给出明确原因）
    Serial,
}

impl Protocol {
    pub fn default_port(self) -> u16 {
        match self {
            Protocol::Local => 0,
            Protocol::Ssh => 22,
            Protocol::Telnet => 23,
            Protocol::Serial => 0,
        }
    }
}

fn default_port() -> u16 {
    22
}
fn default_font_size() -> u16 {
    14
}
fn default_cols() -> u16 {
    100
}
fn default_rows() -> u16 {
    28
}
fn default_keepalive() -> u16 {
    60
}
fn default_retry_interval() -> u16 {
    5
}
fn default_terminal_type() -> String {
    "xterm-256color".into()
}
fn default_encoding() -> String {
    "UTF-8".into()
}
fn default_palette() -> String {
    "nexterm-light".into()
}

/// 会话（连接配置）。所有字段都有默认值，便于旧版本 JSON 平滑升级。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub folder: Option<String>,
    pub protocol: Protocol,
    #[serde(default)]
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default)]
    pub user: String,
    #[serde(default)]
    pub description: String,

    /// 外观
    #[serde(default = "default_palette")]
    pub palette: String,
    #[serde(default = "default_font_size")]
    pub font_size: u16,
    #[serde(default = "default_cols")]
    pub cols: u16,
    #[serde(default = "default_rows")]
    pub rows: u16,
    #[serde(default)]
    pub highlight_set: String,

    /// 连接行为
    #[serde(default = "default_keepalive")]
    pub keepalive: u16,
    #[serde(default)]
    pub reconnect: bool,
    #[serde(default = "default_retry_interval")]
    pub retry_interval: u16,
    #[serde(default)]
    pub retry_limit: u16,

    /// 终端
    #[serde(default = "default_terminal_type")]
    pub terminal_type: String,
    #[serde(default = "default_encoding")]
    pub encoding: String,

    #[serde(default)]
    pub created_at: i64,
}


/// 会话分组（可嵌套）。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Folder {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub parent: Option<String>,
}

/// 终端配色方案：16 个 ANSI 色 + 前景/背景/光标。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Palette {
    pub id: String,
    pub name: String,
    pub background: String,
    pub foreground: String,
    pub cursor: String,
    /// ANSI 0..15
    pub ansi: Vec<String>,
}

/// 高亮规则。`pattern` 为纯文本时按子串匹配，`regex = true` 时按正则匹配。
///
/// 语义对齐桌面终端工具的「突出显示集」：支持大小写敏感、正则、前景/背景、
/// 加粗/斜体/下划线/删除线。`case_sensitive = false` 时忽略大小写（默认，
/// 与历史数据兼容）；`background = None` 表示沿用终端底色（对应 Term Color）。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HighlightRule {
    #[serde(default)]
    pub enabled: bool,
    pub pattern: String,
    #[serde(default)]
    pub regex: bool,
    #[serde(default)]
    pub case_sensitive: bool,
    #[serde(default)]
    pub foreground: Option<String>,
    #[serde(default)]
    pub background: Option<String>,
    #[serde(default)]
    pub bold: bool,
    #[serde(default)]
    pub italic: bool,
    #[serde(default)]
    pub underline: bool,
    #[serde(default)]
    pub strikeout: bool,
    #[serde(default)]
    pub note: String,
}

/// 高亮集。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HighlightSet {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub rules: Vec<HighlightRule>,
}

/// 界面偏好。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_accent")]
    pub accent: String,
    #[serde(default = "yes")]
    pub show_toolbar: bool,
    #[serde(default = "yes")]
    pub show_statusbar: bool,
    #[serde(default = "yes")]
    pub show_panel: bool,
    #[serde(default = "default_panel_width")]
    pub panel_width: u32,
}

fn default_theme() -> String {
    "light".into()
}
fn default_accent() -> String {
    "blue".into()
}
fn yes() -> bool {
    true
}
fn default_panel_width() -> u32 {
    258
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: default_theme(),
            accent: default_accent(),
            show_toolbar: true,
            show_statusbar: true,
            show_panel: true,
            panel_width: default_panel_width(),
        }
    }
}

/// 磁盘上的完整存储。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Store {
    /// 数据格式版本，用于将来迁移。与任何外部软件的版本号无关。
    pub schema: u32,
    pub folders: Vec<Folder>,
    pub sessions: Vec<Session>,
    pub palettes: Vec<Palette>,
    pub highlight_sets: Vec<HighlightSet>,
    pub settings: Settings,
}

pub const SCHEMA_VERSION: u32 = 1;
