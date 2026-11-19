/** 与 Rust 端 `model.rs` 一一对应的前端类型。字段名保持一致，避免映射层。 */

export type Protocol = 'local' | 'ssh' | 'telnet' | 'serial'

export interface Session {
  id: string
  name: string
  folder: string | null
  protocol: Protocol
  host: string
  port: number
  user: string
  description: string
  palette: string
  font_size: number
  cols: number
  rows: number
  highlight_set: string
  keepalive: number
  reconnect: boolean
  retry_interval: number
  retry_limit: number
  terminal_type: string
  encoding: string
  /** 认证方式：password（默认）/ keyboard-interactive */
  auth_method: string
  /** 记住密码开关。密码本体存系统凭据库，不进 store.json */
  save_password: boolean
  created_at: number
}

export interface Folder {
  id: string
  name: string
  parent: string | null
}

export interface Palette {
  id: string
  name: string
  background: string
  foreground: string
  cursor: string
  ansi: string[]
}

export interface HighlightRule {
  enabled: boolean
  pattern: string
  regex: boolean
  /** Xshell 的 Case Sensitive：true=区分大小写，false=忽略大小写 */
  case_sensitive: boolean
  foreground: string | null
  background: string | null
  bold: boolean
  italic: boolean
  underline: boolean
  strikeout: boolean
  note: string
}

/** 突出显示集的导入/导出文件格式（本项目自有格式，非任何第三方格式） */
export interface HighlightFile {
  format: 'nexterm-highlight'
  version: number
  exported_at: number
  sets: HighlightSet[]
}

export interface HighlightSet {
  id: string
  name: string
  rules: HighlightRule[]
}

export interface Settings {
  theme: 'light' | 'dark'
  accent: 'blue' | 'violet' | 'teal' | 'amber'
  show_toolbar: boolean
  show_statusbar: boolean
  show_panel: boolean
  panel_width: number
}

export interface Store {
  schema: number
  folders: Folder[]
  sessions: Session[]
  palettes: Palette[]
  highlight_sets: HighlightSet[]
  settings: Settings
}

/** 渲染快照里的一段同色文本 */
export interface Span {
  t: string
  fg: string
  bg: string
  b: boolean
  i: boolean
  u: boolean
  s: boolean
}

export interface SnapRow {
  spans: Span[]
}

export interface Snapshot {
  ok: boolean
  rev: number
  unchanged: boolean
  state: string
  note: string
  title: string
  cols: number
  rows: number
  sent: number
  history_len: number
  cursor: { x: number; y: number; visible: boolean }
  bg: string
  fg: string
  lines: SnapRow[]
}

export interface TabInfo {
  id: number
  title: string
  session_id: string
  state: string
  note: string
  cols: number
  rows: number
}

export interface AppInfo {
  name: string
  version: string
  data_dir: string
  store_file: string
}

/** 界面上打开的标签：运行态信息 + 最近一次快照 */
export interface Tab extends TabInfo {
  snap: Snapshot | null
}
