import { Settings2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Protocol, Session } from '../lib/types'
import { api, inTauri } from '../lib/api'
import { uid, useApp } from '../state/store'
import { Modal } from './Modal'

type FieldKey = keyof Session

interface Field {
  /** 'password' 是虚拟字段：值不进 Session，经系统凭据库单独存取 */
  key: FieldKey | 'password'
  label: string
  kind?: 'text' | 'number' | 'select' | 'textarea' | 'check' | 'password'
  options?: { value: string; label: string }[]
  optionsFrom?: 'palettes' | 'highlights' | 'folders'
  hint?: string
  min?: number
  max?: number
  /** 占据整行 */
  wide?: boolean
}

interface Page {
  id: string
  label: string
  intro?: string
  fields?: Field[]
  /** 该页尚未接线的说明 */
  todo?: string[]
}

interface Category {
  id: string
  label: string
  pages: Page[]
}

const PROTOCOLS: { value: Protocol; label: string }[] = [
  { value: 'ssh', label: 'SSH' },
  { value: 'local', label: '本地 Shell' },
  { value: 'telnet', label: 'TELNET（未接线）' },
  { value: 'serial', label: '串口（未接线）' },
]

/**
 * 属性对话框的页面定义。
 *
 * 做成数据驱动：以后新增一页只要往这里加一条，右侧表单会自动渲染，
 * 不需要再写一份 JSX。
 */
const CATEGORIES: Category[] = [
  {
    id: 'conn',
    label: '连接',
    pages: [
      {
        id: 'general',
        label: '连接',
        intro: '基础连接参数。协议决定端口默认值，切换协议后端口会自动跟随。',
        fields: [
          { key: 'name', label: '名称', kind: 'text' },
          { key: 'protocol', label: '协议', kind: 'select', options: PROTOCOLS },
          { key: 'host', label: '主机', kind: 'text', hint: '本地会话可留空' },
          { key: 'port', label: '端口号', kind: 'number', min: 0, max: 65535 },
          { key: 'user', label: '用户名', kind: 'text' },
          { key: 'folder', label: '分组', kind: 'select', optionsFrom: 'folders' },
          { key: 'description', label: '说明', kind: 'textarea', wide: true },
        ],
      },
      {
        id: 'auth',
        label: '用户身份验证',
        intro:
          '密码保存在系统凭据管理器（Windows 凭据管理器 / macOS 钥匙串），不写入配置文件；连接时自动应答。',
        fields: [
          { key: 'user', label: '用户名', kind: 'text' },
          {
            key: 'auth_method',
            label: '验证方法',
            kind: 'select',
            options: [
              { value: 'password', label: 'Password' },
              { value: 'keyboard-interactive', label: 'Keyboard Interactive' },
            ],
          },
          { key: 'password', label: '密码', kind: 'password', hint: '留空保持不变' },
          { key: 'save_password', label: '记住密码（保存到系统凭据管理器）', kind: 'check', wide: true },
          { key: 'terminal_type', label: '终端类型', kind: 'text' },
        ],
        todo: [
          '私钥管理：将调用 ssh-keygen 并在设置里指定密钥路径，当前未接线。',
        ],
      },
      {
        id: 'login',
        label: '登录脚本',
        todo: ['登录后自动发送命令需要脚本执行器 + 输出匹配，当前未接线。'],
      },
      {
        id: 'ssh',
        label: 'SSH',
        intro: 'SSH 相关参数。命令行由后端拼装，等价于手写 ssh 命令。',
        fields: [
          { key: 'terminal_type', label: 'TERM 环境变量', kind: 'text' },
          { key: 'encoding', label: '编码', kind: 'text' },
          { key: 'keepalive', label: '保活间隔（秒）', kind: 'number', min: 0, max: 3600 },
        ],
        todo: [
          '端口转发（-L / -R / -D）：需要转发管理器与端口占用检测，当前未接线。',
          'X11 / Agent 转发：需要本地代理套接字，当前未接线。',
        ],
      },
      {
        id: 'tunnel',
        label: '隧道',
        todo: ['隧道需要独立的转发表与生命周期管理，当前未接线。'],
      },
      {
        id: 'sftp',
        label: 'SFTP',
        todo: ['文件传输面板需要 SFTP 子系统客户端，当前未接线。'],
      },
      {
        id: 'telnet',
        label: 'TELNET',
        todo: ['Telnet 需要 IAC 选项协商（ECHO / NAWS / TERMINAL-TYPE），当前未接线。'],
      },
      {
        id: 'serial',
        label: '串口',
        todo: ['串口需要平台 COM 句柄封装（波特率 / 数据位 / 停止位 / 校验），当前未接线。'],
      },
      {
        id: 'proxy',
        label: '代理',
        todo: ['代理跳转需要 SOCKS/HTTP CONNECT 客户端，当前未接线。'],
      },
      {
        id: 'keepalive',
        label: '保持活动状态',
        fields: [
          { key: 'keepalive', label: '心跳间隔（秒）', kind: 'number', min: 0, max: 3600 },
          { key: 'reconnect', label: '异常断开后自动重连', kind: 'check' },
          { key: 'retry_interval', label: '重连间隔（秒）', kind: 'number', min: 1, max: 600 },
          { key: 'retry_limit', label: '重连次数上限（0 = 不限）', kind: 'number', min: 0, max: 99 },
        ],
      },
    ],
  },
  {
    id: 'term',
    label: '终端',
    pages: [
      {
        id: 'keyboard',
        label: '键盘',
        todo: ['按键映射需要可持久化的映射表与冲突检测，当前未接线。'],
      },
      {
        id: 'vt',
        label: 'VT 模式',
        intro: '新建标签时的初始网格尺寸；窗口尺寸变化后以实际测量为准。',
        fields: [
          { key: 'cols', label: '列数', kind: 'number', min: 20, max: 400 },
          { key: 'rows', label: '行数', kind: 'number', min: 4, max: 200 },
        ],
      },
      {
        id: 'term-adv',
        label: '高级',
        fields: [
          { key: 'terminal_type', label: '终端类型', kind: 'text' },
          { key: 'encoding', label: '字符编码', kind: 'text' },
        ],
        todo: ['回滚缓冲行数：已固定为 4000 行，尚未开放配置。'],
      },
    ],
  },
  {
    id: 'look',
    label: '外观',
    pages: [
      {
        id: 'window',
        label: '窗口',
        fields: [
          { key: 'palette', label: '配色方案', kind: 'select', optionsFrom: 'palettes' },
          { key: 'font_size', label: '字号', kind: 'number', min: 8, max: 32 },
        ],
      },
      {
        id: 'highlight',
        label: '突出',
        fields: [{ key: 'highlight_set', label: '突出显示集', kind: 'select', optionsFrom: 'highlights' }],
      },
    ],
  },
  {
    id: 'adv',
    label: '高级',
    pages: [
      { id: 'trace', label: '跟踪', todo: ['会话日志与协议跟踪尚未实现。'] },
      { id: 'bell', label: '响铃', todo: ['响铃策略（声音 / 闪烁 / 忽略）尚未实现。'] },
      { id: 'log', label: '日志记录', todo: ['自动记录会话输出到文件尚未实现。'] },
    ],
  },
  {
    id: 'xfer',
    label: '文件传输',
    pages: [
      { id: 'xy', label: 'X/YMODEM', todo: ['X/YMODEM 协议未实现。'] },
      { id: 'z', label: 'ZMODEM', todo: ['ZMODEM 自动下载/上传未实现。'] },
    ],
  },
]

function blank(): Session {
  return {
    id: uid('s'),
    name: '新建会话',
    folder: null,
    protocol: 'ssh',
    host: '',
    port: 22,
    user: '',
    description: '',
    palette: 'nexterm-light',
    font_size: 14,
    cols: 100,
    rows: 28,
    highlight_set: 'ops-basic',
    keepalive: 60,
    reconnect: false,
    retry_interval: 5,
    retry_limit: 0,
    terminal_type: 'xterm-256color',
    encoding: 'UTF-8',
    auth_method: 'password',
    save_password: false,
    created_at: Date.now(),
  }
}

/** 会话属性对话框：左侧页面树 + 右侧表单。 */
export function SessionDialog() {
  const app = useApp()
  const dialog = app.dialog
  const isNew = dialog?.isNew ?? !dialog?.sessionId

  const source = useMemo(() => {
    const found = app.sessions.find((s) => s.id === dialog?.sessionId)
    return found ? { ...found } : blank()
  }, [app.sessions, dialog?.sessionId])

  const [draft, setDraft] = useState<Session>(source)
  const [page, setPage] = useState('general')
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  // 密码是「虚拟字段」：不进 Session/store.json，单独经系统凭据库存取。
  const [pwDraft, setPwDraft] = useState('')
  const [pwSaved, setPwSaved] = useState(false) // 凭据库里当前是否已有
  const pwInitial = useRef(false) // 打开对话框那一刻是否已有（判断「变更」）

  useEffect(() => {
    if (inTauri() && !isNew) {
      void api.credentialExists(source.id).then(
        (ok) => {
          setPwSaved(ok)
          pwInitial.current = ok
        },
        () => undefined,
      )
    } else {
      pwInitial.current = false
    }
  }, [source.id, isNew])

  const current = CATEGORIES.flatMap((c) => c.pages.map((p) => ({ ...p, cat: c.label }))).find(
    (p) => p.id === page,
  )

  const patch = <K extends FieldKey>(key: K, value: Session[K]) => {
    setDraft((d) => {
      const next = { ...d, [key]: value }
      // 切协议时端口跟随默认值，避免出现"SSH 却连 23 端口"这种低级错误
      if (key === 'protocol') {
        const proto = value as Protocol
        const def = proto === 'ssh' ? 22 : proto === 'telnet' ? 23 : 0
        next.port = def
      }
      return next
    })
  }

  const options = (f: Field): { value: string; label: string }[] => {
    if (f.options) return f.options
    if (f.optionsFrom === 'palettes')
      return app.palettes.map((p) => ({ value: p.id, label: p.name }))
    if (f.optionsFrom === 'highlights')
      return [{ value: '', label: '（不启用）' }, ...app.highlightSets.map((h) => ({ value: h.id, label: h.name }))]
    if (f.optionsFrom === 'folders')
      return [{ value: '', label: '（根目录）' }, ...app.folders.map((x) => ({ value: x.id, label: x.name }))]
    return []
  }

  const valid = draft.name.trim().length > 0 && (draft.protocol === 'local' || draft.host.trim().length > 0)

  const save = async (connect: boolean) => {
    if (!valid) return
    const payload: Session = {
      ...draft,
      folder: draft.folder || null,
      name: draft.name.trim(),
      host: draft.host.trim(),
      user: draft.user.trim(),
    }
    await app.saveSession(payload)

    // ---- 凭据同步（密码只进系统凭据库，永不写入 store.json）----
    if (inTauri()) {
      try {
        if (payload.save_password && pwDraft) {
          await api.credentialSet(payload.id, pwDraft)
          toast.success('密码已保存到系统凭据管理器')
        } else if (!payload.save_password && pwInitial.current) {
          const removed = await api.credentialDelete(payload.id)
          if (removed) toast.info('已清除保存的密码')
        }
      } catch (e) {
        toast.error(`密码保存失败：${String(e)}`)
      }
    }

    app.closeDialog()
    if (connect) await app.openSession(payload.id)
  }

  return (
    <Modal
      title={isNew ? '新建会话' : `会话属性 · ${source.name}`}
      subtitle="所有字段保存在本应用自有的 store.json 中"
      icon={<Settings2 size={15} className="text-accent" />}
      width={880}
      height={580}
      flush
      onClose={app.closeDialog}
      footer={
        <>
          <span className="mr-auto text-[11px] text-fg-dim">
            {valid ? '修改会立即写入本地存储' : '名称必填；非本地会话还需要主机地址'}
          </span>
          <button type="button" className="btn btn-primary" disabled={!valid} onClick={() => void save(false)}>
            确定
          </button>
          <button type="button" className="btn" disabled={!valid} onClick={() => void save(true)}>
            保存并连接
          </button>
          <button type="button" className="btn" onClick={app.closeDialog}>
            取消
          </button>
        </>
      }
    >
      <div className="flex h-full min-h-0">
        <div className="w-[214px] shrink-0 overflow-y-auto border-r border-line bg-panel py-1.5">
          {CATEGORIES.map((c) => {
            const coll = closed[c.id] ?? false
            return (
              <div key={c.id} className="mb-0.5">
                <button
                  type="button"
                  onClick={() => setClosed((s) => ({ ...s, [c.id]: !coll }))}
                  className="flex w-full items-center gap-1 px-2 py-1 text-left text-[11.5px] font-semibold"
                >
                  <span className={`transition-transform ${coll ? '-rotate-90' : ''}`}>▾</span>
                  {c.label}
                </button>
                {!coll &&
                  c.pages.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPage(p.id)}
                      className={`flex w-full items-center gap-1.5 py-[3px] pl-6 pr-2 text-left text-[11.5px] ${
                        page === p.id
                          ? 'bg-accent-soft font-medium text-accent'
                          : 'text-fg-dim hover:bg-hover hover:text-fg'
                      }`}
                    >
                      <span className="h-1 w-1 rounded-full bg-current opacity-40" />
                      {p.label}
                      {p.todo && <span className="ml-auto text-[9px] opacity-60">待接线</span>}
                    </button>
                  ))}
              </div>
            )
          })}
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="mb-1 flex items-baseline gap-2">
            <h3 className="text-[13px] font-semibold">{current?.label}</h3>
            {current && current.cat !== current.label && (
              <span className="text-[10.5px] text-fg-dim">{current.cat}</span>
            )}
          </div>
          {current?.intro && <p className="mb-4 text-[11.5px] leading-relaxed text-fg-dim">{current.intro}</p>}

          {current?.fields && (
            <div className="grid max-w-[540px] grid-cols-2 gap-x-4 gap-y-3">
              {current.fields
                .filter((f) =>
                  // 认证相关字段只对 SSH 有意义
                  current.id === 'auth' && draft.protocol !== 'ssh'
                    ? !['auth_method', 'password', 'save_password'].includes(String(f.key))
                    : true,
                )
                .map((f) => (
                <FieldControl
                  key={String(f.key) + f.label}
                  field={f}
                  value={f.kind === 'password' ? (pwDraft as never) : draft[f.key as FieldKey]}
                  options={options(f)}
                  pwSaved={f.kind === 'password' ? pwSaved : undefined}
                  onChange={(v) => {
                    if (f.kind === 'password') setPwDraft(String(v))
                    else patch(f.key as FieldKey, v as never)
                  }}
                />
              ))}
            </div>
          )}

          {current?.todo && (
            <div className="mt-4 max-w-[540px] rounded-lg border border-amber-500/30 bg-amber-500/8 p-3">
              <div className="mb-1.5 text-[11.5px] font-medium text-amber-700 dark:text-amber-300">
                这一页还没有接线
              </div>
              <ul className="space-y-1 text-[11px] leading-relaxed text-fg-dim">
                {current.todo.map((t) => (
                  <li key={t} className="flex gap-1.5">
                    <span className="text-amber-600 dark:text-amber-400">•</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!current?.fields && !current?.todo && (
            <p className="text-[11.5px] text-fg-dim">这一页暂无可编辑项。</p>
          )}
        </div>
      </div>
    </Modal>
  )
}

function FieldControl({
  field,
  value,
  options,
  pwSaved,
  onChange,
}: {
  field: Field
  value: Session[FieldKey]
  options: { value: string; label: string }[]
  /** 仅 password 虚拟字段：系统凭据库里是否已有保存的密码 */
  pwSaved?: boolean
  onChange: (v: string | number | boolean) => void
}) {
  const wide = field.wide || field.kind === 'textarea' || field.kind === 'check'

  return (
    <label className={`field ${wide ? 'col-span-2' : ''}`}>
      <span>
        {field.label}
        {field.hint && <span className="ml-1 opacity-70">· {field.hint}</span>}
      </span>
      {field.kind === 'check' ? (
        <span className="flex h-[26px] items-center gap-2">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--c-accent)]"
          />
          <span className="text-[11.5px] text-fg-dim">启用</span>
        </span>
      ) : field.kind === 'select' ? (
        <select className="input" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.kind === 'password' ? (
        <span className="relative flex items-center">
          <input
            type="password"
            className="input pr-16"
            value={String(value ?? '')}
            placeholder={pwSaved ? '已保存，输入以更换' : '输入密码'}
            autoComplete="new-password"
            onChange={(e) => onChange(e.target.value)}
          />
          {pwSaved && (
            <span className="pointer-events-none absolute right-2 rounded bg-emerald-600/15 px-1.5 py-px text-[9.5px] font-medium text-emerald-600 dark:text-emerald-400">
              已保存
            </span>
          )}
        </span>
      ) : field.kind === 'number' ? (
        <input
          type="number"
          className="input"
          value={Number(value ?? 0)}
          min={field.min}
          max={field.max}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (!Number.isFinite(n)) return
            const lo = field.min ?? 0
            const hi = field.max ?? 65535
            onChange(Math.max(lo, Math.min(hi, Math.trunc(n))))
          }}
        />
      ) : field.kind === 'textarea' ? (
        <textarea
          className="input"
          rows={3}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input className="input" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  )
}
