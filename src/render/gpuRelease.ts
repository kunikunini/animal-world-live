import * as THREE from 'three'

/**
 * 軽量モード（11/8 スコープ落下 第 2 弾 ③）: アニマルスコープの一覧・観察モニターを開いている間、3D の GPU 側の荷物を手放す。
 * 動物の生成モデルの絵（1024×1024 が 100 枚余り、ミップマップ込みで約 640MB）と形のバッファ（約 90MB）が、
 * 一覧を開いた時も GPU に残っていて、iPhone がページごと落とす上限を越えていた。
 *
 * 手放すのは GPU の写しだけ（texture.dispose()・geometry.dispose()）。絵と形の元のデータ（JS 側）とシーン・位置・状態はそのまま残るので、
 * ワールドに戻って描き直す時に three.js が使う物から順に GPU へ積み直す（見えていない子の分は見えた時に）。
 * 描画は一覧・モニターの間は前から止めているので、手放したあとに描くことはない。?lite=off で使わない
 */
export interface GpuRelease {
  /** 手放す（何度呼んでも、ワールドを描き直すまでは 1 回だけ） */
  release: () => void
  /** ワールドを描き直した（次に開いた時にまた手放せるように） */
  markRendered: () => void
}

export function createGpuRelease(renderer: THREE.WebGLRenderer, scene: THREE.Scene): GpuRelease {
  const off = new URLSearchParams(location.search).get('lite') === 'off'
  let released = false
  return {
    release: () => {
      if (off || released) return
      released = true
      const before = { ...renderer.info.memory }
      const textures = new Set<THREE.Texture>()
      const geometries = new Set<THREE.BufferGeometry>()
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (mesh.geometry?.isBufferGeometry) geometries.add(mesh.geometry)
        const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []
        for (const m of mats) {
          for (const v of Object.values(m)) if ((v as THREE.Texture)?.isTexture) textures.add(v as THREE.Texture)
        }
      })
      // 動画の絵（VideoTexture）は手放さない（毎コマ読み直す物で、ここには無いはず）
      textures.forEach((t) => {
        if (!(t as THREE.VideoTexture).isVideoTexture) t.dispose()
      })
      geometries.forEach((g) => g.dispose())
      // 描画に使う作業用のリスト（描いた物の一覧）も空にする
      renderer.renderLists.dispose()
      const after = renderer.info.memory
      console.info(`[lite] GPU を手放した: 絵 ${before.textures}→${after.textures}、形 ${before.geometries}→${after.geometries}`)
    },
    markRendered: () => {
      released = false
    },
  }
}
