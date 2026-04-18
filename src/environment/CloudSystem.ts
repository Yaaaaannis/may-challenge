import * as THREE from 'three'

const CLOUD_COUNT = 18
const SPHERES_PER = 5
const TOTAL       = CLOUD_COUNT * SPHERES_PER
const MAP_HALF    = 55
const ALT_MIN     = 14
const ALT_MAX     = 26

function makeToonGradient(): THREE.DataTexture {
  const data = new Uint8Array([80, 180, 255])
  const tex  = new THREE.DataTexture(data, 3, 1, THREE.RedFormat)
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  tex.needsUpdate = true
  return tex
}

interface Cloud {
  x: number; y: number; z: number
  vx: number; vz: number
  spheres: Array<{ ox: number; oy: number; oz: number; r: number }>
}

export class CloudSystem {
  private _mesh:   THREE.InstancedMesh
  private _clouds: Cloud[]
  private _dummy = new THREE.Object3D()
  private _scene: THREE.Scene

  constructor(scene: THREE.Scene) {
    this._scene = scene

    const geo = new THREE.SphereGeometry(1, 8, 6)
    const mat = new THREE.MeshToonMaterial({
      color:       0xffffff,
      gradientMap: makeToonGradient(),
    })

    this._mesh = new THREE.InstancedMesh(geo, mat, TOTAL)
    this._mesh.frustumCulled = false
    this._mesh.castShadow    = false
    scene.add(this._mesh)

    this._clouds = []
    for (let c = 0; c < CLOUD_COUNT; c++) {
      const spheres = []
      for (let s = 0; s < SPHERES_PER; s++) {
        spheres.push({
          ox: (Math.random() - 0.5) * 8,
          oy:  Math.random() * 2.0,
          oz: (Math.random() - 0.5) * 5,
          r:   1.5 + Math.random() * 2.0,
        })
      }
      this._clouds.push({
        x:  (Math.random() - 0.5) * 2 * MAP_HALF,
        y:   ALT_MIN + Math.random() * (ALT_MAX - ALT_MIN),
        z:  (Math.random() - 0.5) * 2 * MAP_HALF,
        vx:  0.02 + Math.random() * 0.04,
        vz: (Math.random() - 0.5) * 0.03,
        spheres,
      })
    }

    // Première mise à jour pour placer les instances
    this._writeInstances()
  }

  update(dt: number) {
    for (const cloud of this._clouds) {
      cloud.x += cloud.vx * dt
      cloud.z += cloud.vz * dt
      // Wrap autour de la carte
      if (cloud.x >  MAP_HALF) cloud.x -= 2 * MAP_HALF
      if (cloud.x < -MAP_HALF) cloud.x += 2 * MAP_HALF
      if (cloud.z >  MAP_HALF) cloud.z -= 2 * MAP_HALF
      if (cloud.z < -MAP_HALF) cloud.z += 2 * MAP_HALF
    }
    this._writeInstances()
  }

  setVisible(v: boolean) {
    this._mesh.visible = v
  }

  dispose() {
    this._scene.remove(this._mesh)
    this._mesh.geometry.dispose()
    ;(this._mesh.material as THREE.Material).dispose()
  }

  private _writeInstances() {
    const d = this._dummy
    let idx = 0
    for (const cloud of this._clouds) {
      for (const sp of cloud.spheres) {
        d.position.set(cloud.x + sp.ox, cloud.y + sp.oy, cloud.z + sp.oz)
        d.scale.setScalar(sp.r)
        d.updateMatrix()
        this._mesh.setMatrixAt(idx++, d.matrix)
      }
    }
    this._mesh.instanceMatrix.needsUpdate = true
  }
}
