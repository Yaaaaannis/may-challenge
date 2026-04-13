import * as THREE from 'three'

export type CurveFn = (t: number) => { x: number; y: number; z: number }

export interface TrackCircuit {
  name: string
  fn: CurveFn
}

export const CIRCUITS: TrackCircuit[] = [
  {
    name: 'Cercle',
    fn: (t) => ({
      x: 4.5 * Math.cos(2 * Math.PI * t),
      y: 0,
      z: 4.5 * Math.sin(2 * Math.PI * t),
    }),
  },
  {
    name: 'Ovale',
    fn: (t) => ({
      x: 7.2 * Math.cos(2 * Math.PI * t),
      y: 0,
      z: 3.6 * Math.sin(2 * Math.PI * t),
    }),
  },
  {
    name: 'Huit ∞',
    fn: (t) => ({
      x: 4.8 * Math.sin(2 * Math.PI * t),
      y: 0,
      z: 3.2 * Math.sin(4 * Math.PI * t),
    }),
  },
  // ── Grand Serpentin ──────────────────────────────────────────────────────────
  // Large hand-crafted loop (~40×38 units) with elevation changes.
  // Designed to accommodate 5 stations and showcase all biomes/features.
  {
    name: 'Grand Serpentin',
    fn: (() => {
      const raw: [number, number, number][] = [
        [  0,  0.0, -21 ],  //  0  North
        [  9,  0.0, -18 ],  //  1  NNE
        [ 17,  0.0, -11 ],  //  2  ENE
        [ 21,  1.8,  -2 ],  //  3  E rise
        [ 19,  2.6,   7 ],  //  4  E peak
        [ 12,  1.2,  15 ],  //  5  SE descent
        [  3,  0.0,  20 ],  //  6  SSE flat
        [ -6,  0.9,  20 ],  //  7  SSW gentle hill
        [-14,  0.0,  14 ],  //  8  SW
        [-21,  2.2,   4 ],  //  9  W hill
        [-22,  2.4,  -5 ],  // 10  WNW peak
        [-16,  0.5, -14 ],  // 11  NW
        [ -7,  0.0, -20 ],  // 12  NNW
      ]
      const pts  = raw.map(([x, y, z]) => new THREE.Vector3(x, y, z))
      const crv  = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5)
      return (t: number): { x: number; y: number; z: number } => {
        const p = crv.getPoint(((t % 1) + 1) % 1)
        return { x: p.x, y: p.y, z: p.z }
      }
    })(),
  },
]

const CURVE_SAMPLES = 256
const TANGENT_D = 0.001

/** Build a CatmullRomCurve3 from a parametric function (XYZ).
 *  Pass open=true for an open section (non-looping). */
export function buildCatmullRom(fn: CurveFn, yOffset = 0, open = false): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = []
  // For open sections, include t=1 endpoint; for closed loops, t=1 wraps to t=0
  const count = open ? CURVE_SAMPLES + 1 : CURVE_SAMPLES
  for (let i = 0; i < count; i++) {
    const t = i / CURVE_SAMPLES   // goes 0 → 1 (inclusive for open)
    const { x, y, z } = fn(t)
    pts.push(new THREE.Vector3(x, y + yOffset, z))
  }
  return new THREE.CatmullRomCurve3(pts, !open)
}

/** Combine open section CurveFns into one closed-loop CurveFn.
 *  Each entry maps t∈[0,1] over its own arc; len is the arc length. */
export function buildSectionedCurveFn(
  sections: Array<{ fn: CurveFn; len: number }>,
): CurveFn {
  const totalLen = sections.reduce((s, e) => s + e.len, 0)
  if (totalLen === 0) return () => ({ x: 0, y: 0, z: 0 })

  return (t: number) => {
    const target = ((t % 1) + 1) % 1 * totalLen
    let cum = 0
    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i]
      if (cum + sec.len >= target || i === sections.length - 1) {
        const localT = sec.len > 0 ? (target - cum) / sec.len : 0
        return sec.fn(Math.max(0, Math.min(1, localT)))
      }
      cum += sec.len
    }
    return sections[0].fn(0)
  }
}

/** Position on curve for a normalised t ∈ [0,1). */
export function curvePoint(fn: CurveFn, t: number, yOffset = 0): THREE.Vector3 {
  const { x, y, z } = fn(((t % 1) + 1) % 1)
  return new THREE.Vector3(x, y + yOffset, z)
}

/** Normalised tangent at t (finite difference). */
export function curveTangent(fn: CurveFn, t: number): THREE.Vector3 {
  const a = curvePoint(fn, t - TANGENT_D)
  const b = curvePoint(fn, t + TANGENT_D)
  return b.sub(a).normalize()
}

/** Estimate total arc length of a closed curve by sampling N segments. */
export function estimateCurveLength(fn: CurveFn, samples = 256): number {
  let len = 0
  let prev = curvePoint(fn, 0)
  for (let i = 1; i <= samples; i++) {
    const pt = curvePoint(fn, i / samples)
    len += pt.distanceTo(prev)
    prev = pt
  }
  return len
}

/**
 * Arc-length parameterisation table for a closed curve.
 * Allows converting between t [0,1) ↔ arc-length s [0, total).
 */
export class ArcLengthTable {
  readonly total: number
  private readonly _sAtT: Float32Array   // _sAtT[i] = arc-length at t = i/N
  private readonly N: number

  constructor(fn: CurveFn, N = 512) {
    this.N = N
    this._sAtT = new Float32Array(N + 1)
    let s = 0
    let prev = curvePoint(fn, 0)
    this._sAtT[0] = 0
    for (let i = 1; i <= N; i++) {
      const pt = curvePoint(fn, i / N)
      s += pt.distanceTo(prev)
      this._sAtT[i] = s
      prev = pt
    }
    this.total = s
  }

  /** t [0,1) → arc-length in world units */
  tToS(t: number): number {
    t = ((t % 1) + 1) % 1
    const fi = t * this.N
    const i  = Math.floor(fi)
    const f  = fi - i
    return this._sAtT[i] + f * (this._sAtT[Math.min(i + 1, this.N)] - this._sAtT[i])
  }

  /** arc-length (wraps around total) → t [0,1) */
  sToT(s: number): number {
    s = ((s % this.total) + this.total) % this.total
    let lo = 0, hi = this.N
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1
      if (this._sAtT[mid] <= s) lo = mid; else hi = mid
    }
    const s0 = this._sAtT[lo], s1 = this._sAtT[hi]
    return (lo + (s1 > s0 ? (s - s0) / (s1 - s0) : 0)) / this.N
  }
}

/** Find the nearest t ∈ [0,1) on the curve to a world-space position. */
export function findNearestT(
  fn: CurveFn,
  worldPos: THREE.Vector3,
  yOffset = 0,
  samples = 300,
): { t: number; point: THREE.Vector3; dist: number } {
  let minDist = Infinity
  let bestT = 0
  let bestPt = new THREE.Vector3()
  for (let i = 0; i < samples; i++) {
    const t = i / samples
    const pt = curvePoint(fn, t, yOffset)
    const d = pt.distanceTo(worldPos)
    if (d < minDist) { minDist = d; bestT = t; bestPt = pt }
  }
  return { t: bestT, point: bestPt, dist: minDist }
}
