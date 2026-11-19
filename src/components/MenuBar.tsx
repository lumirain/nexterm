import { Check, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useApp } from '../state/store'
import { MENUS, type MenuItem } from './menus'

/**
 * 顶部菜单栏。
 *
 * 交互与 Windows 菜单一致：点击展开、展开状态下悬停切换、Esc 关闭、
 * 点击外部关闭。带子菜单的项在悬停时右侧弹出。
 */
export function MenuBar() {
  const app = useApp()
  const [open, setOpen] = useState<string | null>(null)
  const [pinned, setPinned] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpen(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const isChecked = (item: MenuItem) => {
    switch (item.toggle) {
      case 'toolbar':
        return app.settings.show_toolbar
      case 'statusbar':
        return app.settings.show_statusbar
      case 'panel':
        return app.settings.show_panel
      case 'tabbar':
        return true
      case 'ontop':
        return pinned
      default:
        return false
    }
  }

  const exec = (item: MenuItem) => {
    if (!item.id) return
    if (item.id === 'view.ontop') setPinned((v) => !v)
    app.runCommand(item.id)
    setOpen(null)
  }

  return (
    <div ref={barRef} className="chrome relative flex h-7 shrink-0 items-center gap-0.5 px-1">
      {MENUS.map((m) => (
        <div key={m.id} className="relative">
          <button
            type="button"
            className="menu-btn"
            data-open={open === m.id}
            onMouseEnter={() => open && setOpen(m.id)}
            onClick={() => setOpen((cur) => (cur === m.id ? null : m.id))}
          >
            {m.label}
            <span className="menu-mnemonic">({m.mnemonic})</span>
          </button>

          {open === m.id && (
            <div className="popover animate-pop left-0 top-[26px]">
              {m.items.map((item, i) =>
                item.separator ? (
                  <div key={`s${i}`} className="popover-sep" />
                ) : (
                  <MenuRow
                    key={item.id ?? item.label ?? i}
                    item={item}
                    checked={isChecked(item)}
                    onExec={exec}
                  />
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function MenuRow({
  item,
  checked,
  onExec,
}: {
  item: MenuItem
  checked: boolean
  onExec: (item: MenuItem) => void
}) {
  const [hover, setHover] = useState(false)
  const Icon = item.icon

  return (
    <div
      className="relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        className="popover-item"
        data-danger={item.danger}
        disabled={item.disabled}
        onClick={() => (item.submenu ? undefined : onExec(item))}
      >
        <span className="popover-gutter">
          {checked ? (
            <Check size={13} strokeWidth={2.4} />
          ) : Icon ? (
            <Icon size={13} strokeWidth={1.8} />
          ) : null}
        </span>
        <span className="truncate">{item.label}</span>
        {item.submenu ? (
          <ChevronRight size={13} className="ml-auto opacity-60" />
        ) : (
          item.shortcut && <span className="popover-meta">{item.shortcut}</span>
        )}
      </button>

      {item.submenu && hover && (
        <div className="popover animate-pop left-[calc(100%+2px)] top-[-4px] min-w-[168px]">
          {item.submenu.map((s) => (
            <button
              key={s.id}
              type="button"
              className="popover-item"
              onClick={() => onExec(s)}
            >
              <span className="popover-gutter" />
              <span className="truncate">{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
