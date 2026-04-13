import * as THREE from 'three'
import { CurveFn, curvePoint, curveTangent } from '../track/curves.js'
import { ProceduralWater } from './ProceduralWater.js'

const WATER_Y       = -2.2
const PILLAR_COUNT  = 18
const RAIL_COUNT    = 40
const RAIL_OFFSET   = 0.82   // lateral offset from track center

export class BridgeManager {
  private scene:   THREE.Scene
  private _objs:   THREE.Object3D[] = []
  private _water:  ProceduralWater | null = null

  constructor(scene: THREE.Scene) { this.scene = scene }

  /** Call each frame when bridge is active — animates water. */
  update(dt: number) { this._water?.update(dt) }

  // ── Water param proxies (for debug console) ───────────────────────────────
  setWaveSpeed(v: number)     { this._water?.setWaveParams(v, this._wAmp)    ; this._wSpd = v }
  setWaveAmplitude(v: number) { this._water?.setWaveParams(this._wSpd, v)    ; this._wAmp = v }
  setWaterDeep(v: number)     { this._water?.setColors(v, this._wSh, this._wFm)   ; this._wDp  = v }
  setWaterShallow(v: number)  { this._water?.setColors(this._wDp, v, this._wFm)   ; this._wSh  = v }
  setWaterFoam(v: number)     { this._water?.setColors(this._wDp, this._wSh, v)   ; this._wFm  = v }
  private _wSpd = 1.0; private _wAmp = 1.0
  private _wDp = 0x0d4a66; private _wSh = 0x2a8aaa; private _wFm = 0xb8dde8

  build(fn: CurveFn, tStart: number, tEnd: number) {
    this._clear()

    let tSpan = tEnd - tStart
    if (tSpan <= 0) tSpan += 1

    // ── Procedural water ──────────────────────────────────────────────────────
    this._water = new ProceduralWater(70, 70, 96)
    this._water.mesh.position.y = WATER_Y
    this.scene.add(this._water.mesh)
    this._objs.push(this._water.mesh)

    const pillarH   = -WATER_Y + 0.1
    const pillarGeo = new THREE.CylinderGeometry(0.22, 0.30, pillarH, 7)
    const stoneMat  = new THREE.MeshStandardMaterial({ color: 0x8a7a6a, roughness: 0.9, metalness: 0.05 })
    const pillarMesh = new THREE.InstancedMesh(pillarGeo, stoneMat, PILLAR_COUNT)
    pillarMesh.castShadow    = true
    pillarMesh.receiveShadow = true
    const dummy = new THREE.Object3D()

    // ── Pillars ───────────────────────────────────────────────────────────────
    for (let i = 0; i < PILLAR_COUNT; i++) {
      const t   = tStart + (i / PILLAR_COUNT) * tSpan
      const pos = curvePoint(fn, t % 1, 0)
      dummy.position.set(pos.x, WATER_Y + pillarH / 2, pos.z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      pillarMesh.setMatrixAt(i, dummy.matrix)
    }
    pillarMesh.instanceMatrix.needsUpdate = true
    this.scene.add(pillarMesh)
    this._objs.push(pillarMesh)

    // ── Railing posts (left + right) ──────────────────────────────────────────
    const railGeo  = new THREE.BoxGeometry(0.08, 0.55, 0.08)
    const railMat  = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.9 })
    const railMesh = new THREE.InstancedMesh(railGeo, railMat, RAIL_COUNT * 2)
    railMesh.castShadow = true
    let ri = 0

    for (let i = 0; i < RAIL_COUNT; i++) {
      const t    = tStart + (i / RAIL_COUNT) * tSpan
      const pos  = curvePoint(fn, t % 1, 0)
      const tang = curveTangent(fn, t % 1)
      const rx   = tang.z
      const rz   = -tang.x

      for (const side of [-1, 1]) {
        dummy.position.set(pos.x + rx * RAIL_OFFSET * side, 0.275, pos.z + rz * RAIL_OFFSET * side)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        railMesh.setMatrixAt(ri++, dummy.matrix)
      }
    }
    railMesh.instanceMatrix.needsUpdate = true
    this.scene.add(railMesh)
    this._objs.push(railMesh)

    // ── Horizontal rail bar (top of posts, each side) ────────────────────────
    // Approximate with a thin tube along each side using many small boxes
    const barGeo  = new THREE.BoxGeometry(0.06, 0.06, 0.06)
    const barMesh = new THREE.InstancedMesh(barGeo, railMat.clone(), RAIL_COUNT * 2)
    let bi = 0
    for (let i = 0; i < RAIL_COUNT; i++) {
      const t0 = tStart + (i / RAIL_COUNT) * tSpan
      const t1 = tStart + ((i + 1) / RAIL_COUNT) * tSpan
      const p0 = curvePoint(fn, t0 % 1, 0)
      const p1 = curvePoint(fn, t1 % 1, 0)
      const tang = curveTangent(fn, t0 % 1)
      const rx = tang.z, rz = -tang.x
      const midX = (p0.x + p1.x) / 2, midZ = (p0.z + p1.z) / 2
      const dx = p1.x - p0.x, dz = p1.z - p0.z
      const len = Math.sqrt(dx * dx + dz * dz)

      for (const side of [-1, 1]) {
        dummy.position.set(midX + rx * RAIL_OFFSET * side, 0.55, midZ + rz * RAIL_OFFSET * side)
        dummy.rotation.set(0, Math.atan2(dx, dz), 0)
        dummy.scale.set(1, 1, Math.max(1, len / 0.06))
        dummy.updateMatrix()
        barMesh.setMatrixAt(bi++, dummy.matrix)
      }
    }
    barMesh.instanceMatrix.needsUpdate = true
    this.scene.add(barMesh)
    this._objs.push(barMesh)
  }

  clear() { this._clear() }
  dispose() { this._clear() }

  private _clear() {
    if (this._water) { this._water.dispose(); this._water = null }
    for (const obj of this._objs) {
      this.scene.remove(obj)
      obj.traverse(o => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose()
          ;(o.material as THREE.Material).dispose()
        }
      })
    }
    this._objs = []
  }
}
