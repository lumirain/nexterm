import { invoke } from '@tauri-apps/api/core'
import type {
  AppInfo,
  Folder,
  HighlightSet,
  Session,
  Settings,
  Snapshot,
  Store,
  TabInfo,
} from './types'

/**
 * 后端调用的唯一出口。
 *
 * 所有跨进程数据结构都在 `types.ts` 里定义，页面组件不直接使用 `invoke`，
 * 这样将来换 IPC 机制（例如 message channel）只需改这一个文件。
 */
export const api = {
  appInfo: () => invoke<AppInfo>('app_info'),

  storeGet: () => invoke<Store>('store_get'),

  sessionUpsert: (session: Session) => invoke<Store>('session_upsert', { session }),
  sessionDelete: (id: string) => invoke<Store>('session_delete', { id }),

  folderUpsert: (folder: Folder) => invoke<Store>('folder_upsert', { folder }),
  folderDelete: (id: string) => invoke<Store>('folder_delete', { id }),

  settingsSet: (settings: Settings) => invoke<Store>('settings_set', { settings }),

  highlightUpsert: (set: HighlightSet) => invoke<Store>('highlight_upsert', { set }),
  highlightDelete: (id: string) => invoke<Store>('highlight_delete', { id }),

  tabOpen: (sessionId: string) => invoke<TabInfo>('tab_open', { sessionId }),
  tabWrite: (id: number, data: string) => invoke<void>('tab_write', { id, data }),
  tabResize: (id: number, cols: number, rows: number) =>
    invoke<void>('tab_resize', { id, cols, rows }),
  tabClose: (id: number) => invoke<boolean>('tab_close', { id }),
  tabSetPalette: (id: number, paletteId: string) =>
    invoke<void>('tab_set_palette', { id, paletteId }),
  tabSnapshot: (id: number, knownRev?: number) =>
    invoke<Snapshot>('tab_snapshot', { id, knownRev }),
}

/** 判断当前是否跑在 Tauri 窗口里（浏览器里打开 vite 时没有 IPC）。 */
export function inTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
