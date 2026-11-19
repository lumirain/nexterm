import { Highlighter, Plus, Trash2, ArrowUp, ArrowDown, Copy, Download, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { HighlightFile, HighlightRule, HighlightSet } from '../lib/types'
import { uid, useApp } from '../state/store'
import { Modal } from './Modal'

const EMPTY_RULE: HighlightRule = {
  enabled: true,
  pattern: '',
  regex: false,
  case_sensitive: false,
  foreground: '#cf222e',
  background: null,
  bold: true,
  italic: false,
  underline: false,
  strikeout: false,
  note: '',
}

/** 导入文件的校验用电容器：把任意 JSON 收敛成合法的 HighlightSet。 */
function sanitizeSet(raw: unknown, index: number): HighlightSet | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : `导入的集合 ${index + 1}`
  const rulesIn = Array.isArray(o.rules) ? o.rules : []
  const rules: HighlightRule[] = []
  for (const r of rulesIn) {
    if (!r || typeof r !== 'object') continue
    const x = r as Record<string, unknown>
    if (typeof x.pattern !== 'string' || !x.pattern.length) continue
    const color = (v: unknown): string | null =>
      typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null
    rules.push({
      enabled: x.enabled !== false,
      pattern: x.pattern,
      regex: x.regex === true,
      case_sensitive: x.case_sensitive === true,
      foreground: color(x.foreground) ?? '#cf222e',
      background: color(x.background),
      bold: x.bold === true,
      italic: x.italic === true,
      underline: x.underline === true,
      strikeout: x.strikeout === true,
      note: typeof x.note === 'string' ? x.note : '',
    })
  }
  // 每个导入的集合都重新分配 id，避免覆盖本地已有集合。
  return { id: uid('h'), name, rules }
}

/**
 * 突出显示集编辑器。
 *
 * 结构与参考图一致：上方选集合，下方逐条编辑关键字。改动后 500ms 自动落盘，
 * 不需要额外的"保存"按钮——桌面工具里这种两个按钮的状态最容易忘。
 */
export function HighlightDialog() {
  const app = useApp()
  const sets = app.highlightSets
  const [selectedId, setSelectedId] = useState<string>(() => {
    const sid = app.active?.session_id
    const s = app.sessions.find((x) => x.id === sid)
    return s?.highlight_set || sets[0]?.id || ''
  })
  const [row, setRow] = useState(0)
  const [draft, setDraft] = useState<HighlightSet | null>(null)

  const current = useMemo(() => sets.find((s) => s.id === selectedId) ?? null, [sets, selectedId])

  useEffect(() => {
    setDraft(current ? structuredClone(current) : null)
    setRow(0)
  }, [selectedId, current?.id])

  // 自动保存（防抖）
  useEffect(() => {
    if (!draft) return
    const t = window.setTimeout(() => {
      const original = sets.find((s) => s.id === draft.id)
      if (original && JSON.stringify(original) === JSON.stringify(draft)) return
      void app.saveHighlight(draft)
    }, 500)
    return () => window.clearTimeout(t)
  }, [draft, sets, app])

  const patchRule = (i: number, patch: Partial<HighlightRule>) => {
    setDraft((d) => {
      if (!d) return d
      const rules = d.rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r))
      return { ...d, rules }
    })
  }

  const move = (delta: number) => {
    setDraft((d) => {
      if (!d) return d
      const to = row + delta
      if (to < 0 || to >= d.rules.length) return d
      const rules = [...d.rules]
      const [item] = rules.splice(row, 1)
      rules.splice(to, 0, item)
      return { ...d, rules }
    })
    setRow((r) => Math.max(0, Math.min((draft?.rules.length ?? 1) - 1, r + delta)))
  }

  const rule = draft?.rules[row]
  const fileRef = useRef<HTMLInputElement>(null)

  // 导出当前集合（或全部集合）：自有 JSON 格式，保存到用户下载目录。
  const exportSets = (all: boolean) => {
    const picked = all ? sets : current ? [current] : []
    if (!picked.length) {
      toast.error('没有可导出的突出显示集')
      return
    }
    const payload: HighlightFile = {
      format: 'nexterm-highlight',
      version: 1,
      exported_at: Date.now(),
      sets: JSON.parse(JSON.stringify(picked)),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = all
      ? `nexterm-highlight-${new Date().toISOString().slice(0, 10)}.json`
      : `nexterm-highlight-${picked[0].name.replace(/[^\w\u4e00-\u9fa5-]+/g, '_')}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast.success(`已导出 ${picked.length} 个突出显示集`)
  }

  // 导入：接受本工具导出的 JSON；也兼容仅含 sets 数组的对象。
  const importSets = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as Record<string, unknown>
      const rawSets = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.sets)
          ? parsed.sets
          : null
      if (!rawSets) {
        toast.error('文件格式不正确：缺少 sets 数组')
        return
      }
      if (parsed.format && parsed.format !== 'nexterm-highlight') {
        toast.error('不是 NexTerm 突出显示集文件')
        return
      }
      const cleaned = rawSets
        .map((s, i) => sanitizeSet(s, i))
        .filter((s): s is HighlightSet => s !== null)
      if (!cleaned.length) {
        toast.error('文件中没有有效的突出显示集')
        return
      }
      // 逐个写入（后端 upsert 按 id 落盘），随后选中第一个导入项。
      for (const s of cleaned) await app.saveHighlight(s)
      setSelectedId(cleaned[0].id)
      const skipped = rawSets.length - cleaned.length
      toast.success(
        `已导入 ${cleaned.length} 个突出显示集${skipped > 0 ? `，跳过 ${skipped} 个无效项` : ''}`,
      )
    } catch {
      toast.error('导入失败：文件不是有效的 JSON')
    }
  }

  return (
    <Modal
      title="突出显示集"
      subtitle="规则在渲染时逐行匹配，命中即覆盖前景/背景色"
      icon={<Highlighter size={15} className="text-accent" />}
      width={880}
      height={600}
      flush
      onClose={app.closeDialog}
      footer={
        <>
          <span className="mr-auto text-[11px] text-fg-dim">
            改动会自动保存到本地 store.json
          </span>
          <button type="button" className="btn" onClick={app.closeDialog}>
            关闭
          </button>
        </>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-0">
        {/* 集合列表 */}
        <div className="flex shrink-0 border-b border-line">
          <div className="min-w-0 flex-1 p-3">
            <div className="mb-1.5 text-[11px] font-medium text-fg-dim">集</div>
            <div className="h-[116px] overflow-y-auto rounded-md border border-line-strong bg-surface">
              {sets.length === 0 && (
                <div className="px-3 py-6 text-center text-[11.5px] text-fg-dim">还没有集合</div>
              )}
              {sets.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className={`flex h-[26px] w-full items-center gap-2 px-2 text-left text-[12px] ${
                    s.id === selectedId ? 'bg-accent text-accent-fg' : 'hover:bg-hover'
                  }`}
                >
                  <Highlighter size={11} strokeWidth={2} className="shrink-0 opacity-70" />
                  <span className="truncate">{s.name}</span>
                  <span className="ml-auto text-[10px] opacity-70">{s.rules.length}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex w-[124px] shrink-0 flex-col gap-1.5 p-3 pl-0">
            <div className="mb-1.5 text-[11px] font-medium text-transparent">·</div>
            <button
              type="button"
              className="btn h-7 justify-start px-2 text-[11.5px]"
              onClick={() => {
                const s: HighlightSet = { id: uid('h'), name: '新建集合', rules: [{ ...EMPTY_RULE }] }
                void app.saveHighlight(s).then(() => setSelectedId(s.id))
              }}
            >
              <Plus size={12} strokeWidth={2.2} />
              新建
            </button>
            <button
              type="button"
              className="btn h-7 justify-start px-2 text-[11.5px]"
              disabled={!draft}
              onClick={() => {
                if (!draft) return
                const copy: HighlightSet = {
                  ...structuredClone(draft),
                  id: uid('h'),
                  name: `${draft.name} 副本`,
                }
                void app.saveHighlight(copy).then(() => setSelectedId(copy.id))
              }}
            >
              <Copy size={12} strokeWidth={2.2} />
              另存为
            </button>
            <button
              type="button"
              className="btn h-7 justify-start px-2 text-[11.5px]"
              disabled={!current}
              onClick={() => {
                if (!current) return
                void app.deleteHighlight(current.id).then(() => setSelectedId(sets[0]?.id ?? ''))
              }}
            >
              <Trash2 size={12} strokeWidth={2.2} />
              删除
            </button>
            <button
              type="button"
              className="btn h-7 justify-start px-2 text-[11.5px]"
              onClick={() => setSelectedId('')}
            >
              取消选择
            </button>
            <div className="my-0.5 h-px bg-line" />
            <button
              type="button"
              className="btn h-7 justify-start px-2 text-[11.5px]"
              disabled={!current}
              onClick={() => exportSets(false)}
              title="导出当前选中的集合"
            >
              <Download size={12} strokeWidth={2.2} />
              导出选中
            </button>
            <button
              type="button"
              className="btn h-7 justify-start px-2 text-[11.5px]"
              disabled={!sets.length}
              onClick={() => exportSets(true)}
              title="导出全部集合"
            >
              <Download size={12} strokeWidth={2.2} />
              导出全部
            </button>
            <button
              type="button"
              className="btn h-7 justify-start px-2 text-[11.5px]"
              onClick={() => fileRef.current?.click()}
              title="从 JSON 文件导入集合"
            >
              <Upload size={12} strokeWidth={2.2} />
              导入
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void importSets(f)
                e.target.value = ''
              }}
            />
          </div>
        </div>

        {/* 关键字表 */}
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col p-3">
            <div className="mb-1.5 shrink-0 text-[11px] font-medium text-fg-dim">关键字</div>
            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-line-strong">
              <table className="w-full border-collapse text-[11.5px]">
                <thead className="sticky top-0 bg-surface-2 text-left text-[10.5px] text-fg-dim">
                  <tr>
                    <th className="w-10 whitespace-nowrap px-2 py-1 font-medium">启用</th>
                    <th className="px-2 py-1 font-medium">关键字 / 正则</th>
                    <th className="w-24 px-2 py-1 font-medium">预览</th>
                    <th className="w-36 px-2 py-1 font-medium">说明</th>
                  </tr>
                </thead>
                <tbody>
                  {(draft?.rules ?? []).map((r, i) => (
                    <tr
                      key={i}
                      onClick={() => setRow(i)}
                      className={`cursor-default border-t border-line ${
                        i === row ? 'bg-accent-soft' : 'hover:bg-hover'
                      }`}
                    >
                      <td className="px-2 py-1">
                        <input
                          type="checkbox"
                          checked={r.enabled}
                          onChange={(e) => patchRule(i, { enabled: e.target.checked })}
                          className="h-3.5 w-3.5 accent-[var(--c-accent)]"
                        />
                      </td>
                      <td className="max-w-0 px-2 py-1">
                        <input
                          value={r.pattern}
                          onChange={(e) => patchRule(i, { pattern: e.target.value })}
                          className="w-full truncate rounded border border-transparent bg-transparent px-1 py-0.5 font-mono text-[11px] outline-none hover:border-line focus:border-accent focus:bg-surface"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <span
                          className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
                          style={{
                            color: r.foreground ?? undefined,
                            background: r.background ?? 'transparent',
                          }}
                        >
                          Highlight
                        </span>
                      </td>
                      <td className="px-2 py-1">
                        <input
                          value={r.note}
                          onChange={(e) => patchRule(i, { note: e.target.value })}
                          className="w-full truncate rounded border border-transparent bg-transparent px-1 py-0.5 outline-none hover:border-line focus:border-accent focus:bg-surface"
                        />
                      </td>
                    </tr>
                  ))}
                  {!draft?.rules.length && (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-[11.5px] text-fg-dim">
                        这个集合还没有关键字，点右侧「添加」新建一条。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex w-[124px] shrink-0 flex-col gap-1.5 p-3 pl-0">
            <div className="mb-1.5 text-[11px] font-medium text-transparent">·</div>
            <button
              type="button"
              className="btn h-7 justify-start px-2 text-[11.5px]"
              disabled={!draft}
              onClick={() =>
                setDraft((d) => (d ? { ...d, rules: [...d.rules, { ...EMPTY_RULE }] } : d))
              }
            >
              <Plus size={12} strokeWidth={2.2} />
              添加
            </button>
            <button
              type="button"
              className="btn h-7 justify-start px-2 text-[11.5px]"
              disabled={!rule}
              onClick={() =>
                setDraft((d) =>
                  d ? { ...d, rules: d.rules.filter((_, i) => i !== row) } : d,
                )
              }
            >
              <Trash2 size={12} strokeWidth={2.2} />
              删除
            </button>
            <button
              type="button"
              className="btn h-7 justify-start px-2 text-[11.5px]"
              disabled={!rule}
              onClick={() => move(-1)}
            >
              <ArrowUp size={12} strokeWidth={2.2} />
              上移
            </button>
            <button
              type="button"
              className="btn h-7 justify-start px-2 text-[11.5px]"
              disabled={!rule}
              onClick={() => move(1)}
            >
              <ArrowDown size={12} strokeWidth={2.2} />
              下移
            </button>
          </div>
        </div>

        {/* 选中规则的细节 */}
        {rule && (
          <div className="shrink-0 border-t border-line bg-surface-2 px-3 py-2">
            <div className="flex flex-wrap items-end gap-3">
              <label className="field w-[86px]">
                <span>前景色</span>
                <input
                  type="color"
                  value={rule.foreground ?? '#000000'}
                  onChange={(e) => patchRule(row, { foreground: e.target.value })}
                  className="h-[26px] w-full cursor-pointer rounded border border-line-strong bg-surface px-0.5"
                />
              </label>
              <label className="field w-[86px]">
                <span>背景色</span>
                <input
                  type="color"
                  value={rule.background ?? '#ffffff'}
                  onChange={(e) => patchRule(row, { background: e.target.value })}
                  className="h-[26px] w-full cursor-pointer rounded border border-line-strong bg-surface px-0.5"
                />
              </label>
              <button
                type="button"
                className="btn h-7 text-[11.5px]"
                onClick={() => patchRule(row, { background: null })}
                title="沿用终端底色"
              >
                清除背景
              </button>
              <span className="mb-1 text-[10.5px] text-fg-dim">样式</span>
              <label className="flex h-[26px] items-center gap-1.5 text-[11.5px]">
                <input type="checkbox" checked={rule.bold} onChange={(e) => patchRule(row, { bold: e.target.checked })} className="h-3.5 w-3.5 accent-[var(--c-accent)]" />
                加粗
              </label>
              <label className="flex h-[26px] items-center gap-1.5 text-[11.5px]">
                <input type="checkbox" checked={rule.italic} onChange={(e) => patchRule(row, { italic: e.target.checked })} className="h-3.5 w-3.5 accent-[var(--c-accent)]" />
                斜体
              </label>
              <label className="flex h-[26px] items-center gap-1.5 text-[11.5px]">
                <input type="checkbox" checked={rule.underline} onChange={(e) => patchRule(row, { underline: e.target.checked })} className="h-3.5 w-3.5 accent-[var(--c-accent)]" />
                下划线
              </label>
              <label className="flex h-[26px] items-center gap-1.5 text-[11.5px]">
                <input type="checkbox" checked={rule.strikeout} onChange={(e) => patchRule(row, { strikeout: e.target.checked })} className="h-3.5 w-3.5 accent-[var(--c-accent)]" />
                删除线
              </label>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-line pt-2">
              <span className="text-[10.5px] text-fg-dim">匹配</span>
              <label className="flex h-[24px] items-center gap-1.5 text-[11.5px]">
                <input type="checkbox" checked={rule.regex} onChange={(e) => patchRule(row, { regex: e.target.checked })} className="h-3.5 w-3.5 accent-[var(--c-accent)]" />
                正则表达式
              </label>
              <label className="flex h-[24px] items-center gap-1.5 text-[11.5px]">
                <input type="checkbox" checked={rule.case_sensitive} onChange={(e) => patchRule(row, { case_sensitive: e.target.checked })} className="h-3.5 w-3.5 accent-[var(--c-accent)]" />
                区分大小写
              </label>
              <span className="ml-auto text-[10px] text-fg-dim">多条命中时以上方规则优先</span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
