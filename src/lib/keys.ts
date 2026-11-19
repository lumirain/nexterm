/** 键盘事件 → 终端字节序列。只覆盖常见键，足够日常 shell 使用。 */

const ARROWS: Record<string, string> = {
  ArrowUp: '\x1b[A',
  ArrowDown: '\x1b[B',
  ArrowRight: '\x1b[C',
  ArrowLeft: '\x1b[D',
  Home: '\x1b[H',
  End: '\x1b[F',
  Insert: '\x1b[2~',
  Delete: '\x1b[3~',
  PageUp: '\x1b[5~',
  PageDown: '\x1b[6~',
  Escape: '\x1b',
  Backspace: '\x7f',
  Enter: '\r',
  Tab: '\t',
}

const FKEYS: Record<string, string> = {
  F1: '\x1bOP',
  F2: '\x1bOQ',
  F3: '\x1bOR',
  F4: '\x1bOS',
  F5: '\x1b[15~',
  F6: '\x1b[17~',
  F7: '\x1b[18~',
  F8: '\x1b[19~',
  F9: '\x1b[20~',
  F10: '\x1b[21~',
  F11: '\x1b[23~',
  F12: '\x1b[24~',
}

/**
 * 返回应当发给 PTY 的字符串；返回 `null` 表示交给浏览器默认行为。
 *
 * Ctrl 组合按 ASCII 控制符处理（Ctrl+A → 0x01）。Ctrl+Shift 留给应用快捷键
 * （复制/粘贴/关闭标签），因此这里直接放行。
 */
export function keyToBytes(e: React.KeyboardEvent): string | null {
  if (e.altKey && e.key === 'ArrowLeft') return '\x1bb'
  if (e.altKey && e.key === 'ArrowRight') return '\x1bf'

  if (FKEYS[e.key]) return FKEYS[e.key]
  if (ARROWS[e.key] !== undefined) return ARROWS[e.key]

  if (e.ctrlKey && !e.shiftKey && !e.altKey) {
    const k = e.key.toLowerCase()
    if (k.length === 1 && k >= 'a' && k <= 'z') {
      return String.fromCharCode(k.charCodeAt(0) - 96)
    }
    if (e.key === '[') return '\x1b'
    if (e.key === '\\') return '\x1c'
    if (e.key === ']') return '\x1d'
    if (e.key === ' ') return '\x00'
  }

  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) return e.key

  return null
}

export const SHORTCUTS: { keys: string; label: string; cmd: string }[] = [
  { keys: 'Ctrl+N', label: '新建会话', cmd: 'file.new' },
  { keys: 'Ctrl+O', label: '打开选中会话', cmd: 'file.open' },
  { keys: 'Ctrl+Shift+D', label: '断开连接', cmd: 'file.disconnect' },
  { keys: 'Ctrl+Shift+R', label: '重新连接', cmd: 'file.reconnect' },
  { keys: 'Ctrl+W', label: '关闭选项卡', cmd: 'tab.close' },
  { keys: 'Ctrl+Shift+N', label: '新建选项卡', cmd: 'tab.new' },
  { keys: 'Ctrl+Tab', label: '下一个选项卡', cmd: 'win.next' },
  { keys: 'Ctrl+Shift+Tab', label: '上一个选项卡', cmd: 'win.prev' },
  { keys: 'Ctrl+Shift+S', label: '显示/隐藏会话面板', cmd: 'view.panel' },
  { keys: 'Ctrl+L', label: '清屏', cmd: 'edit.clear' },
  { keys: 'F11', label: '全屏', cmd: 'view.fullscreen' },
]
