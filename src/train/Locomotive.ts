import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { CurveFn, curvePoint } from '../track/curves.js'

const TRAIN_SCALE = 0.28
const TRAIN_Y = 0.36   // hauteur centre de la loco au-dessus du sol

// Noms des objets à animer dans le GLB (points supprimés par l'exporteur GLTF)
const WHEEL_NAMES   = new Set(['Circle', 'Circle001', 'Circle002', 'Circle003'])
const CHIMNEY_NAMES = new Set(['Cylinder001', 'Cylinder002'])
// Corps solides à utiliser comme répulseurs de fumée
const BODY_NAMES    = new Set(['Cylinder', 'Cube', 'Cube001'])

export class Locomotive {
  /** Outer group placed in the scene. */
  readonly group = new THREE.Group()

  private inner: THREE.Group | null = null
  private loaded = false

  private _wheels:         THREE.Object3D[] = []
  private _chimneyHelpers: THREE.Object3D[] = []
  private _chimneyPosPool: THREE.Vector3[]  = []
  private _bodyNodes:      THREE.Object3D[] = []
  private _bodyPosPool:    Array<{ pos: THREE.Vector3; radius: number }> = []

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

            // ── Roues à faire tourner ──────────────────────────────────────
            if (WHEEL_NAMES.has(node.name)) {
              this._wheels.push(node)
            }

            // ── Corps solides : répulseurs de fumée ────────────────────────
            if (BODY_NAMES.has(node.name) && node instanceof THREE.Mesh) {
              this._bodyNodes.push(node)
              node.geometry.computeBoundingBox()
              const bb = node.geometry.boundingBox!
              // Rayon = demi-diagonale de la bbox locale × scale global
              const size = new THREE.Vector3()
              bb.getSize(size)
              const r = size.length() * 0.5 * TRAIN_SCALE
              this._bodyPosPool.push({ pos: new THREE.Vector3(), radius: r })
            }

            // ── Cheminées : helper invisible au sommet pour l'émission de fumée ──
            if (CHIMNEY_NAMES.has(node.name)) {
              const helper = new THREE.Object3D()
              if (node instanceof THREE.Mesh) {
                node.geometry.computeBoundingBox()
                helper.position.y = node.geometry.boundingBox!.max.y
              } else {
                helper.position.y = 1.0
              }
              node.add(helper)
              this._chimneyHelpers.push(helper)
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

  /** Called each frame — places loco at t on the curve and animates wheels. */
  update(fn: CurveFn, t: number, wheelRot = 0) {
    if (!this.loaded) return

    const pos   = curvePoint(fn, t, TRAIN_Y)
    const ahead = curvePoint(fn, t + 0.001, TRAIN_Y)

    this.group.position.copy(pos)
    this.group.lookAt(ahead)

    // Rotation des roues proportionnelle à la distance parcourue
    for (const w of this._wheels) {
      w.rotation.y = -wheelRot
    }
  }

  /** Répulseurs monde des parties solides du corps (Cylinder, Cube…). */
  getBodyRepellers(): Array<{ pos: THREE.Vector3; radius: number }> {
    for (let i = 0; i < this._bodyNodes.length; i++) {
      this._bodyNodes[i].getWorldPosition(this._bodyPosPool[i].pos)
    }
    return this._bodyPosPool
  }

  /** Positions monde des sommets de cheminées (une par cheminée trouvée). */
  getChimneyPositions(): THREE.Vector3[] {
    for (let i = 0; i < this._chimneyHelpers.length; i++) {
      if (!this._chimneyPosPool[i]) this._chimneyPosPool[i] = new THREE.Vector3()
      this._chimneyHelpers[i].getWorldPosition(this._chimneyPosPool[i])
    }
    return this._chimneyPosPool.slice(0, this._chimneyHelpers.length)
  }

  get isLoaded()        { return this.loaded }
  get hasChimneys()     { return this._chimneyHelpers.length > 0 }

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
