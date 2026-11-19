import type { LucideIcon } from 'lucide-react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Clipboard,
  ClipboardPaste,
  Copy,
  Eraser,
  FilePlus2,
  FolderOpen,
  Gauge,
  Highlighter,
  Image as ImageIcon,
  Info,
  Keyboard,
  Layers,
  LayoutTemplate,
  Lock,
  Maximize2,
  Moon,
  Palette,
  Plus,
  RefreshCw,
  Repeat,
  Save,
  Search,
  Settings2,
  Sun,
  Terminal,
  Trash2,
  Unplug,
  Wrench,
  X,
} from 'lucide-react'

export interface MenuItem {
  /** 命令 id；带子菜单时可为空 */
  id?: string
  label?: string
  shortcut?: string
  icon?: LucideIcon
  danger?: boolean
  disabled?: boolean
  separator?: boolean
  /** 勾选状态由界面状态计算 */
  toggle?: 'toolbar' | 'statusbar' | 'panel' | 'tabbar' | 'scrollbar' | 'simple' | 'ontop'
  submenu?: MenuItem[]
}

export interface MenuDef {
  id: string
  label: string
  mnemonic: string
  items: MenuItem[]
}

const sep: MenuItem = { separator: true }

/**
 * 顶部菜单树。
 *
 * 条目顺序与分组参考了截图里的信息架构（文件 / 编辑 / 查看 / 工具 / 选项卡 /
 * 窗口 / 帮助），但每一项都重新做了归并：把截图里重复或含义重叠的条目合并，
 * 并删除了与当前实现无关的第三方入口。
 */
export const MENUS: MenuDef[] = [
  {
    id: 'file',
    label: '文件',
    mnemonic: 'F',
    items: [
      { id: 'file.new', label: '新建会话…', shortcut: 'Ctrl+N', icon: FilePlus2 },
      { id: 'file.open', label: '打开会话', shortcut: 'Ctrl+O', icon: FolderOpen },
      sep,
      { id: 'file.disconnect', label: '断开连接', shortcut: 'Ctrl+Shift+D', icon: Unplug },
      { id: 'file.reconnect', label: '重新连接', shortcut: 'Ctrl+Shift+R', icon: RefreshCw },
      { id: 'file.reconnectAll', label: '重新连接所有', icon: Repeat },
      sep,
      { id: 'file.saveAs', label: '将会话另存为…', icon: Save },
      { id: 'file.import', label: '导入会话…', icon: ArrowDownToLine },
      { id: 'file.export', label: '导出会话…', icon: ArrowUpFromLine },
      sep,
      { id: 'file.props', label: '当前会话属性', icon: Settings2 },
      { id: 'file.defaults', label: '默认会话属性', icon: Wrench },
      sep,
      { id: 'file.exit', label: '退出', shortcut: 'Alt+F4', icon: X, danger: true },
    ],
  },
  {
    id: 'edit',
    label: '编辑',
    mnemonic: 'E',
    items: [
      { id: 'edit.copy', label: '复制', shortcut: 'Ctrl+Shift+C', icon: Copy },
      { id: 'edit.paste', label: '粘贴', shortcut: 'Ctrl+Shift+V', icon: ClipboardPaste },
      { id: 'edit.copyAll', label: '复制全部输出', icon: Clipboard },
      sep,
      { id: 'edit.selectAll', label: '全选', icon: Layers },
      { id: 'edit.find', label: '查找…', shortcut: 'Ctrl+F', icon: Search },
      { id: 'edit.findNext', label: '查找下一个', shortcut: 'F3' },
      sep,
      { id: 'edit.resetTerm', label: '重置终端', icon: RefreshCw },
      { id: 'edit.resetSize', label: '重置窗口大小' },
      sep,
      { id: 'edit.clear', label: '清屏', shortcut: 'Ctrl+L', icon: Eraser },
      { id: 'edit.clearScrollback', label: '清除滚动缓冲区', shortcut: 'Ctrl+Shift+B', icon: Trash2 },
    ],
  },
  {
    id: 'view',
    label: '查看',
    mnemonic: 'V',
    items: [
      { id: 'view.toolbar', label: '工具栏', toggle: 'toolbar' },
      { id: 'view.statusbar', label: '状态栏', toggle: 'statusbar' },
      { id: 'view.panel', label: '会话面板', shortcut: 'Ctrl+Shift+S', toggle: 'panel' },
      { id: 'view.tabbar', label: '标签栏', toggle: 'tabbar' },
      sep,
      { id: 'view.manager', label: '会话管理器' },
      { id: 'view.palette', label: '配色方案…', icon: Palette },
      { id: 'view.highlight', label: '突出显示集…', icon: Highlighter },
      sep,
      { id: 'view.theme.light', label: '浅色主题', icon: Sun },
      { id: 'view.theme.dark', label: '深色主题', icon: Moon },
      {
        id: 'view.accent',
        label: '强调色',
        submenu: [
          { id: 'view.accent.blue', label: '蓝' },
          { id: 'view.accent.violet', label: '紫' },
          { id: 'view.accent.teal', label: '青' },
          { id: 'view.accent.amber', label: '琥珀' },
        ],
      },
      sep,
      { id: 'view.ontop', label: '总在最前面', shortcut: 'Alt+A', toggle: 'ontop', icon: Layers },
      { id: 'view.fullscreen', label: '全屏', shortcut: 'F11', icon: Maximize2 },
      { id: 'view.lock', label: '锁定界面', icon: Lock },
    ],
  },
  {
    id: 'tools',
    label: '工具',
    mnemonic: 'T',
    items: [
      { id: 'tools.keys', label: '密钥管理…', icon: Keyboard },
      { id: 'tools.agent', label: 'Xagent 转发' },
      sep,
      { id: 'tools.palette', label: '配色方案…', icon: Palette },
      { id: 'tools.highlight', label: '突出显示集…', icon: Highlighter },
      { id: 'tools.keymap', label: '按键映射…', icon: Keyboard },
      { id: 'tools.trigger', label: '触发器…', icon: Gauge },
      { id: 'tools.quickcmd', label: '快捷命令…', icon: Terminal },
      sep,
      { id: 'tools.screenshot', label: '终端截图…', icon: ImageIcon },
      { id: 'tools.script', label: '脚本…' },
      sep,
      { id: 'tools.dataDir', label: '打开数据目录', icon: FolderOpen },
      { id: 'tools.options', label: '选项…', icon: Settings2 },
    ],
  },
  {
    id: 'tab',
    label: '选项卡',
    mnemonic: 'B',
    items: [
      { id: 'tab.new', label: '新建选项卡', shortcut: 'Ctrl+Shift+N', icon: Plus },
      { id: 'tab.duplicate', label: '复制当前选项卡', icon: LayoutTemplate },
      sep,
      { id: 'tab.close', label: '关闭选项卡', shortcut: 'Ctrl+W', icon: X },
      { id: 'tab.closeOthers', label: '关闭其他选项卡' },
      { id: 'tab.closeAll', label: '关闭所有选项卡' },
      sep,
      { id: 'tab.rename', label: '重命名…' },
      { id: 'tab.palette', label: '设置配色…', icon: Palette },
      sep,
      { id: 'tab.detach', label: '移动到新窗口' },
      { id: 'tab.split.v', label: '垂直分割' },
      { id: 'tab.split.h', label: '水平分割' },
    ],
  },
  {
    id: 'window',
    label: '窗口',
    mnemonic: 'W',
    items: [
      { id: 'win.new', label: '新建窗口', shortcut: 'Ctrl+Shift+W', icon: Plus },
      { id: 'win.closeAll', label: '全部关闭' },
      sep,
      { id: 'win.next', label: '下一个选项卡', shortcut: 'Ctrl+Tab' },
      { id: 'win.prev', label: '上一个选项卡', shortcut: 'Ctrl+Shift+Tab' },
      sep,
      { id: 'win.minimize', label: '最小化', icon: ArrowDownToLine },
      { id: 'win.toggleMax', label: '最大化 / 还原', icon: Maximize2 },
    ],
  },
  {
    id: 'help',
    label: '帮助',
    mnemonic: 'H',
    items: [
      { id: 'help.shortcuts', label: '快捷键一览', icon: Keyboard },
      { id: 'help.docs', label: '功能说明', icon: Info },
      sep,
      { id: 'help.data', label: '数据存放位置', icon: FolderOpen },
      { id: 'help.about', label: '关于 NexTerm', icon: Info },
    ],
  },
]

/**
 * 尚未实现的命令 → 给用户的原因。
 *
 * 刻意不写"敬请期待"：每条都说明缺的是什么，便于判断工作量。
 */
export const UNIMPLEMENTED: Record<string, string> = {
  'file.saveAs': '会话另存为需要"目标分组 + 名称冲突处理"的完整流程，当前请用属性对话框复制后改名。',
  'file.import': '尚无导入格式约定：本项目使用自有 JSON，导入功能需要先定义导出格式版本。',
  'file.export': '导出格式尚未定稿，避免产出一个今后无法读回的文件。',
  'file.defaults': '默认会话属性需要"新建会话时的模板"机制，当前新建会话直接使用内置默认值。',
  'edit.find': '查找功能需要终端网格的选区支持，当前版本终端只做渲染，未实现选区块。',
  'edit.findNext': '查找功能尚未实现。',
  'edit.resetSize': '重置窗口大小依赖窗口与终端的联动，当前面板宽度已可拖拽调整。',
  'view.manager': '会话管理器是独立窗口，当前会话面板已覆盖同等操作。',
  'view.lock': '界面锁定需要本地锁定策略，未实现。',
  'tools.keys': '密钥管理需要调用 ssh-keygen 并管理 ~/.ssh 目录，未接线。',
  'tools.agent': 'Xagent 转发需要独立的认证代理协议，未实现。',
  'tools.keymap': '按键映射需要可持久化的映射表与冲突检测，未实现。',
  'tools.trigger': '触发器需要在输出流上跑规则引擎，与高亮规则有重叠，规划中。',
  'tools.quickcmd': '快捷命令面板需要独立的状态栏控件，未实现。',
  'tools.screenshot': '终端截图需要离屏渲染整屏内容，未实现。',
  'tools.script': '脚本引擎（宏）未实现。',
  'tools.options': '选项页尚未实现，常用项已放入「查看」菜单。',
  'tab.duplicate': '复制选项卡需要复制当前会话身份，SSH 会话会占用一条新连接，未实现。',
  'tab.rename': '标签重命名需要为标签单独存一个显示名，未实现。',
  'tab.detach': '拆分到新窗口需要多窗口会话同步，未实现。',
  'tab.split.v': '终端分屏需要多路 PTY 共享一个视图区，未实现。',
  'tab.split.h': '终端分屏需要多路 PTY 共享一个视图区，未实现。',
  'win.new': '多窗口需要跨窗口共享会话状态，未实现。',
  'win.closeAll': '多窗口未实现。',
  'help.shortcuts': '快捷键一览页面未实现。',
  'help.docs': '内置文档未实现。',
  'edit.copyAll': '复制全部输出需要先实现滚动缓冲区读取，未实现。',
}
