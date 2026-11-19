import { ChevronUp, Copy, RefreshCw, Scissors, Search, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { applyRules } from '../lib/highlight'
import { keyToBytes } from '../lib/keys'
import type { Span, Tab } from '../lib/types'
import { emitTermCommand, onTermCommand } from '../lib/termBus'
import { useApp } from '../state/store'

const LINE_RATIO = 1.28

/** 判断是否东亚宽字符（需要占两格）。 */
function isWide(ch: string): boolean {
  const u = ch.codePointAt(0) ?? 0
  return (
    (u >= 0x1100 && u <= 0x115f) ||
    (u >= 0x2e80 && u <= 0xa4cf) ||
    (u >= 0xac00 && u <= 0xd7a3) ||
    (u >= 0xf900 && u <= 0xfaff) ||
    (u >= 0xfe30 && u <= 0xfe6f) ||
    (u >= 0xff00 && u <= 0xff60) ||
    (u >= 0xffe0 && u <= 0xffe6) ||
    (u >= 0x1f300 && u <= 0x1faff)
  )
}

/** 把一行的 spans 展开成视觉格子数组；宽字符占两格（第二格为空占位）。 */
function rowCells(spans: Span[]): string[] {
  const out: string[] = []
  for (const sp of spans) {
    for (const ch of sp.t) {
      out.push(ch)
      if (isWide(ch)) out.push('')
    }
  }
  return out
}

type Point = { row: number; col: number }

function order(a: Point, b: Point): [Point, Point] {
  if (a.row < b.row || (a.row === b.row && a.col <= b.col)) return [a, b]
  return [b, a]
}

/**
 * 终端视图。
 *
 * 把后端给的网格画出来、把按键送回去；额外支持鼠标选区复制、回滚查看、
 * 右键菜单，字号取自会话设置（与 Xshell 的字体设置一致）。
 */
export function TerminalPane({ tab }: { tab: Tab }) {
  const app = useApp()
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const session = app.sessions.find((x) => x.id === tab.session_id)
  const fontSize = Math.max(8, Math.min(32, session?.font_size || 14))
  const [cell, setCell] = useState({ w: 8, h: fontSize * LINE_RATIO })
  const lastSize = useRef({ cols: 0, rows: 0 })

  const [anchor, setAnchor] = useState<Point | null>(null)
  const [focus, setFocus] = useState<Point | null>(null)
  const [dragging, setDragging] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  // 回滚查看：向上滚动时从后端拉取历史行
  const [history, setHistory] = useState<import('../lib/types').SnapRow[]>([])
  const [backLines, setBackLines] = useState(0) // 从底部往上回看的行数
  const historyRef = useRef<import('../lib/types').SnapRow[]>([])
  historyRef.current = history

  // 测量等宽字符尺寸（字号变化时重新测量）
  useLayoutEffect(() => {
    const probe = document.createElement('span')
    const css = getComputedStyle(document.body)
    probe.style.cssText = [
      'position:absolute',
      'visibility:hidden',
      'white-space:pre',
      `font-family:${css.getPropertyValue('--font-mono') || 'monospace'}`,
      `font-size:${fontSize}px`,
    ].join(';')
    probe.textContent = '0'.repeat(60)
    document.body.appendChild(probe)
    const w = probe.getBoundingClientRect().width / 60
    probe.remove()
    if (w > 0) setCell({ w, h: fontSize * LINE_RATIO })
    lastSize.current = { cols: 0, rows: 0 } // 字号变了要重新同步网格
  }, [fontSize])

  const syncSize = useCallback(() => {
    const el = boxRef.current
    if (!el || !cell.w || !cell.h) return
    const cols = Math.max(20, Math.floor((el.clientWidth - 12) / cell.w))
    const rows = Math.max(2, Math.floor((el.clientHeight - 8) / cell.h))
    if (lastSize.current.cols === cols && lastSize.current.rows === rows) return
    lastSize.current = { cols, rows }
    app.resizeTerm(tab.id, cols, rows)
  }, [app, cell.w, cell.h, tab.id])

  useEffect(() => {
    syncSize()
    const ro = new ResizeObserver(syncSize)
    if (boxRef.current) ro.observe(boxRef.current)
    return () => ro.disconnect()
  }, [syncSize])

  useEffect(() => {
    inputRef.current?.focus()
  }, [tab.id])

  const snap = tab.snap
  const bg = snap?.bg ?? undefined
  const fg = snap?.fg ?? undefined
  const cursor = snap?.cursor
  const disconnected = tab.state.startsWith('已断开')
  const rules = app.highlightSets.find((h) => h.id === session?.highlight_set)?.rules ?? []
  const historyLen = snap?.history_len ?? 0

  // 拉取回滚历史（只在首次向上滚动且尚未拉取时）
  const loadHistory = useCallback(async () => {
    if (historyRef.current.length || !historyLen) return
    try {
      const rows = await app.apiScrollback(tab.id)
      historyRef.current = rows
      setHistory(rows)
    } catch {
      toast.error('读取回滚缓冲失败')
    }
  }, [app, tab.id, historyLen])

  // ---- 选区文本计算 ----
  const lines = snap?.lines ?? []
  const selectedText = useCallback((): string => {
    if (!anchor || !focus) return ''
    const [a, b] = order(anchor, focus)
    const rows = backLines > 0 && history.length ? history : lines
    const parts: string[] = []
    for (let r = a.row; r <= b.row && r < rows.length; r++) {
      const cells = rowCells(rows[r].spans)
      const from = r === a.row ? a.col : 0
      const to = r === b.row ? b.col : cells.length - 1
      let line = ''
      for (let c = from; c <= to && c < cells.length; c++) line += cells[c]
      parts.push(line.replace(/\s+$/, ''))
    }
    return parts.join('\n')
  }, [anchor, focus, lines, history, backLines])

  const copySelection = useCallback(() => {
    const text = selectedText()
    if (!text) {
      toast.info('没有选中任何文本')
      return
    }
    void navigator.clipboard.writeText(text).then(
      () => toast.success(`已复制 ${text.length} 个字符`),
      () => toast.error('复制到剪贴板失败'),
    )
  }, [selectedText])

  const selectAll = useCallback(() => {
    const rows = lines.length ? lines : []
    if (!rows.length) return
    setAnchor({ row: 0, col: 0 })
    setFocus({ row: rows.length - 1, col: Math.max(0, rowCells(rows[rows.length - 1].spans).length - 1) })
  }, [lines])

  // 订阅菜单/快捷键命令
  useEffect(() => {
    return onTermCommand((cmd) => {
      if (cmd.kind === 'copy') copySelection()
      else if (cmd.kind === 'selectAll') selectAll()
      else if (cmd.kind === 'clearSelection') {
        setAnchor(null)
        setFocus(null)
      }
    })
  }, [copySelection, selectAll])

  // ---- 鼠标坐标 → 字符网格 ----
  const pointAt = (clientX: number, clientY: number): Point => {
    const el = boxRef.current
    if (!el) return { row: 0, col: 0 }
    const rect = el.getBoundingClientRect()
    const col = Math.max(0, Math.min(400, Math.floor((clientX - rect.left - 6) / cell.w)))
    const baseRow = Math.floor((clientY - rect.top - 4) / cell.h)
    const row = Math.max(0, Math.min(lines.length - 1, backLines > 0 ? baseRow - backLines : baseRow))
    return { row, col }
  }

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    setMenu(null)
    const p = pointAt(e.clientX, e.clientY)
    if (e.detail === 2) {
      // 双击选词
      const cells = rowCells((backLines > 0 && history.length ? history : lines)[p.row]?.spans ?? [])
      let s = Math.min(p.col, cells.length - 1), t = s
      const word = /\w/
      while (s > 0 && word.test(cells[s - 1] ?? '')) s--
      while (t < cells.length - 1 && word.test(cells[t + 1] ?? '')) t++
      setAnchor({ row: p.row, col: s })
      setFocus({ row: p.row, col: t })
      return
    }
    if (e.detail === 3) {
      // 三击选整行
      const cells = rowCells((backLines > 0 && history.length ? history : lines)[p.row]?.spans ?? [])
      setAnchor({ row: p.row, col: 0 })
      setFocus({ row: p.row, col: Math.max(0, cells.length - 1) })
      return
    }
    setAnchor(p)
    setFocus(p)
    setDragging(true)
    inputRef.current?.focus()
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return
    setFocus(pointAt(e.clientX, e.clientY))
  }

  useEffect(() => {
    const up = () => setDragging(false)
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  const onWheel = (e: React.WheelEvent) => {
    if (!historyLen) return
    if (e.deltaY < 0) {
      // 向上滚动：首次拉取历史，然后按行回看
      void loadHistory().then(() => {
        setBackLines((n) => Math.min(historyRef.current.length, n + 3))
      })
    } else if (backLines > 0) {
      setBackLines((n) => Math.max(0, n - 3))
    }
  }

  const renderRows = backLines > 0 && history.length ? history : lines
  const visibleStart = backLines > 0 && history.length ? Math.max(0, history.length - backLines) : 0
  const visibleCount = backLines > 0 && history.length ? Math.min(lines.length, backLines) : lines.length

  // 选区范围（用于反色）
  let selRange: [Point, Point] | null = null
  if (anchor && focus) selRange = order(anchor, focus)

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" style={{ background: bg }}>
      {backLines > 0 && (
        <div className="flex shrink-0 items-center gap-1 border-b border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10.5px] text-amber-700 dark:text-amber-300">
          <ChevronUp size={11} /> 正在查看回滚历史（{backLines} 行）
          <button className="ml-auto underline" onClick={() => setBackLines(0)}>回到最新</button>
        </div>
      )}
      <div
        ref={boxRef}
        className="term-surface min-h-0 flex-1 overflow-hidden px-1.5 py-1 outline-none select-none"
        style={{ color: fg, fontSize, lineHeight: LINE_RATIO }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onWheel={onWheel}
        onClick={() => inputRef.current?.focus()}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY })
        }}
      >
        {Array.from({ length: visibleCount }, (_, k) => {
          const y = visibleStart + k
          const row = renderRows[y]
          if (!row) return <div key={k} className="term-line">&nbsp;</div>
          const styled = applyRules(row.spans, rules)
          return (
            <div key={y} className="term-line">
              <SelectionRow
                spans={styled}
                rowIndex={y - visibleStart}
                selRange={selRange}
                cursorX={cursor?.visible && backLines === 0 && cursor.y === y ? cursor.x : -1}
              />
            </div>
          )
        })}
      </div>

      <input
        ref={inputRef}
        aria-label="终端输入"
        data-term="true"
        className="absolute bottom-0 left-0 h-px w-px opacity-0"
        onKeyDown={(e) => {
          if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'c') {
            e.preventDefault()
            copySelection()
            return
          }
          if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'v') {
            e.preventDefault()
            void navigator.clipboard.readText().then((t) => t && app.sendData(tab.id, t))
            return
          }
          if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
            e.preventDefault()
            selectAll()
            return
          }
          const data = keyToBytes(e)
          if (data !== null) {
            e.preventDefault()
            app.sendData(tab.id, data)
          }
        }}
        onPaste={(e) => {
          const text = e.clipboardData.getData('text')
          if (text) {
            e.preventDefault()
            app.sendData(tab.id, text.replace(/\r?\n/g, '\r'))
          }
        }}
      />

      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          <div
            className="fixed z-50 min-w-[132px] rounded-md border border-line-strong bg-surface p-1 text-[12px] shadow-xl"
            style={{ left: menu.x, top: menu.y }}
          >
            <MenuButton icon={<Copy size={12} />} label="复制" onClick={() => { copySelection(); setMenu(null) }} />
            <MenuButton icon={<Scissors size={12} />} label="全选" onClick={() => { selectAll(); setMenu(null) }} />
            <MenuButton icon={<Search size={12} />} label="查找" onClick={() => { emitTermCommand({ kind: 'find' }); setMenu(null) }} />
            <div className="my-1 h-px bg-line" />
            <MenuButton label="粘贴" onClick={() => {
              void navigator.clipboard.readText().then((t) => t && app.sendData(tab.id, t)).catch(() => toast.error('无法读取剪贴板'))
              setMenu(null)
            }} />
            <MenuButton label="清屏" onClick={() => { app.sendData(tab.id, '\x0c'); setMenu(null) }} />
          </div>
        </>
      )}

      {disconnected && (
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 border-t border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11.5px] text-amber-700 dark:text-amber-300">
          <TriangleAlert size={13} strokeWidth={2} />
          会话已结束（{tab.state}）
          <button
            type="button"
            className="btn ml-auto h-6 gap-1 px-2 text-[11px]"
            onClick={() => void app.openSession(tab.session_id)}
          >
            <RefreshCw size={11} strokeWidth={2} />
            重新连接
          </button>
        </div>
      )}
    </div>
  )
}

function MenuButton({ icon, label, onClick }: { icon?: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 w-full items-center gap-2 rounded px-2 text-left hover:bg-accent hover:text-accent-fg"
    >
      {icon && <span className="opacity-70">{icon}</span>}
      {label}
    </button>
  )
}

/**
 * 一行渲染：按「样式变化 / 宽字符 / 光标 / 选中」切段。选中的格子用反色显示。
 */
function SelectionRow({
  spans,
  rowIndex,
  selRange,
  cursorX,
}: {
  spans: Span[]
  rowIndex: number
  selRange: [Point, Point] | null
  cursorX: number
}) {
  const inSel = (col: number) =>
    !!selRange &&
    (rowIndex > selRange[0].row || (rowIndex === selRange[0].row && col >= selRange[0].col)) &&
    (rowIndex < selRange[1].row || (rowIndex === selRange[1].row && col <= selRange[1].col))

  // 先按 span 生成每格样式，再叠加选中反色与光标
  const nodes: React.ReactNode[] = []
  let idx = 0
  let key = 0
  let run = ''
  let runStyle: React.CSSProperties | null = null
  let runWide = false

  const styleFor = (sp: Span, selected: boolean, isCursor: boolean): React.CSSProperties => {
    let color = sp.fg
    let background = sp.bg
    if (selected) {
      color = sp.bg || '#000'
      background = sp.fg || '#fff'
    }
    if (isCursor) {
      color = background || '#000'
      background = color || '#fff'
    }
    return {
      color,
      background,
      fontWeight: sp.b ? 600 : 400,
      fontStyle: sp.i ? 'italic' : 'normal',
      textDecoration: sp.u ? 'underline' : sp.s ? 'line-through' : 'none',
    }
  }

  const flush = () => {
    if (!run) return
    nodes.push(
      <span key={key++} className={runWide ? 'term-wide' : ''} style={runStyle ?? {}}>
        {run}
      </span>,
    )
    run = ''
  }

  for (const sp of spans) {
    for (const ch of sp.t) {
      const wide = isWide(ch)
      const selected = inSel(idx)
      const isCursor = idx === cursorX
      const st = styleFor(sp, selected, isCursor)
      const same = runStyle && JSON.stringify(st) === JSON.stringify(runStyle) && wide === runWide
      if (!same) {
        flush()
        runStyle = st
        runWide = wide
      }
      run += ch
      idx += wide ? 2 : 1 // 宽字符占两格，与光标/选区坐标一致
    }
  }
  flush()
  if (cursorX >= idx && cursorX >= 0) {
    nodes.push(<span key={key++} className="term-cursor"> </span>)
  }
  return <>{nodes}</>
}
