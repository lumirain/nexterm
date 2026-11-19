import { ArrowDownUp, ArrowUp, Circle, MousePointerSquareDashed } from 'lucide-react'
import { useApp } from '../state/store'

/** 底部状态栏：会话状态 + 终端尺寸 + 模式指示。 */
export function StatusBar() {
  const app = useApp()
  const tab = app.active
  const snap = tab?.snap
  const live = tab?.state.startsWith('已连接') ?? false

  return (
    <div className="flex h-6 shrink-0 items-center gap-3 border-t border-line bg-app px-2.5 text-[10.5px] text-fg-dim">
      <span className="flex items-center gap-1.5">
        <span
          className={`h-[6px] w-[6px] rounded-full ${
            live ? 'bg-emerald-500' : tab ? 'bg-amber-500' : 'bg-fg-dim/40'
          }`}
        />
        {tab ? tab.note : '就绪'}
      </span>
      {tab && (
        <span className="truncate text-fg-dim/80">
          {tab.state}
        </span>
      )}

      <span className="ml-auto flex items-center gap-3">
        <span className="tabular-nums">
          {snap ? `${snap.cols}×${snap.rows}` : '—'}
        </span>
        <span className="tabular-nums">{snap ? `${snap.sent} B` : '0 B'}</span>
        <span className="flex items-center gap-1">
          <Circle size={6} className="opacity-40" fill="currentColor" />
          {app.tabs.length} 会话
        </span>
        <span className="flex items-center gap-0.5 opacity-70">
          <MousePointerSquareDashed size={11} strokeWidth={1.8} />
          <ArrowUp size={11} strokeWidth={1.8} />
          <ArrowDownUp size={11} strokeWidth={1.8} />
        </span>
        <span className="font-mono text-[10px] opacity-70">CAP</span>
        <span className="font-mono text-[10px] opacity-70">NUM</span>
      </span>
    </div>
  )
}
