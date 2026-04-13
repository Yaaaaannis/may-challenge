import * as THREE from 'three'
import { CurveFn, curvePoint, curveTangent } from '../track/curves.js'

// ── Constants ─────────────────────────────────────────────────────────────────

const SIDE_OFFSET   = 0.58   // lateral offset from track center
const POST_H        = 2.2
const POST_R        = 0.045
const HEAD_W        = 0.30
const HEAD_H        = 0.52
const HEAD_D        = 0.20
const BULB_R        = 0.085
const GATE_LEN      = 1.85
const GREEN_DUR     = 5.0
const RED_DUR       = 3.5
const BRAKE_START   = 0.10   // t-distance at which braking starts
const BRAKE_STOP    = 0.003  // t-distance where train fully stops

// ── Types ─────────────────────────────────────────────────────────────────────

interface Signal {
  t:          number
  pos:        THREE.Vector3
  right:      THREE.Vector3   // unit right of travel direction
  fwdX:       number          // track forward direction X component
  fwdZ:       number          // track forward direction Z component
  state:      'green' | 'red'
  timer:      number
  gateAngle:  number           // PI/2 = open (up), 0 = closed (horizontal)
  light:      THREE.PointLight
}

// ── SignalManager ─────────────────────────────────────────────────────────────

export class SignalManager {
  private scene:   THREE.Scene
  private signals: Signal[] = []
  private _night   = false
  private _visible = true

  // InstancedMeshes (5 draw calls for N signals)
  private _post!:    THREE.InstancedMesh
  private _head!:    THREE.InstancedMesh
  private _redBulb!: THREE.InstancedMesh
  private _grnBulb!: THREE.InstancedMesh
  private _gate!:    THREE.InstancedMesh
  private _meshes:   THREE.InstancedMesh[] = []

  private _dummy = new THREE.Object3D()
  private _v1    = new THREE.Vector3()
  private _q1    = new THREE.Quaternion()
  private _xAxis = new THREE.Vector3(1, 0, 0)

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Build signals. Pass a number for evenly-spaced auto-placement, or an
   *  array of explicit t-values for manual placement from the editor. */
  build(fn: CurveFn, countOrTs: number | number[] = 4) {
    this._clear()
    const ts = typeof countOrTs === 'number'
      ? Array.from({ length: countOrTs }, (_, i) => (i + 0.25) / countOrTs)
      : countOrTs
    const count = ts.length
    if (count === 0) return

    this._createMeshes(count)

    const cycle = GREEN_DUR + RED_DUR

    for (let i = 0; i < count; i++) {
      const t     = ts[i]
      const pos   = curvePoint(fn, t, 0)
      const tang  = curveTangent(fn, t)
      const right = new THREE.Vector3(tang.z, 0, -tang.x).normalize()
      // forward in XZ (derived from right to avoid storing extra tangent)
      const fwdX  = -right.z
      const fwdZ  =  right.x

      // Stagger phase so signals don't all change simultaneously
      const phase     = (i / count) * cycle
      const pInCycle  = phase % cycle
      const state: 'green' | 'red' = pInCycle < GREEN_DUR ? 'green' : 'red'
      const timer     = state === 'green'
        ? GREEN_DUR - pInCycle
        : RED_DUR - (pInCycle - GREEN_DUR)

      const light = new THREE.PointLight(
        state === 'green' ? 0x00ff44 : 0xff2200,
        this._night ? 2.0 : 0.7,
        3.0,
      )
      const lx = pos.x + right.x * SIDE_OFFSET
      const lz = pos.z + right.z * SIDE_OFFSET
      light.position.set(lx, pos.y + POST_H + HEAD_H * 0.4, lz)
      this.scene.add(light)

      this.signals.push({
        t, pos, right, fwdX, fwdZ, state, timer,
        gateAngle: state === 'green' ? Math.PI / 2 : 0,
        light,
      })
    }

    this._updateAll()

    // Apply current visibility state to newly created meshes and lights
    if (!this._visible) {
      for (const m of this._meshes)   m.visible        = false
      for (const sig of this.signals) sig.light.visible = false
    }
  }

  update(dt: number) {
    let dirty = false

    for (const sig of this.signals) {
      // ── State timer ────────────────────────────────────────────────────────
      sig.timer -= dt
      if (sig.timer <= 0) {
        sig.state = sig.state === 'green' ? 'red' : 'green'
        sig.timer = sig.state === 'green' ? GREEN_DUR : RED_DUR
        sig.light.color.set(sig.state === 'green' ? 0x00ff44 : 0xff2200)
        dirty = true
      }

      // ── Gate animation (smooth lerp) ────────────────────────────────────────
      const target = sig.state === 'green' ? Math.PI / 2 : 0
      const diff   = target - sig.gateAngle
      if (Math.abs(diff) > 0.002) {
        sig.gateAngle += diff * Math.min(1, dt * 3.5)
        dirty = true
      }
    }

    if (dirty) this._updateAll()
  }

  /** Returns a braking factor [0, 1] — 1 = no braking, 0 = full stop. */
  getSpeedFactor(trainT: number): number {
    let factor = 1.0
    for (const sig of this.signals) {
      if (sig.state !== 'red') continue
      const dt = ((sig.t - trainT) + 1) % 1
      if (dt <= BRAKE_STOP) {
        factor = 0
      } else if (dt < BRAKE_START) {
        const norm = (dt - BRAKE_STOP) / (BRAKE_START - BRAKE_STOP)
        factor = Math.min(factor, norm * norm)  // quadratic ease
      }
    }
    return factor
  }

  setNightMode(night: boolean) {
    this._night = night
    for (const sig of this.signals) {
      sig.light.intensity = night ? 2.0 : 0.7
    }
    this._updateAll()
  }

  /** Show / hide all signal geometry (e.g. during track editing). */
  setVisible(visible: boolean) {
    this._visible = visible
    for (const m of this._meshes)      m.visible        = visible
    for (const sig of this.signals)    sig.light.visible = visible
  }

  /** Snapshot of signal states for the minimap. */
  getSignalStates(): Array<{ t: number; state: 'green' | 'red' }> {
    return this.signals.map(s => ({ t: s.t, state: s.state }))
  }

  /** Remove all signals (e.g. custom circuit with no signals placed). */
  clear() { this._clear() }

  dispose() { this._clear() }

  // ── Private ────────────────────────────────────────────────────────────────

  private _createMeshes(n: number) {
    const add = <T extends THREE.InstancedMesh>(m: T): T => {
      this.scene.add(m)
      this._meshes.push(m)
      return m
    }

    this._post = add(new THREE.InstancedMesh(
      new THREE.CylinderGeometry(POST_R, POST_R * 1.5, POST_H, 7),
      new THREE.MeshStandardMaterial({ color: 0x363636, roughness: 0.7, metalness: 0.6 }),
      n,
    ))
    this._post.castShadow = true

    this._head = add(new THREE.InstancedMesh(
      new THREE.BoxGeometry(HEAD_W, HEAD_H, HEAD_D),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5, metalness: 0.5 }),
      n,
    ))
    this._head.castShadow = true

    const bulbGeo = new THREE.SphereGeometry(BULB_R, 10, 8)
    // No shared emissive — per-instance HDR instanceColor drives bloom independently
    const redMat = new THREE.MeshStandardMaterial({ roughness: 0.1, metalness: 0.0 })
    const grnMat = new THREE.MeshStandardMaterial({ roughness: 0.1, metalness: 0.0 })
    this._redBulb = add(new THREE.InstancedMesh(bulbGeo, redMat, n))
    this._grnBulb = add(new THREE.InstancedMesh(bulbGeo.clone(), grnMat, n))

    this._gate = add(new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),    // unit; scaled per-instance
      new THREE.MeshStandardMaterial({ color: 0xcc1111, roughness: 0.5, metalness: 0.3 }),
      n,
    ))
    this._gate.castShadow = true
  }

  private _updateAll() {
    const d = this._dummy

    const RED_ON  = new THREE.Color(1.8, 0.06, 0.0)   // HDR bright — triggers bloom
    const RED_OFF = new THREE.Color(0.06, 0.005, 0.0) // near-black
    const GRN_ON  = new THREE.Color(0.0, 1.8, 0.12)
    const GRN_OFF = new THREE.Color(0.0, 0.06, 0.01)

    for (let i = 0; i < this.signals.length; i++) {
      const s  = this.signals[i]
      const px = s.pos.x + s.right.x * SIDE_OFFSET
      const py = s.pos.y
      const pz = s.pos.z + s.right.z * SIDE_OFFSET

      // ── Post ───────────────────────────────────────────────────────────────
      d.position.set(px, py + POST_H / 2, pz)
      d.rotation.set(0, 0, 0)
      d.scale.set(1, 1, 1)
      d.updateMatrix()
      this._post.setMatrixAt(i, d.matrix)

      // ── Head housing — faces the approaching train (opposite travel dir) ──
      const headY     = py + POST_H + HEAD_H / 2
      const headAngle = Math.atan2(s.fwdX, s.fwdZ) + Math.PI
      d.position.set(px, headY, pz)
      d.rotation.set(0, headAngle, 0)
      d.scale.set(1, 1, 1)
      d.updateMatrix()
      this._head.setMatrixAt(i, d.matrix)

      // ── Bulbs — in front of housing (toward approaching train) ──────────
      const bFwdX = -s.fwdX * (HEAD_D / 2 + 0.015)
      const bFwdZ = -s.fwdZ * (HEAD_D / 2 + 0.015)
      d.rotation.set(0, 0, 0)
      d.scale.set(1, 1, 1)

      d.position.set(px + bFwdX, headY + HEAD_H * 0.23, pz + bFwdZ)
      d.updateMatrix()
      this._redBulb.setMatrixAt(i, d.matrix)
      this._redBulb.setColorAt(i, s.state === 'red' ? RED_ON : RED_OFF)

      d.position.set(px + bFwdX, headY - HEAD_H * 0.23, pz + bFwdZ)
      d.updateMatrix()
      this._grnBulb.setMatrixAt(i, d.matrix)
      this._grnBulb.setColorAt(i, s.state === 'green' ? GRN_ON : GRN_OFF)

      // ── Gate arm ─────────────────────────────────────────────────────────
      // Pivots at post base, swings from UP (open) to HORIZONTAL toward track
      const cosA = Math.cos(s.gateAngle)
      const sinA = Math.sin(s.gateAngle)
      // Arm direction: horizontal = toward track (-right), vertical = up
      this._v1.set(-s.right.x * cosA, sinA, -s.right.z * cosA)
      // (already unit length since right is normalized and cos²+sin²=1)

      const armCX = px + this._v1.x * (GATE_LEN / 2)
      const armCY = py + 0.75 + this._v1.y * (GATE_LEN / 2)
      const armCZ = pz + this._v1.z * (GATE_LEN / 2)

      this._q1.setFromUnitVectors(this._xAxis, this._v1)
      d.position.set(armCX, armCY, armCZ)
      d.quaternion.copy(this._q1)
      d.scale.set(GATE_LEN, 0.07, 0.07)
      d.updateMatrix()
      this._gate.setMatrixAt(i, d.matrix)
    }

    for (const m of this._meshes) m.instanceMatrix.needsUpdate = true
    if (this._redBulb.instanceColor) this._redBulb.instanceColor.needsUpdate = true
    if (this._grnBulb.instanceColor) this._grnBulb.instanceColor.needsUpdate = true
    // No shared emissive to update — PointLight per signal handles colored glow
  }

  private _clear() {
    for (const sig of this.signals) this.scene.remove(sig.light)
    for (const m of this._meshes) {
      this.scene.remove(m)
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    }
    this._meshes  = []
    this.signals  = []
  }
}
