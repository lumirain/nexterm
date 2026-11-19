// 生成多尺寸 ICO（BMP/DIB 帧，兼容 Windows 资源编译）
const fs = require('fs')

function draw(size) {
  const px = new Uint8Array(size * size * 4) // RGBA
  const S = size
  const r = Math.round(S * 0.22) // 圆角
  const inRect = (x, y) => {
    const l = 0, t = 0, rt = S - 1, bt = S - 1
    const cx = Math.min(Math.max(x, l + r), rt - r)
    const cy = Math.min(Math.max(y, t + r), bt - r)
    const dx = x - cx, dy = y - cy
    return dx * dx + dy * dy <= r * r
  }
  const set = (x, y, c) => {
    const i = (y * S + x) * 4
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = c[3]
  }
  const lerp = (a, b, t) => a + (b - a) * t
  const bgTop = [17, 24, 39], bgBot = [30, 41, 59]
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (!inRect(x, y)) { set(x, y, [0, 0, 0, 0]); continue }
      const t = y / (S - 1)
      set(x, y, [lerp(bgTop[0], bgBot[0], t), lerp(bgTop[1], bgBot[1], t), lerp(bgTop[2], bgBot[2], t), 255])
    }
  }
  // 提示符 ">" 由两条粗线段构成
  const accent = [56, 189, 248, 255]
  const thick = Math.max(1, Math.round(S * 0.095))
  for (let i = 0; i <= S * 0.34; i++) {
    const t = i / (S * 0.34)
    const x = Math.round(S * (0.3 + 0.28 * t))
    const y = Math.round(S * (0.28 + 0.18 * t))
    for (let dy = 0; dy < thick; dy++) for (let dx = 0; dx < thick; dx++) {
      const xx = x + dx, yy = y + dy, x2 = x + dx, y2 = Math.round(2 * y - yy)
      if (xx >= 0 && xx < S && yy >= 0 && yy < S) set(xx, yy, accent)
      if (x2 >= 0 && x2 < S && y2 >= 0 && y2 < S) set(x2, y2, accent)
    }
  }
  // 下划线
  const uy = Math.round(S * 0.66)
  for (let x = Math.round(S * 0.3); x < Math.round(S * 0.72); x++) {
    for (let dy = 0; dy < thick; dy++) if (uy + dy < S) set(x, uy + dy, accent)
  }
  return px
}

function dib(size) {
  const px = draw(size)
  const andStride = ((size + 31) >> 5) * 4
  const xorSize = size * size * 4
  const andSize = andStride * size
  const buf = Buffer.alloc(40 + xorSize + andSize)
  buf.writeUInt32LE(40, 0)
  buf.writeInt32LE(size, 4)
  buf.writeInt32LE(size * 2, 8) // XOR + AND
  buf.writeUInt16LE(1, 12)
  buf.writeUInt16LE(32, 14)
  buf.writeUInt32LE(xorSize + andSize, 20)
  let o = 40
  for (let y = size - 1; y >= 0; y--) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      buf[o++] = px[i + 2]; buf[o++] = px[i + 1]; buf[o++] = px[i]; buf[o++] = px[i + 3]
    }
  }
  return buf
}

const sizes = [16, 24, 32, 48, 64, 128, 256]
const frames = sizes.map((s) => ({ s, data: dib(s) }))
const header = Buffer.alloc(6 + frames.length * 16)
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(frames.length, 4)
let offset = header.length
frames.forEach((f, i) => {
  const p = 6 + i * 16
  header[p] = f.s >= 256 ? 0 : f.s
  header[p + 1] = f.s >= 256 ? 0 : f.s
  header[p + 2] = 0; header[p + 3] = 0
  header.writeUInt16LE(1, p + 4); header.writeUInt16LE(32, p + 6)
  header.writeUInt32LE(f.data.length, p + 8)
  header.writeUInt32LE(offset, p + 12)
  offset += f.data.length
})
fs.mkdirSync('src-tauri/icons', { recursive: true })
fs.writeFileSync('src-tauri/icons/icon.ico', Buffer.concat([header, ...frames.map((f) => f.data)]))
console.log('icon.ico', fs.statSync('src-tauri/icons/icon.ico').size, 'bytes,', frames.length, 'frames')
