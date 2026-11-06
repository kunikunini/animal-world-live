// 使い方: node cdp.mjs <url> <script.js の中身を評価する JS ファイル> [width height]
// ヘッドレス Chrome を立ち上げ、ページを開いて JS を評価し、結果を JSON で出す
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [url, jsFile, w = '375', h = '812', shot] = process.argv.slice(2)
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const port = 9300 + Math.floor(Math.random() * 500)
const prof = mkdtempSync(join(tmpdir(), 'awl-cdp-'))
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`,
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', '--mute-audio', 'about:blank',
], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let target
for (let i = 0; i < 50; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
    target = list.find((t) => t.type === 'page')
    if (target) break
  } catch {}
  await sleep(200)
}
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') console.error('EXC', JSON.stringify(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text))
  if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) console.error('CONSOLE', m.params.type, m.params.args.map((a) => a.value ?? a.description).join(' '))
})
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
await send('Runtime.enable')
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: +(process.env.DPR ?? 2), mobile: +w < 768 || !!process.env.TOUCH })
if (+w < 768 || process.env.TOUCH) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
if (process.env.BLOCK) { await send('Network.enable'); await send('Network.setBlockedURLs', { urls: process.env.BLOCK.split(',') }) }
await send('Page.navigate', { url })
await sleep(Number(process.env.SLEEP ?? 2500))
if (process.env.SETUP) {
  await send('Runtime.evaluate', { expression: readFileSync(process.env.SETUP, 'utf8'), returnByValue: true })
  await send('Page.reload')
  await sleep(2500)
}
const expr = readFileSync(jsFile, 'utf8')
const res = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true, timeout: 600000 })
const val = res.result?.result?.value
if (shot && val && val.imgs) {
  for (const [k, d] of Object.entries(val.imgs)) writeFileSync(`${shot}/${k}.jpg`, Buffer.from(d.split(',')[1], 'base64'))
  delete val.imgs
}
console.log(JSON.stringify(val ?? res, null, 1).slice(0, 400000))
if (process.env.PNG) {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(process.env.PNG, Buffer.from(s.result.data, 'base64'))
}
ws.close()
await new Promise((r) => { chrome.once('exit', r); chrome.kill() })
await sleep(300)
rmSync(prof, { recursive: true, force: true })
