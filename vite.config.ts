import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))

/**
 * 映像（mp4）は dist に入れない。
 * 配信は R2（media.kobakuni.com）から行い、Cloudflare Pages の 1 ファイル 25 MiB 制限にも当たらないようにする。
 * リポジトリの public/media/ の mp4 はマスターとして残し、開発サーバー（LAN の実機確認）では今まで通り読める。
 */
function excludeVideosFromDist(): Plugin {
  return {
    name: 'awl:exclude-videos-from-dist',
    apply: 'build',
    closeBundle() {
      const dir = join(root, 'dist', 'media')
      if (!existsSync(dir)) return
      for (const name of readdirSync(dir)) {
        if (!name.endsWith('.mp4')) continue
        rmSync(join(dir, name))
        console.log(`[awl] dist から除外: media/${name}（配信は R2）`)
      }
    },
  }
}

/** 実験（exp/lion-ai）: 開発サーバーだけ。ブラウザの canvas 画像を experiments/lion-ai/shots/ に保存する */
function lionAiCapture(): Plugin {
  return {
    name: 'awl:lion-ai-capture',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__lionai/capture', (req, res) => {
        const name = new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? 'shot'
        if (req.method !== 'POST' || !/^[\w-]+$/.test(name)) {
          res.statusCode = 400
          res.end('bad request')
          return
        }
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          const body = Buffer.concat(chunks).toString()
          const b64 = body.replace(/^data:image\/\w+;base64,/, '')
          const dir = join(root, 'experiments', 'lion-ai', 'shots')
          mkdirSync(dir, { recursive: true })
          writeFileSync(join(dir, `${name}.jpg`), Buffer.from(b64, 'base64'))
          res.end('ok')
        })
      })
    },
  }
}

export default defineConfig({
  base: '/',
  plugins: [excludeVideosFromDist(), lionAiCapture()],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  server: {
    host: true,
  },
})
