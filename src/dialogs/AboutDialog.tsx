import { Info } from 'lucide-react'
import { LogoMark } from '../components/TitleBar'
import { useApp } from '../state/store'
import { Modal } from './Modal'

const STACK = [
  ['应用框架', 'Tauri 2'],
  ['后端', 'Rust（model / store / pty / vt 四层）'],
  ['前端', 'React 19 + TypeScript'],
  ['样式', 'Tailwind CSS 4'],
  ['图标', 'Lucide'],
  ['通知', 'Sonner'],
]

/** 关于对话框：顺带把"数据独立"这件事说清楚。 */
export function AboutDialog() {
  const app = useApp()

  return (
    <Modal
      title="关于 NexTerm"
      icon={<Info size={15} className="text-accent" />}
      width={560}
      onClose={app.closeDialog}
      footer={
        <button type="button" className="btn btn-primary" onClick={app.closeDialog}>
          关闭
        </button>
      }
    >
      <div className="flex items-start gap-3">
        <LogoMark size={44} />
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-[15px] font-semibold">NexTerm</span>
            <span className="rounded border border-line px-1.5 py-px text-[10px] text-fg-dim">
              v{app.info?.version ?? '1.0.0'}
            </span>
          </div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-fg-dim">
            一个独立实现的跨平台终端客户端：自有数据模型、自有存储格式、自有终端内核。
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-line bg-surface-2 p-3">
        {STACK.map(([k, v]) => (
          <div key={k} className="flex gap-2 text-[11px]">
            <span className="w-[62px] shrink-0 text-fg-dim">{k}</span>
            <span className="min-w-0 truncate">{v}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-lg border border-line p-3">
        <div className="mb-1 text-[11.5px] font-medium">数据层</div>
        <p className="text-[11px] leading-relaxed text-fg-dim">
          全部配置保存在单一 JSON 文件里，结构由本项目的 <code className="font-mono">model.rs</code>{' '}
          定义，字段与任何第三方终端软件的配置文件无关，也不读取、不导入、不兼容外部格式。
        </p>
        <div className="mt-2 break-all rounded bg-surface-2 px-2 py-1.5 font-mono text-[10.5px] text-fg-dim">
          {app.info?.store_file ?? '—'}
        </div>
        <div className="mt-1.5 break-all font-mono text-[10px] text-fg-dim/80">
          数据目录：{app.info?.data_dir ?? '—'}
        </div>
      </div>

      <p className="mt-3 text-[10.5px] leading-relaxed text-fg-dim">
        NexTerm 与任何商业终端软件无关联。界面参考了常见桌面终端的信息架构，
        代码、数据结构与实现均为独立完成。
      </p>
    </Modal>
  )
}
