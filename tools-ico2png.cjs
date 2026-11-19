// 从 icon.ico 中最大的 BMP(DIB) 帧生成 icon.png，纯 Node 实现，无外部依赖。
// 用法：node tools-ico2png.cjs
const fs = require('fs')
const zlib = require('zlib')

const src = 'src-tauri/icons/icon.ico'
const out = 'src-tauri/icons/icon.png'
const b = fs.readFileSync(src)
const count = b.readUInt16LE(4)

let best = null
for (let i = 0; i < count; i++) {
  const o = 6 + i * 16
  const w = b[o] || 256
  const h = b[o + 1] || 256
  const size = b.readUInt32LE(o + 8)
  const off = b.readUInt32LE(o + 12)
  if (!best || w > best.w) best = { w, h, size, off }
}
if (!best) throw new Error('ico 中无可用帧')
console.log('selected frame', best.w + 'x' + best.h, 'size', best.size)

const dib = best.off
const headerSize = b.readUInt32LE(dib)
const width = b.readInt32LE(dib + 4)
const heightFull = b.readInt32LE(dib + 8)
const bpp = b.readUInt16LE(dib + 14)
const height = Math.abs(heightFull) / 2 // ICO 中高度含 XOR+AND 两幅
console.log('dib header', headerSize, width + 'x' + height, bpp + 'bpp')

if (bpp !== 32) throw new Error('仅支持 32bpp 帧，实际 ' + bpp)

const pixelStart = dib + headerSize
const rowBytes = width * 4
const rgba = Buffer.alloc(width * height * 4)
const topDown = heightFull < 0
for (let y = 0; y < height; y++) {
  const srcY = topDown ? y : height - 1 - y
  for (let x = 0; x < width; x++) {
    const s = pixelStart + srcY * rowBytes + x * 4
    const d = (y * width + x) * 4
    rgba[d] = b[s + 2] // R
    rgba[d + 1] = b[s + 1] // G
    rgba[d + 2] = b[s] // B
    rgba[d + 3] = b[s + 3] // A
  }
}

// PNG 编码：每行前加 filter byte 0
const raw = Buffer.alloc((rowBytes + 1) * height)
for (let y = 0; y < height; y++) {
  raw[y * (rowBytes + 1)] = 0
  rgba.copy(raw, y * (rowBytes + 1) + 1, y * rowBytes, (y + 1) * rowBytes)
}
const idat = zlib.deflateSync(raw, { level: 9 })

const crcTable = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(width, 0)
ihdr.writeUInt32BE(height, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
ihdr[10] = 0
ihdr[11] = 0
ihdr[12] = 0
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0)),
])
fs.writeFileSync(out, png)
console.log('wrote', out, png.length, 'bytes')
