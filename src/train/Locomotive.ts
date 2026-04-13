import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { CurveFn, curvePoint, curveTangent } from '../track/curves.js'

const TRAIN_SCALE = 0.28
const TRAIN_Y = 0.36   // hauteur centre de la loco au-dessus du sol

export class Locomotive {
  /** Outer group placed in the scene. */
  readonly group = new THREE.Group()

  private inner: THREE.Group | null = null
  private loaded = false

  constructor(scene: THREE.Scene) {
    scene.add(this.group)
  }

  async load(glbUrl: string): Promise<void> {
    const draco = new DRACOLoader()
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')

    const loader = new GLTFLoader()
    loader.setDRACOLoader(draco)

    return new Promise((resolve, reject) => {
      loader.load(
        glbUrl,
        (gltf) => {
          const inner = new THREE.Group()
          inner.rotation.y = Math.PI / 2   // aligne l'axe +X local sur la tangente
          inner.scale.setScalar(TRAIN_SCALE)

          gltf.scene.traverse((node) => {
            if (node instanceof THREE.Mesh) {
              node.castShadow = true
              node.receiveShadow = true
            }
          })

          inner.add(gltf.scene)
          this.group.add(inner)
          this.inner = inner
          this.loaded = true
          draco.dispose()
          resolve()
        },
        undefined,
        reject,
      )
    })
  }

  /** Called each frame — places loco at t on the curve. */
  update(fn: CurveFn, t: number) {
    if (!this.loaded) return

    const pos = curvePoint(fn, t, TRAIN_Y)
    const ahead = curvePoint(fn, t + 0.001, TRAIN_Y)

    this.group.position.copy(pos)
    this.group.lookAt(ahead)
  }

  get isLoaded() { return this.loaded }

  dispose() {
    if (this.inner) {
      this.inner.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose())
          else obj.material.dispose()
        }
      })
    }
  }
}
