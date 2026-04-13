import * as THREE from 'three'
import { CurveFn, buildSectionedCurveFn } from './curves.js'
import { buildTrack, cloneGroupMaterials, setGroupOpacity } from './TrackBuilder.js'

// ── Section builder ───────────────────────────────────────────────────────────

/** Build an open-section CurveFn from world-space control points. */
function makeSection(pts: [number, number, number][]): { fn: CurveFn; len: number } {
  const v3 = pts.map(([x, y, z]) => new THREE.Vector3(x, y, z))
  const curve = new THREE.CatmullRomCurve3(v3, false, 'catmullrom', 0.5)
  const len = curve.getLength()
  return {
    fn: (t) => {
      const p = curve.getPoint(Math.max(0, Math.min(1, t)))
      return { x: p.x, y: p.y, z: p.z }
    },
    len,
  }
}

// ── Geometry ──────────────────────────────────────────────────────────────────

//  Junction layout (top view):
//
//       JLT──── top arc ────JRT
//      /  \                /  \
//   leftB  leftA      rightA  rightB
//      \  /                \  /
//       JLB──── bot arc ────JRB
//
//  Train direction: JRT → JLT → [left] → JLB → JRB → [right] → JRT

const JRT: [number, number, number] = [ 5, 0, -1.5]
const JLT: [number, number, number] = [-5, 0, -1.5]
const JLB: [number, number, number] = [-5, 0,  1.5]
const JRB: [number, number, number] = [ 5, 0,  1.5]

const topSection  = makeSection([JRT, [0, 0, -8], JLT])
const leftASection = makeSection([JLT, [-5, 0, 0],  JLB])
const leftBSection = makeSection([JLT, [-8.5, 0, 0], JLB])
const botSection  = makeSection([JLB, [0, 0,  8], JRB])
const rightASection = makeSection([JRB, [ 5, 0, 0],  JRT])
const rightBSection = makeSection([JRB, [ 8.5, 0, 0], JRT])

// ── Exported interface ────────────────────────────────────────────────────────

export interface TwoSwitchPreset {
  topGroup:    THREE.Group
  leftAGroup:  THREE.Group
  leftBGroup:  THREE.Group
  botGroup:    THREE.Group
  rightAGroup: THREE.Group
  rightBGroup: THREE.Group
  fnAA: CurveFn  // sw0=A sw1=A
  fnAB: CurveFn  // sw0=A sw1=B
  fnBA: CurveFn  // sw0=B sw1=A
  fnBB: CurveFn  // sw0=B sw1=B
  sw0ForkPos: { x: number; y: number; z: number }
  sw1ForkPos: { x: number; y: number; z: number }
}

export function createTwoSwitchPreset(): TwoSwitchPreset {
  // Build open section groups
  const topGroup    = buildTrack(topSection.fn, true).group
  const leftAGroup  = buildTrack(leftASection.fn, true).group
  const leftBGroup  = buildTrack(leftBSection.fn, true).group
  const botGroup    = buildTrack(botSection.fn, true).group
  const rightAGroup = buildTrack(rightASection.fn, true).group
  const rightBGroup = buildTrack(rightBSection.fn, true).group

  // Clone materials so opacity can be set per-group
  for (const g of [topGroup, leftAGroup, leftBGroup, botGroup, rightAGroup, rightBGroup]) {
    cloneGroupMaterials(g)
  }

  // Shared sections are always full opacity
  setGroupOpacity(topGroup, 1.0)
  setGroupOpacity(botGroup, 1.0)

  // Default: sw0=A, sw1=A → A paths full, B paths dim
  setGroupOpacity(leftAGroup,  1.0)
  setGroupOpacity(leftBGroup,  0.25)
  setGroupOpacity(rightAGroup, 1.0)
  setGroupOpacity(rightBGroup, 0.25)

  // Precompute all 4 combined CurveFns
  const fnAA = buildSectionedCurveFn([topSection, leftASection, botSection, rightASection])
  const fnAB = buildSectionedCurveFn([topSection, leftASection, botSection, rightBSection])
  const fnBA = buildSectionedCurveFn([topSection, leftBSection, botSection, rightASection])
  const fnBB = buildSectionedCurveFn([topSection, leftBSection, botSection, rightBSection])

  return {
    topGroup, leftAGroup, leftBGroup, botGroup, rightAGroup, rightBGroup,
    fnAA, fnAB, fnBA, fnBB,
    sw0ForkPos: { x: JLT[0], y: JLT[1], z: JLT[2] },
    sw1ForkPos: { x: JRB[0], y: JRB[1], z: JRB[2] },
  }
}
