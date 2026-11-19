import type { HighlightRule, Span } from './types'

/**
 * 把高亮规则叠加到一行的渲染片段上。
 *
 * 做法：先按字符展开成数组（保留每格原有颜色），再用正则/子串在整行文本上
 * 找出命中区间，逐格改写前景/背景/加粗，最后重新合并相邻同样式格子。
 * 这样规则可以跨 span 生效（例如一段纯文本中间夹着 `[OK]`）。
 */
export function applyRules(spans: Span[], rules: HighlightRule[]): Span[] {
  const active = rules.filter((r) => r.enabled && r.pattern.trim())
  if (!active.length || !spans.length) return spans

  type Cell = { ch: string; fg: string; bg: string; b: boolean; i: boolean; u: boolean; s: boolean }
  const cells: Cell[] = []
  for (const sp of spans) {
    for (const ch of sp.t) {
      cells.push({ ch, fg: sp.fg, bg: sp.bg, b: sp.b, i: sp.i, u: sp.u, s: sp.s })
    }
  }

  const text = cells.map((c) => c.ch).join('')

  // 每格记录首次被哪条规则命中。对齐 Xshell 的 first-match-wins：
  // 一条文字同时符合多条规则时，以列表中靠前的规则为准，后规则不再覆盖。
  const claimed = new Array<boolean>(cells.length).fill(false)

  for (const rule of active) {
    let re: RegExp
    try {
      // case_sensitive 为真时不加 i 标志；否则忽略大小写。
      const flags = rule.case_sensitive ? 'g' : 'gi'
      re = rule.regex
        ? new RegExp(rule.pattern, flags)
        : new RegExp(escapeRe(rule.pattern), flags)
    } catch {
      continue // 规则写错就跳过，不能让整屏渲染挂掉
    }
    let m: RegExpExecArray | null
    let guard = 0
    while ((m = re.exec(text)) && guard++ < 200) {
      if (!m[0].length) {
        re.lastIndex += 1
        continue
      }
      for (let i = m.index; i < m.index + m[0].length && i < cells.length; i++) {
        if (claimed[i]) continue
        const c = cells[i]
        if (rule.foreground) c.fg = rule.foreground
        if (rule.background) c.bg = rule.background
        if (rule.bold) c.b = true
        if (rule.italic) c.i = true
        if (rule.underline) c.u = true
        if (rule.strikeout) c.s = true
        claimed[i] = true
      }
    }
  }

  if (!cells.length) return spans

  const out: Span[] = []
  for (const c of cells) {
    const last = out[out.length - 1]
    if (last && last.fg === c.fg && last.bg === c.bg && last.b === c.b && last.i === c.i && last.u === c.u && last.s === c.s) {
      last.t += c.ch
    } else {
      out.push({ t: c.ch, fg: c.fg, bg: c.bg, b: c.b, i: c.i, u: c.u, s: c.s })
    }
  }
  return out
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
