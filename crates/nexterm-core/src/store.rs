//! 存储层：读写本项目自有的 `store.json`。
//!
//! 设计要点：
//! * 单一 JSON 文件，人可读、可手工编辑、便于备份；
//! * 写入走"临时文件 + 重命名"，避免断电或崩溃留下半截文件；
//! * 首次启动写入一份演示数据，让界面开箱可用（全部为本项目自造内容）。

use crate::model::*;
use std::path::{Path, PathBuf};

pub fn store_path(dir: &Path) -> PathBuf {
    dir.join("store.json")
}

/// 读取存储；文件不存在或解析失败时返回种子数据。
///
/// 解析失败不静默覆盖：把坏文件改名留档，再落一份新的，避免用户数据凭空消失。
pub fn load(dir: &Path) -> Store {
    let path = store_path(dir);
    match std::fs::read_to_string(&path) {
        Ok(text) => match serde_json::from_str::<Store>(&text) {
            Ok(mut s) => {
                s.schema = SCHEMA_VERSION;
                s
            }
            Err(_) => {
                let backup = dir.join(format!(
                    "store.corrupt-{}.json",
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0)
                ));
                let _ = std::fs::rename(&path, backup);
                seed()
            }
        },
        Err(_) => seed(),
    }
}

pub fn save(dir: &Path, store: &Store) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("创建数据目录失败：{e}"))?;
    let text = serde_json::to_string_pretty(store).map_err(|e| format!("序列化失败：{e}"))?;
    let tmp = dir.join("store.json.tmp");
    std::fs::write(&tmp, text).map_err(|e| format!("写入失败：{e}"))?;
    std::fs::rename(&tmp, store_path(dir)).map_err(|e| format!("提交失败：{e}"))?;
    Ok(())
}

fn session(
    id: &str,
    name: &str,
    folder: Option<&str>,
    protocol: Protocol,
    host: &str,
    user: &str,
    desc: &str,
) -> Session {
    Session {
        id: id.into(),
        name: name.into(),
        folder: folder.map(|s| s.to_string()),
        protocol,
        host: host.into(),
        port: protocol.default_port(),
        user: user.into(),
        description: desc.into(),
        palette: "nexterm-light".into(),
        font_size: 14,
        cols: 100,
        rows: 28,
        highlight_set: "ops-basic".into(),
        keepalive: 60,
        reconnect: false,
        retry_interval: 5,
        retry_limit: 0,
        terminal_type: "xterm-256color".into(),
        encoding: "UTF-8".into(),
        created_at: 0,
    }
}

pub fn seed() -> Store {
    let folders = vec![
        Folder { id: "f-prod".into(), name: "生产环境".into(), parent: None },
        Folder { id: "f-build".into(), name: "构建与发布".into(), parent: None },
        Folder { id: "f-edge".into(), name: "边缘节点".into(), parent: Some("f-prod".into()) },
        Folder { id: "f-local".into(), name: "本机".into(), parent: None },
    ];

    let sessions = vec![
        session("s-local", "PowerShell", Some("f-local"), Protocol::Local, "", "", "本机交互式终端"),
        session("s-gw", "生产网关", Some("f-prod"), Protocol::Ssh, "10.0.12.8", "ops", "跳板机，登录后按提示二次认证"),
        session(
            "s-api-1",
            "API 节点 A",
            Some("f-prod"),
            Protocol::Ssh,
            "10.0.12.21",
            "deploy",
            "对外接口服务，部署后需重启 worker",
        ),
        session(
            "s-api-2",
            "API 节点 B",
            Some("f-prod"),
            Protocol::Ssh,
            "10.0.12.22",
            "deploy",
            "与 A 同规格，做灰度对照",
        ),
        session("s-cache", "缓存集群", Some("f-prod"), Protocol::Ssh, "10.0.12.31", "ops", "Redis 三主三从"),
        session(
            "s-edge-1",
            "边缘节点 · 华东",
            Some("f-edge"),
            Protocol::Ssh,
            "172.20.4.11",
            "edge",
            "就近接入节点",
        ),
        session("s-build", "流水线构建机", Some("f-build"), Protocol::Ssh, "10.0.20.5", "ci", "只在发布窗口使用"),
        session("s-serial", "串口调试", None, Protocol::Serial, "COM3", "", "115200 8N1"),
        session("s-telnet", "旧设备 Telnet", None, Protocol::Telnet, "10.0.30.9", "admin", "仅内网可达"),
    ];

    let palettes = vec![
        Palette {
            id: "nexterm-light".into(),
            name: "NexTerm 浅色".into(),
            background: "#ffffff".into(),
            foreground: "#24292f".into(),
            cursor: "#2563eb".into(),
            ansi: vec![
                "#24292f", "#cf222e", "#116329", "#7d4e00", "#0969da", "#8250df", "#1b7c83",
                "#6e7781", "#57606a", "#a40e26", "#1a7f37", "#9a6700", "#218bff", "#a475f9",
                "#3192aa", "#8c959f",
            ]
            .into_iter()
            .map(String::from)
            .collect(),
        },
        Palette {
            id: "nexterm-dark".into(),
            name: "NexTerm 深色".into(),
            background: "#0f141b".into(),
            foreground: "#d7dde5".into(),
            cursor: "#38bdf8".into(),
            ansi: vec![
                "#1c2430", "#f87171", "#4ade80", "#fbbf24", "#60a5fa", "#c084fc", "#22d3ee",
                "#94a3b8", "#475569", "#fca5a5", "#86efac", "#fde047", "#93c5fd", "#d8b4fe",
                "#67e8f9", "#e2e8f0",
            ]
            .into_iter()
            .map(String::from)
            .collect(),
        },
        Palette {
            id: "gruvbox".into(),
            name: "Gruvbox 复古".into(),
            background: "#282828".into(),
            foreground: "#ebdbb2".into(),
            cursor: "#fabd2f".into(),
            ansi: vec![
                "#282828", "#cc241d", "#98971a", "#d79921", "#458588", "#b16286", "#689d6a",
                "#a89984", "#928374", "#fb4934", "#b8bb26", "#fabd2f", "#83a598", "#d3869b",
                "#8ec07c", "#ebdbb2",
            ]
            .into_iter()
            .map(String::from)
            .collect(),
        },
    ];

    let rule = |p: &str, fg: &str, bg: Option<&str>, bold: bool, note: &str, regex: bool| HighlightRule {
        enabled: true,
        pattern: p.into(),
        regex,
        foreground: Some(fg.into()),
        background: bg.map(String::from),
        bold,
        underline: false,
        note: note.into(),
    };

    let highlight_sets = vec![HighlightSet {
        id: "ops-basic".into(),
        name: "运维常用".into(),
        rules: vec![
            rule(r"\b(成功|OK|PASS|done)\b", "#1a7f37", None, true, "成功提示", true),
            rule(r"\b(WARN|警告)\b", "#9a6700", None, true, "警告提示", true),
            rule(r"\b(失败|FAIL|ERROR|error)\b", "#cf222e", None, true, "错误提示", true),
            rule(
                r"\b\d{1,3}(\.\d{1,3}){3}\b",
                "#8250df",
                None,
                false,
                "IPv4 地址",
                true,
            ),
            rule(r"^(sudo|docker|kubectl|systemctl)\b", "#0969da", None, true, "常用运维命令", true),
            rule(r"\[[0-9]{2}:[0-9]{2}:[0-9]{2}\]", "#6e7781", None, false, "时间戳", true),
        ],
    }];

    Store {
        schema: SCHEMA_VERSION,
        folders,
        sessions,
        palettes,
        highlight_sets,
        settings: Settings::default(),
    }
}
