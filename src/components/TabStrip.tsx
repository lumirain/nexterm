import { Cable, Network, Plus, Server, Terminal, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Protocol } from '../lib/types'
import { useApp } from '../state/store'

const ICON: Record<Protocol, typeof Server> = {
  ssh: Server,
  local: Terminal,
  telnet: Network,
  serial: Cable,
}

const TINT: Record<Protocol, string> = {
  ssh: 'text-sky-500',
  local: 'text-slate-500 dark:text-slate-400',
  telnet: 'text-amber-500',
  serial: 'text-violet-500',
}

/** 选项卡栏：新建、切换、关闭、右键菜单。 */
export function TabStrip() {
  const app = useApp()
  const [ctx, setCtx] = useState<{ x: number; y: number; id: number } | null>(null)

  useEffect(() => {
    if (!ctx) return
    const close = () => setCtx(null)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [ctx])

  return (
    <div className="flex h-9 shrink-0 items-stretch gap-1 border-b border-line bg-app px-1.5 pt-1">
      <div className="flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto">
        {app.tabs.map((t) => {
          const session = app.sessions.find((s) => s.id === t.session_id)
          const proto = session?.protocol ?? 'ssh'
          const Icon = ICON[proto]
          const active = t.id === app.activeId
          const live = t.state.startsWith('已连接')
          return (
            <div
              key={t.id}
              onMouseDown={() => app.activate(t.id)}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault()
                  void app.closeTab(t.id)
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                setCtx({ x: e.clientX, y: e.clientY, id: t.id })
              }}
              title={`${t.title}\n${t.note}`}
              className={`group flex h-8 min-w-[132px] max-w-[240px] shrink-0 cursor-default items-center gap-1.5 rounded-t-md border border-b-0 px-2.5 ${
                active
                  ? 'border-line bg-surface text-fg'
                  : 'border-transparent text-fg-dim hover:bg-hover'
              }`}
            >
              <Icon size={12} className={`shrink-0 ${TINT[proto]}`} strokeWidth={2} />
              <span className="truncate text-[12px]">{t.title}</span>
              <span
                className={`ml-0.5 h-[5px] w-[5px] shrink-0 rounded-full ${
                  live ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <button
                type="button"
                title="关闭选项卡"
                onClick={(e) => {
                  e.stopPropagation()
                  void app.closeTab(t.id)
                }}
                className="ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-0 hover:bg-black/10 group-hover:opacity-100 dark:hover:bg-white/15"
              >
                <X size={11} strokeWidth={2.4} />
              </button>
            </div>
          )
        })}

        <button
          type="button"
          title="新建选项卡 (Ctrl+Shift+N)"
          onClick={() => app.runCommand('tab.new')}
          className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center self-center rounded text-fg-dim hover:bg-hover hover:text-fg"
        >
          <Plus size={14} strokeWidth={2.2} />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1 pb-1 text-[10.5px] text-fg-dim">
        <span className="tabular-nums">
          {app.tabs.length ? `${app.tabs.findIndex((t) => t.id === app.activeId) + 1}/${app.tabs.length}` : '0/0'}
        </span>
      </div>

      {ctx && (
        <div
          className="popover animate-pop fixed min-w-[176px]"
          style={{ left: ctx.x, top: ctx.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {[
            { label: '关闭', run: () => void app.closeTab(ctx.id) },
            { label: '关闭其他选项卡', run: () => void app.closeOthers(ctx.id) },
            { label: '关闭所有选项卡', run: () => void app.closeAll() },
          ].map((it) => (
            <button
              key={it.label}
              type="button"
              className="popover-item"
              onClick={() => {
                it.run()
                setCtx(null)
              }}
            >
              <span className="popover-gutter" />
              {it.label}
            </button>
          ))}
          <div className="popover-sep" />
          <button
            type="button"
            className="popover-item"
            onClick={() => {
              app.activate(ctx.id)
              app.openDialog({ kind: 'palette' })
              setCtx(null)
            }}
          >
            <span className="popover-gutter" />
            设置配色…
          </button>
        </div>
      )}
    </div>
  )
}
