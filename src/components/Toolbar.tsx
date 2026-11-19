import {
  ChevronDown,
  FolderOpen,
  Highlighter,
  Info,
  Moon,
  Palette,
  PanelLeft,
  RefreshCw,
  Search,
  Settings2,
  Sun,
  Unplug,
  FilePlus2,
} from 'lucide-react'
import { useApp } from '../state/store'

/** 工具栏：与菜单共用同一套命令 id，避免两处行为漂移。 */
export function Toolbar() {
  const app = useApp()
  const hasTab = !!app.active
  const connected = app.active?.state.startsWith('已连接') ?? false

  return (
    <div className="chrome flex h-10 shrink-0 items-center gap-0.5 px-2">
      <ToolButton title="新建会话 (Ctrl+N)" onClick={() => app.runCommand('file.new')}>
        <FilePlus2 size={15} strokeWidth={1.8} />
      </ToolButton>

      <ToolButton
        title="打开选中的会话 (Ctrl+O)"
        onClick={() => app.runCommand('file.open')}
        disabled={!app.selected}
        chevron
      >
        <FolderOpen size={15} strokeWidth={1.8} />
      </ToolButton>

      <div className="sep-v" />

      <ToolButton
        title="断开连接 (Ctrl+Shift+D)"
        onClick={() => app.runCommand('file.disconnect')}
        disabled={!hasTab}
      >
        <Unplug size={15} strokeWidth={1.8} />
      </ToolButton>
      <ToolButton
        title="重新连接 (Ctrl+Shift+R)"
        onClick={() => app.runCommand('file.reconnect')}
        disabled={!hasTab}
      >
        <RefreshCw size={15} strokeWidth={1.8} />
      </ToolButton>

      <div className="sep-v" />

      <ToolButton
        title="会话属性"
        onClick={() => app.runCommand('file.props')}
        disabled={!hasTab && !app.selected}
      >
        <Settings2 size={15} strokeWidth={1.8} />
      </ToolButton>
      <ToolButton title="配色方案" onClick={() => app.runCommand('view.palette')}>
        <Palette size={15} strokeWidth={1.8} />
      </ToolButton>
      <ToolButton title="突出显示集" onClick={() => app.runCommand('view.highlight')}>
        <Highlighter size={15} strokeWidth={1.8} />
      </ToolButton>

      <div className="sep-v" />

      <div className="relative ml-1 flex h-7 w-[min(320px,38vw)] items-center rounded-md border border-line-strong bg-surface px-2 focus-within:border-accent">
        <Search size={13} className="shrink-0 text-fg-dim" strokeWidth={2} />
        <input
          value={app.filter}
          onChange={(e) => app.setFilter(e.target.value)}
          placeholder="搜索会话、主机或协议"
          className="h-full w-full bg-transparent px-1.5 text-[12px] outline-none placeholder:text-fg-dim"
        />
        {app.filter && (
          <button
            type="button"
            onClick={() => app.setFilter('')}
            className="text-fg-dim hover:text-fg"
            title="清除"
          >
            ×
          </button>
        )}
      </div>

      <div className="ml-auto flex items-center gap-0.5">
        <div className="mr-1 flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-[3px]">
          <span
            className={`h-[6px] w-[6px] rounded-full ${
              connected ? 'bg-emerald-500' : hasTab ? 'bg-amber-500' : 'bg-fg-dim/50'
            }`}
          />
          <span className="text-[11px] text-fg-dim">
            {connected ? '已连接' : hasTab ? app.active?.state : '未连接'}
          </span>
        </div>

        <ToolButton
          title={app.settings.theme === 'dark' ? '切换到浅色' : '切换到深色'}
          onClick={() =>
            app.runCommand(app.settings.theme === 'dark' ? 'view.theme.light' : 'view.theme.dark')
          }
        >
          {app.settings.theme === 'dark' ? (
            <Sun size={15} strokeWidth={1.8} />
          ) : (
            <Moon size={15} strokeWidth={1.8} />
          )}
        </ToolButton>
        <ToolButton
          title="会话面板"
          on={app.settings.show_panel}
          onClick={() => app.runCommand('view.panel')}
        >
          <PanelLeft size={15} strokeWidth={1.8} />
        </ToolButton>
        <ToolButton title="关于" onClick={() => app.runCommand('help.about')}>
          <Info size={15} strokeWidth={1.8} />
        </ToolButton>
      </div>
    </div>
  )
}

function ToolButton({
  children,
  title,
  onClick,
  disabled,
  on,
  chevron,
}: {
  children: React.ReactNode
  title: string
  onClick: () => void
  disabled?: boolean
  on?: boolean
  chevron?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      data-on={on}
      onClick={onClick}
      className="tool-btn"
    >
      {children}
      {chevron && <ChevronDown size={10} className="ml-[-2px] opacity-60" />}
    </button>
  )
}
