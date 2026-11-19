import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'
import { api, inTauri } from '../lib/api'
import type {
  AppInfo,
  Folder,
  HighlightSet,
  Palette,
  Session,
  Settings,
  Snapshot,
  Store,
  Tab,
} from '../lib/types'
import { UNIMPLEMENTED } from '../components/menus'

export type DialogKind = 'session' | 'highlight' | 'palette' | 'about' | 'find'

export interface DialogState {
  kind: DialogKind
  /** 属性对话框：正在编辑的会话 id；不传表示新建 */
  sessionId?: string
  isNew?: boolean
}

export interface AppCtx {
  ready: boolean
  info: AppInfo | null
  error: string | null
  store: Store | null
  folders: Folder[]
  sessions: Session[]
  palettes: Palette[]
  highlightSets: HighlightSet[]
  settings: Settings
  tabs: Tab[]
  activeId: number | null
  active: Tab | null
  filter: string
  selected: string | null
  dialog: DialogState | null
  panelWidth: number

  setFilter: (v: string) => void
  select: (id: string | null) => void
  openDialog: (d: DialogState) => void
  closeDialog: () => void

  openSession: (id: string) => Promise<void>
  closeTab: (id: number) => Promise<void>
  closeOthers: (id: number) => Promise<void>
  closeAll: () => Promise<void>
  activate: (id: number) => void
  sendData: (id: number, data: string) => void
  resizeTerm: (id: number, cols: number, rows: number) => void
  setPaletteForTab: (tabId: number, paletteId: string) => void

  saveSession: (s: Session) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  saveFolder: (f: Folder) => Promise<void>
  deleteFolder: (id: string) => Promise<void>
  saveSettings: (patch: Partial<Settings>) => Promise<void>
  saveHighlight: (set: HighlightSet) => Promise<void>
  deleteHighlight: (id: string) => Promise<void>
  setPanelWidth: (px: number) => void

  runCommand: (id: string) => void
  reason: (feature: string) => void
}

const Ctx = createContext<AppCtx | null>(null)

export function useApp(): AppCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useApp 必须在 AppProvider 内使用')
  return c
}

const FALLBACK_SETTINGS: Settings = {
  theme: 'light',
  accent: 'blue',
  show_toolbar: true,
  show_statusbar: true,
  show_panel: true,
  panel_width: 258,
}

export function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`
}

export function cloneSession(s: Session, id = uid('s')): Session {
  return { ...s, id, name: `${s.name} 副本`, created_at: Date.now() }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [store, setStore] = useState<Store | null>(null)
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [panelWidth, setPanelWidthState] = useState(FALLBACK_SETTINGS.panel_width)

  const tabsRef = useRef<Tab[]>([])
  tabsRef.current = tabs
  const settings = store?.settings ?? FALLBACK_SETTINGS

  // ---- 初始化 ----
  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!inTauri()) {
        setError('未检测到 Tauri 运行时：请用 `npm run app:dev` 或安装包启动。')
        setReady(true)
        return
      }
      try {
        const [i, s] = await Promise.all([api.appInfo(), api.storeGet()])
        if (!alive) return
        setInfo(i)
        setStore(s)
        setPanelWidthState(s.settings.panel_width)
        const first = s.sessions[0]?.id ?? null
        setSelected(first)
      } catch (e) {
        setError(String(e))
      } finally {
        if (alive) setReady(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // ---- 主题 ----
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', settings.theme === 'dark')
    root.dataset.accent = settings.accent
  }, [settings.theme, settings.accent])

  // ---- 终端轮询 ----
  useEffect(() => {
    if (!ready) return
    let busy = false
    const timer = window.setInterval(async () => {
      const list = tabsRef.current
      if (busy || !list.length) return
      busy = true
      try {
        const results = await Promise.all(
          list.map(async (t) => {
            try {
              return { id: t.id, snap: await api.tabSnapshot(t.id, t.snap?.rev) }
            } catch {
              return null
            }
          }),
        )
        setTabs((prev) =>
          prev.map((t) => {
            const r = results.find((x) => x?.id === t.id)
            if (!r || !r.snap) return t
            if (r.snap.unchanged) {
              return r.snap.state === t.state ? t : { ...t, state: r.snap.state }
            }
            return { ...t, state: r.snap.state, snap: r.snap as Snapshot }
          }),
        )
      } finally {
        busy = false
      }
    }, 90)
    return () => window.clearInterval(timer)
  }, [ready])

  const active = useMemo(() => tabs.find((t) => t.id === activeId) ?? null, [tabs, activeId])

  const openDialog = useCallback((d: DialogState) => setDialog(d), [])
  const closeDialog = useCallback(() => setDialog(null), [])

  const openSession = useCallback(async (id: string) => {
    try {
      const info = await api.tabOpen(id)
      setTabs((prev) => [...prev, { ...info, snap: null }])
      setActiveId(info.id)
    } catch (e) {
      toast.error(`打开会话失败：${String(e)}`)
    }
  }, [])

  const closeTab = useCallback(async (id: number) => {
    await api.tabClose(id).catch(() => undefined)
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id)
      setActiveId((cur) => {
        if (cur !== id) return cur
        const idx = prev.findIndex((t) => t.id === id)
        return next[Math.min(idx, next.length - 1)]?.id ?? null
      })
      return next
    })
  }, [])

  const closeOthers = useCallback(async (id: number) => {
    const keep = tabsRef.current.filter((t) => t.id !== id)
    await Promise.all(keep.map((t) => api.tabClose(t.id).catch(() => undefined)))
    setTabs((prev) => prev.filter((t) => t.id === id))
    setActiveId(id)
  }, [])

  const closeAll = useCallback(async () => {
    const all = tabsRef.current
    await Promise.all(all.map((t) => api.tabClose(t.id).catch(() => undefined)))
    setTabs([])
    setActiveId(null)
  }, [])

  const activate = useCallback((id: number) => setActiveId(id), [])

  const sendData = useCallback((id: number, data: string) => {
    void api.tabWrite(id, data).catch((e) => toast.error(String(e)))
  }, [])

  const resizeTerm = useCallback((id: number, cols: number, rows: number) => {
    void api.tabResize(id, cols, rows).catch(() => undefined)
  }, [])

  const setPaletteForTab = useCallback((tabId: number, paletteId: string) => {
    void api.tabSetPalette(tabId, paletteId).catch((e) => toast.error(String(e)))
  }, [])

  const saveSession = useCallback(async (s: Session) => {
    try {
      const next = await api.sessionUpsert(s)
      setStore(next)
      setSelected(s.id)
      toast.success(`已保存会话「${s.name}」`)
    } catch (e) {
      toast.error(`保存失败：${String(e)}`)
    }
  }, [])

  const deleteSession = useCallback(async (id: string) => {
    try {
      const next = await api.sessionDelete(id)
      setStore(next)
      setSelected((cur) => (cur === id ? (next.sessions[0]?.id ?? null) : cur))
      toast.success('已删除会话')
    } catch (e) {
      toast.error(`删除失败：${String(e)}`)
    }
  }, [])

  const saveFolder = useCallback(async (f: Folder) => {
    try {
      setStore(await api.folderUpsert(f))
    } catch (e) {
      toast.error(`保存分组失败：${String(e)}`)
    }
  }, [])

  const deleteFolder = useCallback(async (id: string) => {
    try {
      setStore(await api.folderDelete(id))
      toast.success('已删除分组')
    } catch (e) {
      toast.error(`删除分组失败：${String(e)}`)
    }
  }, [])

  const saveHighlight = useCallback(async (set: HighlightSet) => {
    try {
      const next = await api.highlightUpsert(set)
      setStore(next)
      toast.success(`已保存突出显示集「${set.name}」`)
    } catch (e) {
      toast.error(`保存失败：${String(e)}`)
    }
  }, [])

  const deleteHighlight = useCallback(async (id: string) => {
    try {
      setStore(await api.highlightDelete(id))
      toast.success('已删除突出显示集')
    } catch (e) {
      toast.error(`删除失败：${String(e)}`)
    }
  }, [])

  const saveSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const base = store?.settings ?? FALLBACK_SETTINGS
      const next = { ...base, ...patch }
      setStore((cur) => (cur ? { ...cur, settings: next } : cur))
      try {
        await api.settingsSet(next)
      } catch (e) {
        toast.error(`保存设置失败：${String(e)}`)
      }
    },
    [store?.settings],
  )

  const setPanelWidth = useCallback(
    (px: number) => {
      const clamped = Math.max(196, Math.min(420, px))
      setPanelWidthState(clamped)
      void saveSettings({ panel_width: clamped })
    },
    [saveSettings],
  )

  const reason = useCallback((feature: string) => {
    toast.info(UNIMPLEMENTED[feature] ?? '该功能尚未实现', { duration: 5200 })
  }, [])

  // ---- 命令分发 ----
  const runCommand = useCallback(
    (id: string) => {
      const t = tabsRef.current.find((x) => x.id === activeId) ?? null
      const sel = selected
      switch (id) {
        case 'file.new':
          openDialog({ kind: 'session', isNew: true })
          return
        case 'file.open':
          if (sel) void openSession(sel)
          else toast.info('请先在左侧选择一个会话')
          return
        case 'file.disconnect':
          if (t) void closeTab(t.id)
          else toast.info('当前没有打开的会话')
          return
        case 'file.reconnect':
          if (t) {
            const sid = t.session_id
            void closeTab(t.id).then(() => openSession(sid))
          } else toast.info('当前没有打开的会话')
          return
        case 'file.reconnectAll':
          if (!tabsRef.current.length) return toast.info('当前没有打开的会话')
          void (async () => {
            const list = [...tabsRef.current]
            await Promise.all(list.map((x) => api.tabClose(x.id)))
            setTabs([])
            for (const x of list) await api.tabOpen(x.session_id).then((i) => setTabs((p) => [...p, { ...i, snap: null }]))
          })()
          return
        case 'file.props':
          openDialog({ kind: 'session', sessionId: t?.session_id ?? sel ?? undefined })
          return
        case 'file.exit':
          void import('@tauri-apps/api/window').then((m) => m.getCurrentWindow().close())
          return

        case 'edit.copy':
          document.execCommand('copy')
          return
        case 'edit.paste':
          void navigator.clipboard
            .readText()
            .then((txt) => {
              if (t && txt) sendData(t.id, txt)
            })
            .catch(() => toast.error('无法读取剪贴板'))
          return
        case 'edit.selectAll':
          if (t) document.execCommand('selectAll')
          return
        case 'edit.resetTerm':
          if (t) sendData(t.id, '\x1bc')
          return
        case 'edit.clear':
          if (t) sendData(t.id, '\x0c')
          return
        case 'edit.clearScrollback':
          if (t) sendData(t.id, '\x1b[3J')
          return

        case 'view.toolbar':
          void saveSettings({ show_toolbar: !settings.show_toolbar })
          return
        case 'view.statusbar':
          void saveSettings({ show_statusbar: !settings.show_statusbar })
          return
        case 'view.panel':
          void saveSettings({ show_panel: !settings.show_panel })
          return
        case 'view.palette':
        case 'tools.palette':
          openDialog({ kind: 'palette' })
          return
        case 'view.highlight':
        case 'tools.highlight':
          openDialog({ kind: 'highlight' })
          return
        case 'view.theme.light':
          void saveSettings({ theme: 'light' })
          return
        case 'view.theme.dark':
          void saveSettings({ theme: 'dark' })
          return
        case 'view.accent.blue':
          void saveSettings({ accent: 'blue' })
          return
        case 'view.accent.violet':
          void saveSettings({ accent: 'violet' })
          return
        case 'view.accent.teal':
          void saveSettings({ accent: 'teal' })
          return
        case 'view.accent.amber':
          void saveSettings({ accent: 'amber' })
          return
        case 'view.fullscreen':
          void import('@tauri-apps/api/window').then((m) =>
            m.getCurrentWindow().isFullscreen().then((f) => m.getCurrentWindow().setFullscreen(!f)),
          )
          return
        case 'view.ontop':
          void import('@tauri-apps/api/window').then((m) =>
            m.getCurrentWindow().isAlwaysOnTop().then((v) => m.getCurrentWindow().setAlwaysOnTop(!v)),
          )
          return

        case 'tab.new':
          if (sel) void openSession(sel)
          else openDialog({ kind: 'session', isNew: true })
          return
        case 'tab.close':
          if (t) void closeTab(t.id)
          return
        case 'tab.closeOthers':
          if (t) void closeOthers(t.id)
          return
        case 'tab.closeAll':
          void closeAll()
          return
        case 'tab.palette':
          openDialog({ kind: 'palette' })
          return

        case 'win.minimize':
          void import('@tauri-apps/api/window').then((m) => m.getCurrentWindow().minimize())
          return
        case 'win.toggleMax':
          void import('@tauri-apps/api/window').then((m) => m.getCurrentWindow().toggleMaximize())
          return
        case 'win.next':
        case 'win.prev': {
          const list = tabsRef.current
          if (list.length < 2) return
          const i = list.findIndex((x) => x.id === activeId)
          const step = id === 'win.next' ? 1 : -1
          setActiveId(list[(i + step + list.length) % list.length].id)
          return
        }

        case 'tools.dataDir':
        case 'help.data':
          toast.info(info?.data_dir ?? '未知目录', { duration: 6000 })
          return
        case 'help.about':
          openDialog({ kind: 'about' })
          return

        default:
          reason(id)
      }
    },
    [
      activeId,
      selected,
      settings.show_toolbar,
      settings.show_statusbar,
      settings.show_panel,
      openDialog,
      openSession,
      closeTab,
      closeOthers,
      closeAll,
      saveSettings,
      sendData,
      reason,
      info?.data_dir,
    ],
  )

  const value: AppCtx = {
    ready,
    info,
    error,
    store,
    folders: store?.folders ?? [],
    sessions: store?.sessions ?? [],
    palettes: store?.palettes ?? [],
    highlightSets: store?.highlight_sets ?? [],
    settings,
    tabs,
    activeId,
    active,
    filter,
    selected,
    dialog,
    panelWidth,
    setFilter,
    select: setSelected,
    openDialog,
    closeDialog,
    openSession,
    closeTab,
    closeOthers,
    closeAll,
    activate,
    sendData,
    resizeTerm,
    setPaletteForTab,
    saveSession,
    deleteSession,
    saveFolder,
    deleteFolder,
    saveSettings,
    saveHighlight,
    deleteHighlight,
    setPanelWidth,
    runCommand,
    reason,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
