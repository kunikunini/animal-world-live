import { existsSync, readdirSync, rmSync } from 'node:fs'
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

export default defineConfig({
  base: '/',
  plugins: [excludeVideosFromDist()],
  build: {
    target: 'es2022',
    sourcemap: false,
    // 2 ページ: アプリ（index.html）とスタッフ画面（staff.html）
    rollupOptions: {
      input: {
        main: join(root, 'index.html'),
        staff: join(root, 'staff.html'),
      },
    },
  },
  server: {
    host: true,
  },
})
