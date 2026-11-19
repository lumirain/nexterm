import { Minus, Square, X } from 'lucide-react'
import { useCallback } from 'react'
import { useApp } from '../state/store'

/**
 * 自绘标题栏。
 *
 * 窗口本身 `decorations: false`，所以这里要自己提供拖动区与窗口按钮。
 * 拖动靠 `data-tauri-drag-region`，双击最大化与系统行为一致。
 */
export function TitleBar() {
  const app = useApp()
  const active = app.active

  const win = useCallback(async () => (await import('@tauri-apps/api/window')).getCurrentWindow(), [])

  return (
    <div
      data-tauri-drag-region
      className="chrome flex h-9 shrink-0 items-center gap-2 pl-[10px] pr-0"
      onDoubleClick={() => void win().then((w) => w.toggleMaximize())}
    >
      <div data-tauri-drag-region className="flex items-center gap-2">
        <LogoMark />
        <span data-tauri-drag-region className="text-[12.5px] font-semibold tracking-tight">
          NexTerm
        </span>
        <span
          data-tauri-drag-region
          className="rounded border border-line bg-surface px-1.5 py-px text-[10px] font-medium text-fg-dim"
        >
          1.0
        </span>
      </div>

      <div data-tauri-drag-region className="flex min-w-0 flex-1 items-center gap-2 px-2">
        {active && (
          <>
            <span className="h-3 w-px shrink-0 bg-line" />
            <span data-tauri-drag-region className="truncate text-[11.5px] text-fg-dim">
              {active.title}
            </span>
          </>
        )}
      </div>

      <div className="flex h-full items-stretch">
        <WindowButton
          label="最小化"
          onClick={() => void win().then((w) => w.minimize())}
        >
          <Minus size={14} strokeWidth={1.75} />
        </WindowButton>
        <WindowButton
          label="最大化"
          onClick={() => void win().then((w) => w.toggleMaximize())}
        >
          <Square size={11} strokeWidth={2} />
        </WindowButton>
        <WindowButton label="关闭" danger onClick={() => void win().then((w) => w.close())}>
          <X size={14} strokeWidth={1.75} />
        </WindowButton>
      </div>
    </div>
  )
}

function WindowButton({
  children,
  label,
  onClick,
  danger,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`flex w-[42px] items-center justify-center text-fg-dim transition-colors ${
        danger ? 'hover:bg-[#e81123] hover:text-white' : 'hover:bg-black/8 hover:text-fg'
      }`}
    >
      {children}
    </button>
  )
}

/** 品牌标记：与窗口图标同一套几何，纯 SVG 便于随主题变色。 */
export function LogoMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <rect width="32" height="32" rx="7" fill="#111827" />
      <path
        d="M10 11.2 18.6 19 10 23.2"
        fill="none"
        stroke="#38bdf8"
        strokeWidth="2.6"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <path d="M18.6 23.4h5.6" stroke="#38bdf8" strokeWidth="2.6" strokeLinecap="square" />
    </svg>
  )
}
