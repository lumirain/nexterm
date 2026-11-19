import { Check, Palette } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../state/store'
import { Modal } from './Modal'

/**
 * 配色方案选择。
 *
 * 只读展示 + 应用，不允许就地编辑色值：色板编辑需要色轮/对比度校验，
 * 半成品反而容易让人配出看不清的组合。
 */
export function PaletteDialog() {
  const app = useApp()
  const active = app.active
  const session = app.sessions.find((s) => s.id === active?.session_id)
  const [picked, setPicked] = useState(session?.palette ?? app.palettes[0]?.id ?? '')

  const apply = async () => {
    if (!picked) return
    if (active) app.setPaletteForTab(active.id, picked)
    if (session) await app.saveSession({ ...session, palette: picked })
    app.closeDialog()
  }

  return (
    <Modal
      title="配色方案"
      subtitle="应用到当前标签；同时写回该会话，下次打开保持一致"
      icon={<Palette size={15} className="text-accent" />}
      width={720}
      onClose={app.closeDialog}
      footer={
        <>
          <span className="mr-auto text-[11px] text-fg-dim">
            共 {app.palettes.length} 套方案
          </span>
          <button type="button" className="btn" onClick={app.closeDialog}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void apply()}>
            应用
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        {app.palettes.map((p) => {
          const on = p.id === picked
          const current = (session?.palette ?? app.palettes[0]?.id) === p.id
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPicked(p.id)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                on ? 'border-accent ring-[3px] ring-accent/15' : 'border-line hover:border-line-strong'
              }`}
              style={{ background: p.background }}
            >
              <div className="mb-2 flex items-center gap-1.5">
                <span className="text-[12px] font-medium" style={{ color: p.foreground }}>
                  {p.name}
                </span>
                {current && (
                  <span
                    className="rounded px-1 py-px text-[9.5px]"
                    style={{ background: p.foreground, color: p.background }}
                  >
                    当前
                  </span>
                )}
                {on && <Check size={13} className="ml-auto" style={{ color: p.foreground }} />}
              </div>
              <div className="grid grid-cols-8 gap-1">
                {p.ansi.map((c, i) => (
                  <span
                    key={i}
                    className="h-3.5 rounded-[2px]"
                    style={{ background: c }}
                    title={c}
                  />
                ))}
              </div>
              <div
                className="mt-2 truncate font-mono text-[10.5px]"
                style={{ color: p.foreground }}
              >
                bg {p.background} · fg {p.foreground}
              </div>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
