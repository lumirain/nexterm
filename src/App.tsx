import { Toaster } from 'sonner'
import { useEffect } from 'react'
import { MenuBar } from './components/MenuBar'
import { QuickStart } from './components/QuickStart'
import { SessionPanel } from './components/SessionPanel'
import { StatusBar } from './components/StatusBar'
import { TabStrip } from './components/TabStrip'
import { TerminalPane } from './components/TerminalPane'
import { TitleBar } from './components/TitleBar'
import { Toolbar } from './components/Toolbar'
import { AboutDialog } from './dialogs/AboutDialog'
import { HighlightDialog } from './dialogs/HighlightDialog'
import { PaletteDialog } from './dialogs/PaletteDialog'
import { SessionDialog } from './dialogs/SessionDialog'
import { useApp } from './state/store'

export default function App() {
  const app = useApp()

  // 全局快捷键：终端聚焦时只放行 Ctrl+Shift 组合，避免吞掉 Ctrl+C 之类的控制符
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null
      const inTerm = el?.dataset?.term === 'true'
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()

      if (e.key === 'F11') {
        e.preventDefault()
        app.runCommand('view.fullscreen')
        return
      }
      if (!mod) return
      if (inTerm && !e.shiftKey) return

      if (e.shiftKey) {
        if (k === 'd') {
          e.preventDefault()
          app.runCommand('file.disconnect')
        } else if (k === 'r') {
          e.preventDefault()
          app.runCommand('file.reconnect')
        } else if (k === 'n') {
          e.preventDefault()
          app.runCommand('tab.new')
        } else if (k === 's') {
          e.preventDefault()
          app.runCommand('view.panel')
        } else if (e.key === 'Tab') {
          e.preventDefault()
          app.runCommand('win.prev')
        }
        return
      }

      switch (k) {
        case 'n':
          e.preventDefault()
          app.runCommand('file.new')
          break
        case 'o':
          e.preventDefault()
          app.runCommand('file.open')
          break
        case 'w':
          e.preventDefault()
          app.runCommand('tab.close')
          break
        case 'l':
          e.preventDefault()
          app.runCommand('edit.clear')
          break
        case 'tab':
          e.preventDefault()
          app.runCommand('win.next')
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [app])

  if (!app.ready) {
    return (
      <div className="flex h-full items-center justify-center bg-app text-fg-dim">
        <div className="flex flex-col items-center gap-3">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
          正在加载本地数据…
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-app">
      <TitleBar />
      <MenuBar />
      {app.settings.show_toolbar && <Toolbar />}

      {app.error && (
        <div className="border-b border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11.5px] text-amber-800 dark:text-amber-300">
          {app.error}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {app.settings.show_panel && <SessionPanel />}
        <div className="flex min-w-0 flex-1 flex-col">
          {app.tabs.length ? (
            <>
              <TabStrip />
              <div className="flex min-h-0 flex-1 flex-col bg-surface">
                {app.tabs.map((t) => (
                  <div
                    key={t.id}
                    className={t.id === app.activeId ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
                  >
                    <TerminalPane tab={t} />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <QuickStart />
          )}
        </div>
      </div>

      {app.settings.show_statusbar && <StatusBar />}

      <DialogHost />
      <Toaster
        theme={app.settings.theme}
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{ style: { fontSize: '12px' } }}
      />
    </div>
  )
}

function DialogHost() {
  const app = useApp()
  if (!app.dialog) return null
  switch (app.dialog.kind) {
    case 'session':
      return <SessionDialog />
    case 'highlight':
      return <HighlightDialog />
    case 'palette':
      return <PaletteDialog />
    case 'about':
      return <AboutDialog />
    default:
      return null
  }
}
