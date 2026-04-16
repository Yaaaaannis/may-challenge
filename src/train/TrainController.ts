import * as THREE from 'three'
import { Locomotive } from './Locomotive.js'
import { Wagon, WHEEL_RADIUS } from './Wagon.js'
import { CurveFn, curveTangent, findNearestT, ArcLengthTable } from '../track/curves.js'
import type { VehicleInfo } from '../ui/Minimap.js'

// Physical world-unit spacing (independent of circuit size)
const FIRST_WAGON_DIST    = 1.74   // world units: loco rear → first wagon front
const WAGON_INTERVAL_DIST = 1.60   // world units: wagon rear → next wagon front
const WAGON_COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c]
const REF_WHEEL_R = 0.10

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export class TrainController {
  private scene: THREE.Scene
  private loco: Locomotive
  private wagons: Wagon[] = []
  private _wagonColors: number[] = []
  private _arcTable: ArcLengthTable | null = null

  private _baseSpeed   = 0.8
  private _actualSpeed = 0.8
  private _rawAngle = 0
  private wheelRot  = 0

  // Véhicules retirés du rail (déraillés ou en cours de grab)
  private offRailWagons = new Set<Wagon>()
  private locoOffRail   = false

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.loco  = new Locomotive(scene)
  }

  get speed() { return this._actualSpeed }
  set speed(v: number) { this._baseSpeed = v }

  async loadLocomotive(glbUrl: string) {
    await this.loco.load(glbUrl)
  }

  // ── Rail state ─────────────────────────────────────────────────────────────

  /** Retire un wagon (ou la loco si null) du rail — le contrôleur ne le repositionne plus. */
  removeFromRail(wagon: Wagon | null) {
    if (wagon === null) this.locoOffRail = true
    else this.offRailWagons.add(wagon)
  }

  /** Remet un wagon sur le rail à la position t donnée sur la courbe [0,1). */
  rerailWagon(wagon: Wagon, curveT: number) {
    if (this._arcTable) {
      const locoT = ((this._rawAngle / (2 * Math.PI)) % 1 + 1) % 1
      const locoS = this._arcTable.tToS(locoT)
      const wagonS = this._arcTable.tToS(((curveT % 1) + 1) % 1)
      wagon.arcDist = ((locoS - wagonS) % this._arcTable.total + this._arcTable.total) % this._arcTable.total
    }
    this.offRailWagons.delete(wagon)
  }

  /** Remet la loco sur le rail en ajustant rawAngle. */
  rerailLoco(curveT: number) {
    this._rawAngle = curveT * 2 * Math.PI
    this.locoOffRail = false
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  update(fn: CurveFn, dt: number, signalBrake = 1.0) {
    const t = ((this._rawAngle / (2 * Math.PI)) % 1 + 1) % 1

    // ── Dynamic speed ────────────────────────────────────────────────────────
    const tangA = curveTangent(fn, t)
    const tangB = curveTangent(fn, t + 0.008)
    const curveAngle = tangA.angleTo(tangB) / 0.008
    const speedFactor = clamp(1.0 - curveAngle * 1.2, 0.38, 1.0)

    const slope = curveTangent(fn, t).y
    const slopeBonus = -slope * 1.5

    const targetSpeed = (this._baseSpeed * speedFactor + slopeBonus * this._baseSpeed) * signalBrake
    const lerpRate    = signalBrake < 0.3 ? dt * 6.0 : dt * 2.5   // brake harder when stopping
    this._actualSpeed = lerp(this._actualSpeed, targetSpeed, lerpRate)
    if (signalBrake === 0 && this._actualSpeed < 0.005) this._actualSpeed = 0

    this._rawAngle += this._actualSpeed * dt
    this.wheelRot  += (this._actualSpeed * dt * REF_WHEEL_R) / WHEEL_RADIUS

    const tNew = ((this._rawAngle / (2 * Math.PI)) % 1 + 1) % 1

    if (!this.locoOffRail) this.loco.update(fn, tNew, this.wheelRot)

    if (this._arcTable) {
      const locoS = this._arcTable.tToS(tNew)
      for (const wagon of this.wagons) {
        if (!this.offRailWagons.has(wagon)) {
          const wagonT = this._arcTable.sToT(locoS - wagon.arcDist)
          wagon.update(fn, wagonT, this.wheelRot)
        }
      }
    } else {
      for (const wagon of this.wagons) {
        if (!this.offRailWagons.has(wagon)) {
          wagon.update(fn, tNew, this.wheelRot)
        }
      }
    }
  }

  // ── Wagons ─────────────────────────────────────────────────────────────────

  get wagonsCount() { return this.wagons.length }

  addWagon() {
    const idx   = this.wagons.length
    const dist  = FIRST_WAGON_DIST + idx * WAGON_INTERVAL_DIST
    const color = WAGON_COLORS[idx % WAGON_COLORS.length]
    this._wagonColors.push(color)
    this.wagons.push(new Wagon(this.scene, color, dist))
  }

  /** Build arc-length table for a new circuit — call after every circuit switch. */
  rebuildWagonOffsets(fn: CurveFn) {
    this._arcTable = new ArcLengthTable(fn)
    // arcDist is in world units so no recalculation needed — the table handles the mapping
  }

  removeWagon() {
    const w = this.wagons.pop()
    if (w) {
      this._wagonColors.pop()
      this.offRailWagons.delete(w)
      w.dispose(this.scene)
    }
  }

  setWagonCount(n: number) {
    while (this.wagons.length < n) this.addWagon()
    while (this.wagons.length > n) this.removeWagon()
  }

  // ── Misc ───────────────────────────────────────────────────────────────────

  setNightMode(night: boolean) {
    for (const w of this.wagons) w.setNightMode(night)
  }

  reset() {
    this._rawAngle    = 0
    this.wheelRot     = 0
    this.locoOffRail  = false
    this.offRailWagons.clear()
  }

  /** Smoothly remap train position to the nearest point on a new CurveFn.
   *  Keeps the train moving without teleporting back to t=0. */
  remapToFn(newFn: CurveFn) {
    const locoPos = new THREE.Vector3()
    this.loco.group.getWorldPosition(locoPos)
    const nearest = findNearestT(newFn, locoPos, 0, 400)
    // Preserve accumulated laps so _rawAngle stays monotonically increasing
    const laps = Math.floor(this._rawAngle / (2 * Math.PI))
    this._rawAngle = (laps + nearest.t) * 2 * Math.PI
  }

  get rawAngle()  { return this._rawAngle }
  get t()         { return ((this._rawAngle / (2 * Math.PI)) % 1 + 1) % 1 }
  get locomotive(){ return this.loco }
  get allWagons() { return this.wagons }
  get arcTable()  { return this._arcTable }

  /** t position of every on-rail vehicle (loco first, then wagons in order). */
  getVehicleTs(): Array<{ group: THREE.Group; wagon: Wagon | null; t: number }> {
    const locoT  = this.t
    const result: Array<{ group: THREE.Group; wagon: Wagon | null; t: number }> = [
      { group: this.loco.group, wagon: null, t: locoT },
    ]
    if (this._arcTable) {
      const locoS = this._arcTable.tToS(locoT)
      for (const wagon of this.wagons) {
        if (!this.offRailWagons.has(wagon)) {
          result.push({
            group: wagon.group,
            wagon,
            t: this._arcTable.sToT(locoS - wagon.arcDist),
          })
        }
      }
    }
    return result
  }

  /** All vehicles as { group, wagon } — wagon=null means loco. */
  getGrabbables(): { group: THREE.Group; wagon: Wagon | null }[] {
    return [
      { group: this.loco.group, wagon: null },
      ...this.wagons.map(w => ({ group: w.group, wagon: w })),
    ]
  }

  /** Returns world position + forward direction for all vehicles (loco first). */
  getVehicleData(): VehicleInfo[] {
    const result: VehicleInfo[] = []
    const pos = new THREE.Vector3()
    const fwd = new THREE.Vector3()

    this.loco.group.getWorldPosition(pos)
    this.loco.group.getWorldDirection(fwd)
    result.push({ pos: pos.clone(), forward: fwd.clone(), isLoco: true, color: 0x2c2c2c })

    for (let i = 0; i < this.wagons.length; i++) {
      this.wagons[i].group.getWorldPosition(pos)
      this.wagons[i].group.getWorldDirection(fwd)
      result.push({ pos: pos.clone(), forward: fwd.clone(), isLoco: false, color: this._wagonColors[i] ?? 0xaaaaaa })
    }
    return result
  }

  dispose() {
    this.loco.dispose()
    for (const w of this.wagons) w.dispose(this.scene)
    this.wagons = []
  }
}
