import { RefreshCw, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { applyRules } from '../lib/highlight'
import { keyToBytes } from '../lib/keys'
import type { Span, Tab } from '../lib/types'
import { useApp } from '../state/store'

const FONT_SIZE = 13
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

/**
 * 终端视图。
 *
 * 只做两件事：把后端给的网格画出来、把按键送回去。尺寸变化时测量字符宽高，
 * 反算出列数行数同步给 PTY——这样 `vim`、`top` 这类全屏程序能正确铺满。
 */
export function TerminalPane({ tab }: { tab: Tab }) {
  const app = useApp()
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [cell, setCell] = useState({ w: 8, h: FONT_SIZE * LINE_RATIO })
  const lastSize = useRef({ cols: 0, rows: 0 })

  // 测量等宽字符尺寸
  useLayoutEffect(() => {
    const probe = document.createElement('span')
    const css = getComputedStyle(document.body)
    probe.style.cssText = [
      'position:absolute',
      'visibility:hidden',
      'white-space:pre',
      `font-family:${css.getPropertyValue('--font-mono') || 'monospace'}`,
      `font-size:${FONT_SIZE}px`,
    ].join(';')
    probe.textContent = '0'.repeat(60)
    document.body.appendChild(probe)
    const w = probe.getBoundingClientRect().width / 60
    probe.remove()
    if (w > 0) setCell({ w, h: FONT_SIZE * LINE_RATIO })
  }, [])

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

  const session = app.sessions.find((x) => x.id === tab.session_id)
  const rules = app.highlightSets.find((h) => h.id === session?.highlight_set)?.rules ?? []
  const snap = tab.snap
  const bg = snap?.bg ?? undefined
  const fg = snap?.fg ?? undefined
  const cursor = snap?.cursor
  const disconnected = tab.state.startsWith('已断开')

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" style={{ background: bg }}>
      <div
        ref={boxRef}
        onClick={() => inputRef.current?.focus()}
        className="term-surface min-h-0 flex-1 overflow-hidden px-1.5 py-1 outline-none"
        style={{ color: fg }}
      >
        {snap?.lines.map((row, y) => {
          const styled = applyRules(row.spans, rules)
          return (
            <div key={y} className="term-line">
              <Row spans={styled} cursorX={cursor?.visible && cursor.y === y ? cursor.x : -1} />
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
          const data = keyToBytes(e)
          if (data !== null) {
            e.preventDefault()
            app.sendData(tab.id, data)
          } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'c') {
            e.preventDefault()
            document.execCommand('copy')
          } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'v') {
            e.preventDefault()
            void navigator.clipboard.readText().then((t) => t && app.sendData(tab.id, t))
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

/**
 * 一行内容的渲染。
 *
 * 为了既保证 ASCII 成段（节点少），又让 CJK 严格占两格、光标能落在正确位置，
 * 这里按"样式变化 / 宽字符 / 光标"三个条件切段。
 */
function Row({ spans, cursorX }: { spans: Span[]; cursorX: number }) {
  const nodes: React.ReactNode[] = []
  let cellIdx = 0
  let key = 0

  const push = (text: string, sp: Span, wide: boolean, isCursor: boolean) => {
    if (!text) return
    const style: React.CSSProperties = {
      color: sp.fg,
      background: sp.bg,
      fontWeight: sp.b ? 600 : 400,
      fontStyle: sp.i ? 'italic' : 'normal',
      textDecoration: sp.u ? 'underline' : sp.s ? 'line-through' : 'none',
    }
    nodes.push(
      <span
        key={key++}
        className={`${wide ? 'term-wide ' : ''}${isCursor ? 'term-cursor' : ''}`}
        style={style}
      >
        {text}
      </span>,
    )
  }

  for (const sp of spans) {
    let run = ''
    let runCursor = false
    for (const ch of sp.t) {
      const wide = isWide(ch)
      const isCursor = cellIdx === cursorX
      if (wide) {
        push(run, sp, false, runCursor)
        run = ''
        push(ch, sp, true, isCursor)
        cellIdx += 2
        runCursor = false
        continue
      }
      if (isCursor) {
        push(run, sp, false, runCursor)
        run = ''
        runCursor = true
      }
      run += ch
      cellIdx += 1
    }
    push(run, sp, false, runCursor)
  }

  // 光标停在行尾时需要补一个占位块，否则看不到插入点
  if (cursorX >= cellIdx && cursorX >= 0) {
    nodes.push(<span key={key++} className="term-cursor"> </span>)
  }

  return <>{nodes}</>
}
