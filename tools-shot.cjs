// 通过 CDP 截取 NexTerm 窗口画面（不依赖桌面会话，纯渲染层截图）。
// 用法：node tools-shot.cjs out.png [jsExpression]
const http = require('http')
const net = require('net')
const crypto = require('crypto')
const fs = require('fs')

const PORT = 9223

function getJson(path) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: PORT, path, headers: { Host: `127.0.0.1:${PORT}` } }, (res) => {
        let d = ''
        res.on('data', (c) => (d += c))
        res.on('end', () => {
          try {
            resolve(JSON.parse(d))
          } catch (e) {
            reject(e)
          }
        })
      })
      .on('error', reject)
  })
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL(wsUrl)
    const key = crypto.randomBytes(16).toString('base64')
    const sock = net.connect(Number(u.port), u.hostname, () => {
      sock.write(
        `GET ${u.pathname} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
          `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
      )
    })
    let buf = Buffer.alloc(0)
    let upgraded = false
    const handlers = new Map()

    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk])
      if (!upgraded) {
        const idx = buf.indexOf('\r\n\r\n')
        if (idx < 0) return
        const head = buf.slice(0, idx).toString()
        if (!head.includes('101')) return reject(new Error(head.split('\r\n')[0]))
        buf = buf.slice(idx + 4)
        upgraded = true
        resolve({ send, close: () => sock.destroy() })
      }
      // 解析帧
      for (;;) {
        if (buf.length < 2) return
        const fin = buf[0] & 0x80
        const op = buf[0] & 0x0f
        let len = buf[1] & 0x7f
        let off = 2
        if (len === 126) {
          if (buf.length < 4) return
          len = buf.readUInt16BE(2)
          off = 4
        } else if (len === 127) {
          if (buf.length < 10) return
          len = Number(buf.readBigUInt64BE(2))
          off = 10
        }
        if (buf.length < off + len) return
        const payload = buf.slice(off, off + len)
        buf = buf.slice(off + len)
        if (op === 1 && fin) {
          try {
            const msg = JSON.parse(payload.toString())
            const h = handlers.get(msg.id)
            if (h) {
              handlers.delete(msg.id)
              h(msg)
            }
          } catch {
            /* 忽略事件帧 */
          }
        }
      }
    })
    sock.on('error', reject)

    let seq = 1
    function send(method, params) {
      const id = seq++
      const body = Buffer.from(JSON.stringify({ id, method, params }))
      const mask = crypto.randomBytes(4)
      const masked = Buffer.from(body)
      for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i % 4]
      let head
      if (body.length < 126) {
        head = Buffer.from([0x81, 0x80 | body.length])
      } else if (body.length < 65536) {
        head = Buffer.alloc(4)
        head[0] = 0x81
        head[1] = 0x80 | 126
        head.writeUInt16BE(body.length, 2)
      } else {
        head = Buffer.alloc(10)
        head[0] = 0x81
        head[1] = 0x80 | 127
        head.writeBigUInt64BE(BigInt(body.length), 2)
      }
      sock.write(Buffer.concat([head, mask, masked]))
      return new Promise((res) => handlers.set(id, res))
    }
  })
}

;(async () => {
  const out = process.argv[2] || 'shot.png'
  const expr = process.argv[3]
  const list = await getJson('/json/list')
  const page = list.find((t) => t.type === 'page')
  if (!page) throw new Error('没有找到页面目标')
  const c = await connect(page.webSocketDebuggerUrl)

  // 真实鼠标事件：CLICK:x,y   或 DOUBLE:x,y
  const clickMatch = /^(CLICK|DOUBLE):(\d+),(\d+)$/.exec(process.argv[3] || '')
  if (clickMatch) {
    const x = Number(clickMatch[2])
    const y = Number(clickMatch[3])
    const times = clickMatch[1] === 'DOUBLE' ? 2 : 1
    for (let i = 1; i <= times; i++) {
      await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: i })
      await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: i })
      await new Promise((r) => setTimeout(r, 60))
    }
    await new Promise((r) => setTimeout(r, 500))
    process.argv[3] = ''
  }

  if (expr) {
    const r = await c.send('Runtime.evaluate', {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
    })
    const val = r.result?.result?.value
    if (r.result?.exceptionDetails) {
      console.error('EVAL ERROR:', r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text)
    } else if (val !== undefined) {
      console.log('eval =>', typeof val === 'string' ? val.slice(0, 200) : JSON.stringify(val))
    }
    await new Promise((r) => setTimeout(r, 700))
  }

  const shot = await c.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  if (!shot.result || !shot.result.data) {
    console.error('截图失败', JSON.stringify(shot).slice(0, 300))
    process.exit(1)
  }
  fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
  console.log('saved', out, fs.statSync(out).size, 'bytes')
  c.close()
  process.exit(0)
})().catch((e) => {
  console.error('ERR', e.message)
  process.exit(1)
})
