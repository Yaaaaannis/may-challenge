import * as THREE from 'three'

const CAP       = 80
const CHIMNEY_Y = 0.85   // offset above loco group y

interface Puff {
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  age: number; maxAge: number
  s0: number
}

export class SmokeSystem {
  private scene:      THREE.Scene
  private _mesh:      THREE.InstancedMesh
  private _puffs:     Puff[]
  private _emit       = 0
  private _dummy      = new THREE.Object3D()
  private _rateMult   = 1.0   // emission rate multiplier
  private _riseMult   = 1.0   // rise speed multiplier
  private _sizeMult   = 1.0   // puff size multiplier

  setEmissionRate(v: number) { this._rateMult = v }
  setRiseSpeed(v: number)    { this._riseMult = v }
  setPuffSize(v: number)     { this._sizeMult = v }

  constructor(scene: THREE.Scene) {
    this.scene = scene
    const geo = new THREE.SphereGeometry(0.16, 6, 5)
    const mat = new THREE.MeshStandardMaterial({
      color: 0xbbbbbb, transparent: true, opacity: 0.55,
      depthWrite: false, roughness: 1,
    })
    this._mesh = new THREE.InstancedMesh(geo, mat, CAP)
    this._mesh.frustumCulled = false
    this._mesh.renderOrder = 1
    scene.add(this._mesh)

    this._puffs = Array.from({ length: CAP }, () =>
      ({ x:0, y:0, z:0, vx:0, vy:0, vz:0, age:99, maxAge:1, s0:0.1 })
    )

    const d = this._dummy
    d.scale.set(0, 0, 0)
    d.updateMatrix()
    for (let i = 0; i < CAP; i++) this._mesh.setMatrixAt(i, d.matrix)
    this._mesh.instanceMatrix.needsUpdate = true
  }

  update(dt: number, locoPos: THREE.Vector3, speed: number) {
    const rate = (1.5 + Math.abs(speed) * 2.5) * this._rateMult
    this._emit += rate * dt
    while (this._emit >= 1) {
      this._emit -= 1
      this._spawn(locoPos)
    }

    const d = this._dummy
    for (let i = 0; i < CAP; i++) {
      const p = this._puffs[i]
      if (p.age >= p.maxAge) {
        d.scale.set(0, 0, 0)
        d.updateMatrix()
        this._mesh.setMatrixAt(i, d.matrix)
        continue
      }
      p.age  += dt
      p.x    += p.vx * dt
      p.y    += p.vy * dt
      p.z    += p.vz * dt
      p.vy   *= 1 - dt * 0.2   // slight drag

      const t  = p.age / p.maxAge
      const s  = p.s0 * (0.8 + t * 2.5)
      const sc = s * Math.max(0, 1 - t * t)

      d.position.set(p.x, p.y, p.z)
      d.scale.set(sc, sc, sc)
      d.updateMatrix()
      this._mesh.setMatrixAt(i, d.matrix)
    }
    this._mesh.instanceMatrix.needsUpdate = true
  }

  private _spawn(pos: THREE.Vector3) {
    for (let i = 0; i < CAP; i++) {
      const p = this._puffs[i]
      if (p.age < p.maxAge) continue
      p.x  = pos.x + (Math.random() - 0.5) * 0.15
      p.y  = pos.y + CHIMNEY_Y
      p.z  = pos.z + (Math.random() - 0.5) * 0.15
      p.vx = (Math.random() - 0.5) * 0.3
      p.vy = (0.6 + Math.random() * 0.8) * this._riseMult
      p.vz = (Math.random() - 0.5) * 0.3
      p.age    = 0
      p.maxAge = 1.2 + Math.random() * 0.8
      p.s0     = (0.12 + Math.random() * 0.08) * this._sizeMult
      return
    }
  }

  dispose() {
    this.scene.remove(this._mesh)
    this._mesh.geometry.dispose()
    ;(this._mesh.material as THREE.Material).dispose()
  }
}
