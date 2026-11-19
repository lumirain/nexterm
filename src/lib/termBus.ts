/**
 * 终端窗格与全局菜单之间的轻量事件总线。
 *
 * 菜单（编辑 → 复制/全选）需要作用到"当前聚焦的终端窗格"，但选区状态属于
 * 终端组件内部（按字符网格坐标计算），放进全局 store 会让每次鼠标拖动都触发
 * 整棵树重渲染。这里用一个只承载命令的类型化总线，终端窗格自行订阅。
 */

export type TermCommand =
  | { kind: 'copy' }
  | { kind: 'selectAll' }
  | { kind: 'clearSelection' }
  | { kind: 'find' }

type Listener = (cmd: TermCommand) => void

const listeners = new Set<Listener>()

export function onTermCommand(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function emitTermCommand(cmd: TermCommand): void {
  for (const fn of listeners) fn(cmd)
}
