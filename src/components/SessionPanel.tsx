import {
  Cable,
  ChevronDown,
  ChevronRight,
  Copy,
  FolderPlus,
  Network,
  Pencil,
  Play,
  Plus,
  Search,
  Server,
  Terminal,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Protocol, Session } from '../lib/types'
import { cloneSession, uid, useApp } from '../state/store'

const PROTO_STYLE: Record<Protocol, { label: string; cls: string; icon: typeof Server }> = {
  ssh: { label: 'SSH', cls: 'text-sky-600 dark:text-sky-400', icon: Server },
  local: { label: 'LOCAL', cls: 'text-slate-500 dark:text-slate-400', icon: Terminal },
  telnet: { label: 'TEL', cls: 'text-amber-600 dark:text-amber-400', icon: Network },
  serial: { label: 'COM', cls: 'text-violet-600 dark:text-violet-400', icon: Cable },
}

/**
 * 左侧会话面板：分组树 + 搜索 + 右键菜单 + 可拖拽宽度。
 * 数据全部来自自有的 `Store`，不读取任何外部会话文件。
 */
export function SessionPanel() {
  const app = useApp()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [ctx, setCtx] = useState<{ x: number; y: number; id: string } | null>(null)
  const dragRef = useRef<{ startX: number; startW: number } | null>(null)

  const needle = app.filter.trim().toLowerCase()
  const matched = useMemo(
    () =>
      app.sessions.filter(
        (s) =>
          !needle ||
          s.name.toLowerCase().includes(needle) ||
          s.host.toLowerCase().includes(needle) ||
          s.protocol.includes(needle) ||
          s.user.toLowerCase().includes(needle),
      ),
    [app.sessions, needle],
  )

  const byFolder = useMemo(() => {
    const map = new Map<string, Session[]>()
    for (const s of matched) {
      const key = s.folder ?? ''
      const list = map.get(key) ?? []
      list.push(s)
      map.set(key, list)
    }
    return map
  }, [matched])

  // 拖拽调整宽度
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current
      if (!d) return
      app.setPanelWidth(d.startW + (e.clientX - d.startX))
    }
    const onUp = () => {
      dragRef.current = null
      document.body.style.cursor = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [app])

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

  const shoot = (s: Session) => {
    const next = cloneSession(s, uid('s'))
    void app.saveSession(next)
  }

  return (
    <div
      className="relative flex shrink-0 flex-col border-r border-line bg-panel"
      style={{ width: app.panelWidth }}
    >
      <div className="flex h-8 shrink-0 items-center gap-1 px-2">
        <div className="flex h-6 flex-1 items-center rounded-md border border-line-strong bg-surface px-1.5 focus-within:border-accent">
          <Search size={12} className="shrink-0 text-fg-dim" strokeWidth={2} />
          <input
            value={app.filter}
            onChange={(e) => app.setFilter(e.target.value)}
            placeholder="主机、IP 或会话名称"
            className="h-full w-full bg-transparent px-1.5 text-[11.5px] outline-none placeholder:text-fg-dim"
          />
        </div>
      </div>

      <div className="flex h-8 shrink-0 items-center gap-1 px-2">
        <button
          type="button"
          onClick={() => app.openDialog({ kind: 'session', isNew: true })}
          className="btn btn-primary h-6 gap-1 px-2 text-[11.5px]"
        >
          <Plus size={12} strokeWidth={2.4} />
          新建
        </button>
        <button
          type="button"
          title="新建分组"
          onClick={() => app.saveFolder({ id: uid('f'), name: '新建分组', parent: null })}
          className="btn h-6 gap-1 px-2 text-[11.5px]"
        >
          <FolderPlus size={12} strokeWidth={2} />
          分组
        </button>
        <button
          type="button"
          title="连接当前选中的会话"
          onClick={() => app.selected && app.openSession(app.selected)}
          disabled={!app.selected}
          className="btn ml-auto h-6 px-2 text-[11.5px] disabled:opacity-40"
        >
          连接
        </button>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 pb-2"
        onContextMenu={(e) => e.preventDefault()}
      >
        {app.folders
          .filter((f) => !f.parent)
          .map((f) => (
            <FolderNode
              key={f.id}
              folderId={f.id}
              depth={0}
              collapsed={collapsed}
              setCollapsed={setCollapsed}
              byFolder={byFolder}
              onContext={(e, id) => {
                e.preventDefault()
                setCtx({ x: e.clientX, y: e.clientY, id })
              }}
            />
          ))}

        {(byFolder.get('') ?? []).map((s) => (
          <SessionRow
            key={s.id}
            session={s}
            depth={0}
            onContext={(e) => {
              e.preventDefault()
              setCtx({ x: e.clientX, y: e.clientY, id: s.id })
            }}
          />
        ))}

        {!app.sessions.length && (
          <div className="px-2 py-6 text-center text-[11.5px] text-fg-dim">
            还没有会话，点「新建」创建第一个。
          </div>
        )}
        {!!app.sessions.length && !matched.length && (
          <div className="px-2 py-6 text-center text-[11.5px] text-fg-dim">
            没有匹配「{app.filter}」的会话
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-line px-2 py-1.5 text-[10.5px] text-fg-dim">
        {app.sessions.length} 个会话 · {app.folders.length} 个分组
      </div>

      <div
        role="separator"
        onMouseDown={(e) => {
          dragRef.current = { startX: e.clientX, startW: app.panelWidth }
          document.body.style.cursor = 'col-resize'
        }}
        className="absolute right-[-2px] top-0 h-full w-[4px] cursor-col-resize hover:bg-accent/30"
      />

      {ctx && (
        <SessionContextMenu
          x={ctx.x}
          y={ctx.y}
          onClose={() => setCtx(null)}
          items={[
            {
              label: '打开会话',
              icon: Play,
              run: () => void app.openSession(ctx.id),
            },
            {
              label: '会话属性…',
              icon: Pencil,
              run: () => app.openDialog({ kind: 'session', sessionId: ctx.id }),
            },
            {
              label: '创建副本',
              icon: Copy,
              run: () => {
                const s = app.sessions.find((x) => x.id === ctx.id)
                if (s) shoot(s)
              },
            },
            {
              label: '删除',
              icon: Trash2,
              danger: true,
              run: () => void app.deleteSession(ctx.id),
            },
          ]}
        />
      )}
    </div>
  )
}

function FolderNode({
  folderId,
  depth,
  collapsed,
  setCollapsed,
  byFolder,
  onContext,
}: {
  folderId: string
  depth: number
  collapsed: Record<string, boolean>
  setCollapsed: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  byFolder: Map<string, Session[]>
  onContext: (e: React.MouseEvent, id: string) => void
}) {
  const app = useApp()
  const folder = app.folders.find((f) => f.id === folderId)
  if (!folder) return null
  const closed = collapsed[folderId] ?? false
  const children = app.folders.filter((f) => f.parent === folderId)
  const sessions = byFolder.get(folderId) ?? []
  const total = sessions.length + children.length
  if (!total) return null

  return (
    <div>
      <button
        type="button"
        onClick={() => setCollapsed((c) => ({ ...c, [folderId]: !closed }))}
        onContextMenu={(e) => onContext(e, folderId)}
        className="group flex h-[26px] w-full items-center gap-1 rounded px-1 text-left hover:bg-hover"
        style={{ paddingLeft: 4 + depth * 12 }}
      >
        {closed ? (
          <ChevronRight size={12} className="text-fg-dim" />
        ) : (
          <ChevronDown size={12} className="text-fg-dim" />
        )}
        <span className="truncate text-[12px] font-medium">{folder.name}</span>
        <span className="ml-auto pr-1 text-[10px] tabular-nums text-fg-dim">{total}</span>
      </button>

      {!closed && (
        <>
          {children.map((f) => (
            <FolderNode
              key={f.id}
              folderId={f.id}
              depth={depth + 1}
              collapsed={collapsed}
              setCollapsed={setCollapsed}
              byFolder={byFolder}
              onContext={onContext}
            />
          ))}
          {sessions.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              depth={depth + 1}
              onContext={(e) => onContext(e, s.id)}
            />
          ))}
        </>
      )}
    </div>
  )
}

function SessionRow({
  session,
  depth,
  onContext,
}: {
  session: Session
  depth: number
  onContext: (e: React.MouseEvent) => void
}) {
  const app = useApp()
  const active = app.selected === session.id
  const open = app.tabs.some((t) => t.session_id === session.id)
  const style = PROTO_STYLE[session.protocol]
  const Icon = style.icon

  return (
    <button
      type="button"
      onClick={() => app.select(session.id)}
      onDoubleClick={() => void app.openSession(session.id)}
      onContextMenu={onContext}
      className={`group flex h-[26px] w-full items-center gap-1.5 rounded pr-1 text-left ${
        active ? 'bg-sel text-fg' : 'hover:bg-hover'
      }`}
      style={{ paddingLeft: 4 + depth * 12 + 14 }}
      title={`${session.name}\n${session.protocol.toUpperCase()} ${session.host}${
        session.port ? ':' + session.port : ''
      }\n双击打开`}
    >
      <Icon size={12} className={`shrink-0 ${style.cls}`} strokeWidth={2} />
      <span className="truncate text-[12px]">{session.name}</span>
      {open && <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-emerald-500" />}
      <span className="ml-auto truncate pl-2 text-[10.5px] text-fg-dim">
        {session.protocol === 'local' ? '本机' : session.host}
      </span>
    </button>
  )
}

function SessionContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number
  y: number
  items: {
    label: string
    icon: typeof Play
    run: () => void
    danger?: boolean
  }[]
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      x: Math.min(x, window.innerWidth - r.width - 8),
      y: Math.min(y, window.innerHeight - r.height - 8),
    })
  }, [x, y])

  const stop = useCallback((e: React.MouseEvent) => e.stopPropagation(), [])

  return (
    <div
      ref={ref}
      className="popover animate-pop fixed min-w-[168px]"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it) => {
        const Icon = it.icon
        return (
          <button
            key={it.label}
            type="button"
            className="popover-item"
            data-danger={it.danger}
            onClick={() => {
              it.run()
              onClose()
            }}
          >
            <span className="popover-gutter">
              <Icon size={13} strokeWidth={1.9} />
            </span>
            {it.label}
          </button>
        )
      })}
    </div>
  )
}
