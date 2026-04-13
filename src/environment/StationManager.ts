import * as THREE from 'three'
import { CurveFn, curvePoint, curveTangent } from '../track/curves.js'

// ── Geometry ──────────────────────────────────────────────────────────────
const PLATFORM_L  = 3.8    // length along track
const PLATFORM_W  = 1.2    // depth away from track
const PLATFORM_H  = 0.18
const PLATFORM_Y  = 0.09   // slab centre above ground

const CANOPY_L    = 4.0
const CANOPY_W    = 1.4
const CANOPY_H    = 0.08
const CANOPY_Y    = 1.55   // top of canopy above ground

const PILLAR_H    = 1.45
const PILLAR_R    = 0.06
const PILLAR_XS   = [-(CANOPY_L / 2 - 0.3), CANOPY_L / 2 - 0.3]

const TRACK_OFFSET = 1.0   // lateral gap: track centre → platform inner edge

// ── Braking / dwell ───────────────────────────────────────────────────────
const BRAKE_T_START    = 0.055   // start braking this many t-units before station
const ARRIVAL_T_RADIUS = 0.012   // "at station" zone  (~±1.5 m on Grand Serpentin)
const DEPART_T_RADIUS  = 0.028   // must move this far away to reset arrived flag
const ARRIVAL_SPEED    = 0.18    // t-units/s: must be slower than this to count
const DWELL_TIME       = 2.8     // seconds to stop at station

// ── Types ─────────────────────────────────────────────────────────────────

export interface StationArrivalEvent {
  stationIndex: number
  name:         string
}

interface StationData {
  t:       number
  name:    string
  group:   THREE.Group
  lights:  THREE.PointLight[]
  arrived: boolean
}

// ── Default positions (tuned for Grand Serpentin) ─────────────────────────
const DEFAULT_STATIONS: Array<{ t: number; name: string }> = [
  { t: 0.08,  name: 'Nord'      },
  { t: 0.35,  name: 'Est'       },
  { t: 0.62,  name: 'Sud-Ouest' },
]

// ── Shared materials ──────────────────────────────────────────────────────
function makeMats() {
  return {
    concrete: new THREE.MeshStandardMaterial({ color: 0xd0c8b8, roughness: 0.9 }),
    roof:     new THREE.MeshStandardMaterial({ color: 0x4a6a8a, roughness: 0.6, metalness: 0.2 }),
    pillar:   new THREE.MeshStandardMaterial({ color: 0x888880, roughness: 0.7 }),
    lamp:     new THREE.MeshStandardMaterial({
      color: 0xffdd88,
      emissive: new THREE.Color(0xffcc44),
      emissiveIntensity: 0,
    }),
  }
}

// ── StationManager ────────────────────────────────────────────────────────

export class StationManager {
  private _scene:    THREE.Scene
  private _stations: StationData[] = []
  private _mats:     ReturnType<typeof makeMats> | null = null
  private _night     = false

  // Braking / approach state
  private _brakeFactor        = 1.0
  private _dwellTimer         = 0
  private _currentDwellIdx    = -1

  onArrival: ((event: StationArrivalEvent) => void) | null = null

  /** Current speed multiplier to send to TrainController.update() [0…1]. */
  get brakeFactor(): number { return this._brakeFactor }

  constructor(scene: THREE.Scene) {
    this._scene = scene
  }

  // ── Public API ────────────────────────────────────────────────────────────

  build(fn: CurveFn, defs = DEFAULT_STATIONS) {
    this.clear()
    this._mats = makeMats()
    for (let i = 0; i < defs.length; i++) {
      this._stations.push(this._buildOne(fn, defs[i].t, defs[i].name))
    }
    this.setNightMode(this._night)
  }

  /**
   * Call every tick while not paused.
   * @param trainT      current train t [0,1)
   * @param trainSpeed  actual speed in t-units/s
   * @param dt          frame delta time in seconds
   */
  update(trainT: number, trainSpeed: number, dt: number) {
    // ── Find next station ahead ───────────────────────────────────────────
    let bestAhead = Infinity
    let bestIdx   = -1
    for (let i = 0; i < this._stations.length; i++) {
      const ahead = this._tAhead(trainT, this._stations[i].t)
      if (ahead < bestAhead) { bestAhead = ahead; bestIdx = i }
    }

    // ── Arrival events ────────────────────────────────────────────────────
    for (let i = 0; i < this._stations.length; i++) {
      const s    = this._stations[i]
      const dist = this._tDist(trainT, s.t)

      if (dist < ARRIVAL_T_RADIUS) {
        if (!s.arrived && trainSpeed < ARRIVAL_SPEED) {
          s.arrived = true
          this.onArrival?.({ stationIndex: i, name: s.name })
        }
      } else if (dist > DEPART_T_RADIUS) {
        s.arrived = false
      }
    }

    // ── Brake factor (auto-stop inside BRAKE_T_START) ─────────────────────
    const inRange = bestIdx >= 0 && bestAhead < BRAKE_T_START

    if (!inRange) {
      if (this._currentDwellIdx >= 0) this._currentDwellIdx = -1
      this._brakeFactor = 1.0
      return
    }

    if (bestAhead < ARRIVAL_T_RADIUS) {
      // Inside station zone → dwell
      if (this._currentDwellIdx !== bestIdx) {
        this._currentDwellIdx = bestIdx
        this._dwellTimer      = DWELL_TIME
      }
      this._dwellTimer  = Math.max(0, this._dwellTimer - dt)
      this._brakeFactor = this._dwellTimer > 0 ? 0.0 : 1.0
    } else {
      // Approaching: linear ramp 1→0 over the braking zone
      this._currentDwellIdx = -1
      const alpha       = (bestAhead - ARRIVAL_T_RADIUS) / (BRAKE_T_START - ARRIVAL_T_RADIUS)
      this._brakeFactor = Math.max(0.05, Math.min(1.0, alpha))
    }
  }

  setNightMode(night: boolean) {
    this._night = night
    for (const s of this._stations) {
      for (const l of s.lights) l.intensity = night ? 1.4 : 0
    }
    if (this._mats) this._mats.lamp.emissiveIntensity = night ? 1.0 : 0
  }

  clear() {
    for (const s of this._stations) {
      this._scene.remove(s.group)
      s.group.traverse((obj) => { if (obj instanceof THREE.Mesh) obj.geometry.dispose() })
    }
    if (this._mats) { Object.values(this._mats).forEach(m => m.dispose()); this._mats = null }
    this._stations        = []
    this._brakeFactor     = 1.0
    this._dwellTimer      = 0
    this._currentDwellIdx = -1
  }

  dispose() { this.clear() }

  get count()             { return this._stations.length }
  get names(): string[]   { return this._stations.map(s => s.name) }

  /**
   * Returns the next station ahead and how close we are to it.
   * `proximity` goes from 0 (just left / far away) to 1 (right at station).
   */
  getNextApproach(trainT: number): { name: string; proximity: number } | null {
    if (this._stations.length === 0) return null
    let bestAhead = Infinity, bestIdx = -1
    for (let i = 0; i < this._stations.length; i++) {
      const ahead = this._tAhead(trainT, this._stations[i].t)
      if (ahead < bestAhead) { bestAhead = ahead; bestIdx = i }
    }
    if (bestIdx < 0) return null
    const WINDOW = 0.14   // start showing indicator at 14% of circuit ahead
    const proximity = bestAhead < WINDOW ? 1 - bestAhead / WINDOW : 0
    return { name: this._stations[bestIdx].name, proximity }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _buildOne(fn: CurveFn, t: number, name: string): StationData {
    const mats  = this._mats!
    const group = new THREE.Group()
    const lights: THREE.PointLight[] = []

    const base = curvePoint(fn, t, 0)
    const tang = curveTangent(fn, t)

    // Right-hand perpendicular to travel direction (track-right side)
    const right = new THREE.Vector3(tang.z, 0, -tang.x).normalize()

    // Place group so that local X = travel direction, local Z = away from track
    // (platform slab extends ±PLATFORM_L/2 along track, ±PLATFORM_W/2 perpendicular)
    const centre = base.clone()
      .addScaledVector(right, TRACK_OFFSET + PLATFORM_W / 2)
    centre.y = PLATFORM_Y

    group.position.copy(centre)

    // Correct rotation: local +X must align with world tangent direction.
    // Three.js Y-rotation: local X → (cos θ, 0, −sin θ) in world.
    // Solve cos θ = tang.x, −sin θ = tang.z  →  θ = atan2(−tang.z, tang.x)
    group.rotation.y = Math.atan2(-tang.z, tang.x)

    // ── Platform slab ─────────────────────────────────────────────────────
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(PLATFORM_L, PLATFORM_H, PLATFORM_W),
      mats.concrete,
    )
    slab.castShadow = slab.receiveShadow = true
    group.add(slab)

    // Yellow safety stripe on track-facing edge (local −Z side)
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(PLATFORM_L, 0.01, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xf5c518, roughness: 0.8 }),
    )
    stripe.position.set(0, PLATFORM_H / 2 + 0.005, -(PLATFORM_W / 2 - 0.06))
    group.add(stripe)

    // ── Canopy ────────────────────────────────────────────────────────────
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(CANOPY_L, CANOPY_H, CANOPY_W),
      mats.roof,
    )
    canopy.position.y = CANOPY_Y - PLATFORM_Y + CANOPY_H / 2
    canopy.castShadow = true
    group.add(canopy)

    // ── Pillars ───────────────────────────────────────────────────────────
    const pillarGeo = new THREE.CylinderGeometry(PILLAR_R, PILLAR_R * 1.1, PILLAR_H, 8)
    for (const px of PILLAR_XS) {
      const pillar = new THREE.Mesh(pillarGeo, mats.pillar)
      pillar.position.set(px, PILLAR_H / 2 - PLATFORM_Y + PLATFORM_H / 2, 0)
      pillar.castShadow = true
      group.add(pillar)
    }

    // ── Name sign (canvas texture) ────────────────────────────────────────
    const signTex = this._makeSignTex(name)
    const sign    = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.42, 0.04),
      new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.8 }),
    )
    // Mounted on the canopy fascia, track-facing side (local −Z)
    sign.position.set(0, CANOPY_Y - PLATFORM_Y - 0.08, -(CANOPY_W / 2 - 0.04))
    group.add(sign)

    // ── Platform lamps ────────────────────────────────────────────────────
    const lampGeo = new THREE.SphereGeometry(0.08, 8, 8)
    for (const px of PILLAR_XS) {
      const lamp = new THREE.Mesh(lampGeo, mats.lamp.clone())
      lamp.position.set(px, CANOPY_Y - PLATFORM_Y + 0.1, 0)
      group.add(lamp)

      const light = new THREE.PointLight(0xffddaa, 0, 5)
      light.position.copy(lamp.position)
      group.add(light)
      lights.push(light)
    }

    this._scene.add(group)
    return { t, name, group, lights, arrived: false }
  }

  private _makeSignTex(name: string): THREE.CanvasTexture {
    const cv = Object.assign(document.createElement('canvas'), { width: 256, height: 80 })
    const ctx = cv.getContext('2d')!
    ctx.fillStyle = '#1a3a5c'
    ctx.fillRect(0, 0, 256, 80)
    ctx.strokeStyle = '#f5c518'; ctx.lineWidth = 4
    ctx.strokeRect(3, 3, 250, 74)
    ctx.font = 'bold 28px monospace'; ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(name.toUpperCase(), 128, 40)
    const tex = new THREE.CanvasTexture(cv)
    tex.needsUpdate = true
    return tex
  }

  /** Minimum circular distance between two t values (result ∈ [0, 0.5]). */
  private _tDist(a: number, b: number): number {
    const d = Math.abs(a - b)
    return Math.min(d, 1 - d)
  }

  /** Distance *ahead* of trainT to reach stationT on the circuit (result ∈ [0, 1)). */
  private _tAhead(trainT: number, stationT: number): number {
    return ((stationT - trainT) % 1 + 1) % 1
  }
}
