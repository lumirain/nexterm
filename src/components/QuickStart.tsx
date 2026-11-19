import {
  ArrowRight,
  Cable,
  Network,
  Plus,
  Server,
  Terminal,
  Zap,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { Protocol, Session } from '../lib/types'
import { useApp } from '../state/store'

const PROTO: Record<Protocol, { label: string; icon: typeof Server; chip: string }> = {
  ssh: { label: 'SSH', icon: Server, chip: 'bg-sky-500/12 text-sky-600 dark:text-sky-400' },
  local: {
    label: '本地',
    icon: Terminal,
    chip: 'bg-slate-500/12 text-slate-600 dark:text-slate-300',
  },
  telnet: {
    label: 'TELNET',
    icon: Network,
    chip: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
  },
  serial: {
    label: '串口',
    icon: Cable,
    chip: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
  },
}

/**
 * 起始页。
 *
 * 结构沿用截图里的"标题 + 搜索框 + 卡片网格"，但卡片信息密度做了调整：
 * 协议、主机、分组都直接可见，避免只显示一个名字导致无从判断。
 */
export function QuickStart() {
  const app = useApp()
  const [q, setQ] = useState('')

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return app.sessions
    return app.sessions.filter(
      (s) =>
        s.name.toLowerCase().includes(needle) ||
        s.host.toLowerCase().includes(needle) ||
        s.protocol.includes(needle),
    )
  }, [app.sessions, q])

  const openFirst = () => {
    if (!q.trim()) return
    const hit = list[0]
    if (hit) void app.openSession(hit.id)
    else toast.info('没有匹配的会话，可点「新建」创建')
  }

  return (
    <div className="h-full overflow-y-auto bg-app">
      <div className="mx-auto w-full max-w-[1000px] px-8 pb-12 pt-[7vh]">
        <div className="mb-1 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Zap size={18} strokeWidth={2.2} fill="currentColor" className="opacity-90" />
          </span>
          <h1 className="text-[26px] font-semibold tracking-tight">Quick Start</h1>
        </div>
        <p className="mb-5 pl-[42px] text-[12.5px] text-fg-dim">
          双击左侧会话，或直接输入主机地址回车新建一次临时连接。
        </p>

        <div className="flex items-stretch gap-2">
          <div className="flex h-10 flex-1 items-center rounded-lg border border-line-strong bg-surface px-3 shadow-sm focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent/15">
            <SearchInline />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && openFirst()}
              placeholder="主机、IP 地址或会话名称"
              className="h-full w-full bg-transparent px-2 text-[13px] outline-none placeholder:text-fg-dim"
            />
            <kbd className="rounded border border-line px-1.5 py-px text-[10px] text-fg-dim">
              Enter
            </kbd>
          </div>
          <button
            type="button"
            onClick={openFirst}
            disabled={!q.trim()}
            className="btn btn-primary h-10 px-5 disabled:opacity-45"
          >
            连接
            <ArrowRight size={14} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={() => app.openDialog({ kind: 'session', isNew: true })}
            className="btn h-10 gap-1.5 px-4"
            title="新建会话"
          >
            <Plus size={14} strokeWidth={2.2} />
            新建
          </button>
        </div>

        <div className="mt-7 mb-3 flex items-center gap-2">
          <span className="text-[12px] font-semibold">全部会话</span>
          <span className="text-[11px] text-fg-dim">{list.length}</span>
          <div className="ml-auto h-px flex-1 bg-line" />
        </div>

        {list.length ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2.5">
            {list.map((s) => (
              <Card key={s.id} session={s} />
            ))}
          </div>
        ) : (
          <div className="card flex flex-col items-center gap-2 py-10 text-center">
            <span className="text-[12.5px] text-fg-dim">
              没有匹配的会话
            </span>
            <button
              type="button"
              onClick={() => app.openDialog({ kind: 'session', isNew: true })}
              className="btn btn-primary h-7 text-[12px]"
            >
              新建会话
            </button>
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-1.5 text-[11px] text-fg-dim">
          <Hint keys="Ctrl+N" text="新建会话" />
          <Hint keys="Ctrl+O" text="打开选中会话" />
          <Hint keys="Ctrl+W" text="关闭当前选项卡" />
          <Hint keys="Ctrl+Tab" text="切换选项卡" />
        </div>
      </div>
    </div>
  )
}

function Hint({ keys, text }: { keys: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <kbd className="rounded border border-line bg-surface px-1.5 py-px font-mono text-[10px]">
        {keys}
      </kbd>
      {text}
    </span>
  )
}

function SearchInline() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0 text-fg-dim">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function Card({ session }: { session: Session }) {
  const app = useApp()
  const meta = PROTO[session.protocol]
  const Icon = meta.icon
  const folder = app.folders.find((f) => f.id === session.folder)

  return (
    <button
      type="button"
      onClick={() => void app.openSession(session.id)}
      onContextMenu={(e) => {
        e.preventDefault()
        app.select(session.id)
        app.openDialog({ kind: 'session', sessionId: session.id })
      }}
      className="group card flex flex-col items-start gap-2 p-3 text-left transition-all hover:-translate-y-[1px] hover:border-accent/50 hover:shadow-md"
      title={`${session.name}\n${session.protocol.toUpperCase()} ${
        session.host || '本机'
      }${session.port ? ':' + session.port : ''}`}
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${meta.chip}`}>
        <Icon size={17} strokeWidth={2} />
      </span>
      <span className="w-full truncate text-[12px] font-medium">{session.name}</span>
      <span className="w-full truncate text-[10.5px] text-fg-dim">
        {[session.host || '本机', folder?.name].filter((x, i, a) => x && a.indexOf(x) === i).join(' · ')}
      </span>
      <span className="mt-0.5 rounded bg-surface-2 px-1.5 py-px text-[9.5px] font-medium tracking-wide text-fg-dim">
        {meta.label}
      </span>
    </button>
  )
}
