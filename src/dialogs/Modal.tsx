import { X } from 'lucide-react'
import { useEffect } from 'react'

/**
 * 通用模态框。
 *
 * 交互约定：Esc 关闭、点遮罩关闭、标题栏右侧关闭。所有对话框共用，
 * 避免每个弹窗各写一套键盘处理。
 */
export function Modal({
  title,
  subtitle,
  icon,
  width = 860,
  height,
  onClose,
  children,
  footer,
  flush,
}: {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  width?: number
  height?: number
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  /** 内容区不加内边距（用于左右分栏的对话框） */
  flush?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-6 backdrop-blur-[1px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="animate-pop flex max-h-full flex-col overflow-hidden rounded-xl border border-line-strong bg-surface shadow-[0_28px_80px_-24px_rgb(15_23_42/0.45)]"
        style={{ width, height }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex shrink-0 items-center gap-2.5 border-b border-line px-4 py-2.5">
          {icon}
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold">{title}</div>
            {subtitle && <div className="truncate text-[11px] text-fg-dim">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            title="关闭"
            className="ml-auto flex h-6 w-6 items-center justify-center rounded text-fg-dim hover:bg-hover hover:text-fg"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        <div className={`min-h-0 flex-1 overflow-hidden ${flush ? '' : 'overflow-y-auto p-4'}`}>
          {children}
        </div>

        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface-2 px-4 py-2.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
