import { Search, ChevronLeft, ChevronRight, Copy } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { SnapRow } from '../lib/types'
import { useApp } from '../state/store'
import { Modal } from './Modal'

function rowText(row: SnapRow): string {
  let out = ''
  for (const sp of row.spans) out += sp.t
  return out.replace(/\s+$/, '')
}

interface Hit {
  row: number
  col: number
  len: number
  text: string
}

/**
 * 在终端屏幕 + 回滚缓冲中查找字符串（对齐 Xshell 的 Find String）。
 * 支持正则与大小写选项，逐条列出命中并可复制所在行。
 */
export function FindDialog() {
  const app = useApp()
  const [q, setQ] = useState('')
  const [regex, setRegex] = useState(false)
  const [caseSens, setCaseSens] = useState(false)
  const [rows, setRows] = useState<SnapRow[]>([])
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const tab = app.active

  useEffect(() => {
    inputRef.current?.focus()
    if (!tab) return
    const screen = tab.snap?.lines ?? []
    void app.apiScrollback(tab.id).then((hist) => {
      setRows([...hist, ...screen])
    }).catch(() => setRows(screen))
  }, [tab?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const hits = useMemo<Hit[]>(() => {
    if (!q) return []
    let re: RegExp
    try {
      re = regex ? new RegExp(q, caseSens ? 'g' : 'gi') : new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSens ? 'g' : 'gi')
    } catch {
      return []
    }
    const out: Hit[] = []
    for (let i = 0; i < rows.length; i++) {
      const text = rowText(rows[i])
      let m: RegExpExecArray | null
      let guard = 0
      re.lastIndex = 0
      while ((m = re.exec(text)) && guard++ < 50) {
        if (!m[0].length) { re.lastIndex++; continue }
        out.push({ row: i, col: m.index, len: m[0].length, text })
      }
    }
    return out
  }, [q, regex, caseSens, rows])

  useEffect(() => setCursor(0), [q, regex, caseSens])

  const current = hits[cursor]

  return (
    <Modal
      title="查找字符串"
      subtitle="在屏幕与回滚缓冲中搜索（正则 / 大小写）"
      icon={<Search size={15} className="text-accent" />}
      width={680}
      height={460}
      onClose={app.closeDialog}
      footer={
        <>
          <span className="mr-auto text-[11px] text-fg-dim">
            {q ? `${hits.length} 处匹配${hits.length ? ` · 第 ${cursor + 1} 处` : ''}` : '输入关键字开始查找'}
          </span>
          <button type="button" className="btn" disabled={!hits.length} onClick={() => setCursor((c) => (c - 1 + hits.length) % hits.length)}>
            <ChevronLeft size={13} /> 上一个
          </button>
          <button type="button" className="btn" disabled={!hits.length} onClick={() => setCursor((c) => (c + 1) % hits.length)}>
            下一个 <ChevronRight size={13} />
          </button>
          <button
            type="button"
            className="btn"
            disabled={!current}
            onClick={() => {
              if (current) void navigator.clipboard.writeText(current.text).then(() => toast.success('已复制该行'))
            }}
          >
            <Copy size={12} /> 复制该行
          </button>
          <button type="button" className="btn" onClick={app.closeDialog}>关闭</button>
        </>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-2">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (e.shiftKey) setCursor((c) => (c - 1 + hits.length) % hits.length)
                else setCursor((c) => (c + 1) % hits.length)
              }
            }}
            placeholder="输入关键字或正则…"
            className="h-8 flex-1 rounded border border-line-strong bg-surface px-2 text-[12px] outline-none focus:border-accent"
          />
          <label className="flex items-center gap-1.5 text-[11.5px]">
            <input type="checkbox" checked={regex} onChange={(e) => setRegex(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--c-accent)]" />
            正则
          </label>
          <label className="flex items-center gap-1.5 text-[11.5px]">
            <input type="checkbox" checked={caseSens} onChange={(e) => setCaseSens(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--c-accent)]" />
            区分大小写
          </label>
        </div>
        {regex && (() => { try { new RegExp(q); return null } catch (e) { return <div className="text-[11px] text-red-500">正则无效：{(e as Error).message}</div> } })()}
        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-line-strong bg-surface font-mono text-[11.5px]">
          {!q && <div className="px-3 py-8 text-center text-fg-dim">输入关键字，在屏幕与回滚中查找</div>}
          {q && !hits.length && <div className="px-3 py-8 text-center text-fg-dim">没有找到匹配</div>}
          {hits.map((h, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setCursor(i)}
              className={`flex w-full gap-2 border-b border-line px-2 py-1 text-left ${i === cursor ? 'bg-accent-soft' : 'hover:bg-hover'}`}
            >
              <span className="w-12 shrink-0 text-right text-fg-dim">{h.row + 1}</span>
              <span className="min-w-0 flex-1 truncate">
                {h.text.slice(0, h.col)}
                <mark className="rounded bg-amber-400/40 text-inherit">{h.text.slice(h.col, h.col + h.len)}</mark>
                {h.text.slice(h.col + h.len)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}
