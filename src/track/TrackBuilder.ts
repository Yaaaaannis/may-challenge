import * as THREE from 'three'
import { CurveFn, curvePoint, curveTangent } from './curves.js'

// ── Material helpers ──────────────────────────────────────────────────────────

export function cloneGroupMaterials(group: THREE.Group) {
  group.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh
      if (Array.isArray(mesh.material))
        mesh.material = (mesh.material as THREE.Material[]).map(m => m.clone())
      else
        mesh.material = (mesh.material as THREE.Material).clone()
    }
  })
}

export function setGroupOpacity(group: THREE.Group, opacity: number) {
  group.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh
      const mats = Array.isArray(mesh.material)
        ? (mesh.material as THREE.MeshStandardMaterial[])
        : [mesh.material as THREE.MeshStandardMaterial]
      for (const m of mats) { m.transparent = opacity < 1; m.opacity = opacity }
    }
  })
}

export function disposeGroup(group: THREE.Group) {
  group.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh
      mesh.geometry.dispose()
      const mats = Array.isArray(mesh.material)
        ? (mesh.material as THREE.Material[])
        : [mesh.material as THREE.Material]
      for (const m of mats) m.dispose()
    }
  })
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const RAIL_GAUGE = 0.55   // groove centre ±lateral from track centre
const RAIL_SAMPLES      = 300

// ── BRIO wooden plank cross-section ──────────────────────────────────────────
//
// Les bords extérieurs (au-delà de la rainure) forment une PAROI SURÉLEVÉE
// qui guide les roues — exactement comme sur les vraies planches BRIO.
//
//   ┌─────┐                         ┌─────┐   y = +LIFT  (paroi extérieure haute)
//   │     ├──┐                   ┌──┤     │
//   │     │  │    centre plat    │  │     │   y = 0
//   │     │  └───────────────────┘  │     │
//   │     └────── fond rainure ──── ┘     │   y = -GD
//   └─────────────────────────────────────┘   y = -PH  (dessous planche)

const PH   = 0.082   // épaisseur totale de la planche
const PHW  = 0.70    // demi-largeur (total = 1.40 u)
const PBV  = 0.022   // biseau bord inférieur
const GHW  = 0.030   // demi-largeur de la rainure
const GD   = 0.030   // profondeur de la rainure sous le centre
const LIFT = 0.052   // hauteur de la paroi extérieure au-dessus du centre

const GR = RAIL_GAUGE  // alias

// Profile — sens horaire → normales vers l'extérieur (14 points)
const TRACK_PROFILE: [number, number][] = [
  // ── Dessous ──────────────────────────────────────────────────
  [-(PHW - PBV), -PH        ],   //  0  bas-gauche biseau
  [ (PHW - PBV), -PH        ],   //  1  bas-droite biseau
  [  PHW,        -PH + PBV  ],   //  2  biseau droit fin
  // ── Paroi extérieure droite (surélevée) ──────────────────────
  [  PHW,         LIFT       ],   //  3  sommet paroi droite
  [  GR + GHW,    LIFT       ],   //  4  sommet paroi : bord intérieur
  // ── Rainure droite ──────────────────────────────────────────
  //    La face extérieure de la rainure descend depuis LIFT jusqu'à -GD
  [  GR + GHW,   -GD         ],   //  5  fond rainure : côté extérieur
  [  GR - GHW,   -GD         ],   //  6  fond rainure : côté intérieur
  [  GR - GHW,    0          ],   //  7  surface centre : bord droit
  // ── Surface centrale plate ────────────────────────────────────
  [ -(GR - GHW),  0          ],   //  8  surface centre : bord gauche
  // ── Rainure gauche ──────────────────────────────────────────
  [ -(GR - GHW), -GD         ],   //  9  fond rainure : côté intérieur
  [ -(GR + GHW), -GD         ],   // 10  fond rainure : côté extérieur
  // ── Paroi extérieure gauche (surélevée) ──────────────────────
  [ -(GR + GHW),  LIFT       ],   // 11  sommet paroi : bord intérieur
  [ -PHW,         LIFT       ],   // 12  sommet paroi gauche
  [ -PHW,        -PH + PBV   ],   // 13  biseau gauche fin
]

// ── Materials ─────────────────────────────────────────────────────────────────

// Light natural maple / beech — the characteristic BRIO blonde wood
const plankMat = new THREE.MeshStandardMaterial({
  color:     0xecc86c,
  roughness: 0.88,
  metalness: 0.0,
})

// Slightly warmer/darker interior for groove shadow contrast
const grooveMat = new THREE.MeshStandardMaterial({
  color:     0xc8942e,
  roughness: 0.90,
  metalness: 0.0,
})

// Support posts — darker honey wood
const postMat = new THREE.MeshStandardMaterial({
  color:     0xb87828,
  roughness: 0.92,
  metalness: 0.0,
})
const beamMat = new THREE.MeshStandardMaterial({
  color:     0xd4962e,
  roughness: 0.88,
  metalness: 0.0,
})

// ── Profile extrusion ─────────────────────────────────────────────────────────

function buildProfileExtrusion(
  curveFn:  CurveFn,
  yBase:    number,
  profile:  [number, number][],
  samples:  number,
  open:     boolean,
  mat:      THREE.Material,
): THREE.Mesh {
  const M         = profile.length
  const ringCount = samples + 1
  const positions = new Float32Array(ringCount * M * 3)
  const uvData    = new Float32Array(ringCount * M * 2)

  for (let i = 0; i < ringCount; i++) {
    const tRaw = i / samples
    const t    = open ? tRaw : ((tRaw % 1) + 1) % 1
    const pt   = curvePoint(curveFn, t, yBase)
    const tang = curveTangent(curveFn, t)

    const wUp   = new THREE.Vector3(0, 1, 0)
    const right = tang.clone().cross(wUp).normalize()
    const up    = right.clone().cross(tang).normalize()

    for (let j = 0; j < M; j++) {
      const [px, py] = profile[j]
      const b = (i * M + j) * 3
      positions[b]     = pt.x + right.x * px + up.x * py
      positions[b + 1] = pt.y + right.y * px + up.y * py
      positions[b + 2] = pt.z + right.z * px + up.z * py
      const u = (i * M + j) * 2
      uvData[u]     = j / M
      uvData[u + 1] = tRaw * 25
    }
  }

  const idx: number[] = []
  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < M; j++) {
      const jn = (j + 1) % M
      const a = i * M + j,       b = i * M + jn
      const c = (i + 1) * M + j, d = (i + 1) * M + jn
      idx.push(a, c, b, b, c, d)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('uv',       new THREE.BufferAttribute(uvData, 2))
  geo.setIndex(idx)
  geo.computeVertexNormals()

  const mesh = new THREE.Mesh(geo, mat)
  mesh.castShadow    = true
  mesh.receiveShadow = true
  return mesh
}

// ── Groove-only sub-profile (for darker material on groove faces) ─────────────
//
// We split the extrusion into two meshes:
//   1. Plank (all faces except groove floors/walls) → plankMat
//   2. Groove interiors                             → grooveMat
//
// For simplicity we build separate groove-profile meshes using the lateral-
// offset curve centred on each rail, sweeping just the U cross-section.

const GROOVE_PROFILE: [number, number][] = [
  [ GHW,  0   ],   // top-right (flush with plank surface)
  [ GHW, -GD  ],   // right wall bottom
  [-GHW, -GD  ],   // floor left end
  [-GHW,  0   ],   // top-left
]

function lateralOffset(fn: CurveFn, side: number): CurveFn {
  return (t) => {
    const { x, y, z } = fn(t)
    const tang = curveTangent(fn, t)
    return {
      x: x + side * RAIL_GAUGE * tang.z,
      y,
      z: z - side * RAIL_GAUGE * tang.x,
    }
  }
}

// ── Wooden bridge support ─────────────────────────────────────────────────────
//
// BRIO-style portal frame: two rectangular posts + top cross-beam.
// All light/honey wood, no metal.

function buildBridgeSupport(
  pt:      THREE.Vector3,
  tang:    THREE.Vector3,
  totalH:  number,
  group:   THREE.Group,
): void {
  const wUp   = new THREE.Vector3(0, 1, 0)
  const right = tang.clone().cross(wUp).normalize()
  const angle = Math.atan2(tang.x, tang.z)

  const POST_HALF  = RAIL_GAUGE + 0.20
  const POST_W     = 0.14
  const POST_D     = 0.18
  const BEAM_H     = 0.13
  const BEAM_D     = 0.22
  const BEAM_SPAN  = POST_HALF * 2 + POST_W + 0.10
  const BASE_H     = 0.07

  // ── Ground base slab ──────────────────────────────────────────
  const baseGeo  = new THREE.BoxGeometry(BEAM_SPAN + 0.08, BASE_H, BEAM_D + 0.04)
  const baseMesh = new THREE.Mesh(baseGeo, postMat)
  baseMesh.castShadow    = true
  baseMesh.receiveShadow = true
  const baseGrp = new THREE.Group()
  baseGrp.add(baseMesh)
  baseGrp.rotation.y = angle
  baseGrp.position.set(pt.x, BASE_H * 0.5, pt.z)
  group.add(baseGrp)

  // ── Posts (×2) ────────────────────────────────────────────────
  for (const side of [-1, 1]) {
    const cx = pt.x + right.x * side * POST_HALF
    const cz = pt.z + right.z * side * POST_HALF

    const postGeo  = new THREE.BoxGeometry(POST_W, totalH - BASE_H, POST_D)
    const postMesh = new THREE.Mesh(postGeo, postMat)
    postMesh.castShadow    = true
    postMesh.receiveShadow = true

    const postGrp = new THREE.Group()
    postGrp.add(postMesh)
    postGrp.rotation.y = angle
    postGrp.position.set(cx, BASE_H + (totalH - BASE_H) * 0.5, cz)
    group.add(postGrp)
  }

  // ── Cross-beam on top ─────────────────────────────────────────
  const beamGeo  = new THREE.BoxGeometry(BEAM_SPAN, BEAM_H, BEAM_D)
  const beamMesh = new THREE.Mesh(beamGeo, beamMat)
  beamMesh.castShadow = true

  const beamGrp = new THREE.Group()
  beamGrp.add(beamMesh)
  beamGrp.rotation.y = angle
  beamGrp.position.set(pt.x, totalH + BEAM_H * 0.5, pt.z)
  group.add(beamGrp)

  // ── Small rounded cap on each post top ───────────────────────
  const capGeo = new THREE.CylinderGeometry(POST_W * 0.38, POST_W * 0.42, 0.06, 8)
  for (const side of [-1, 1]) {
    const cx  = pt.x + right.x * side * POST_HALF
    const cz  = pt.z + right.z * side * POST_HALF
    const cap = new THREE.Mesh(capGeo, beamMat)
    cap.position.set(cx, totalH + BEAM_H + 0.03, cz)
    group.add(cap)
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface TrackMeshes { group: THREE.Group }

export function buildTrack(fn: CurveFn, open = false): TrackMeshes {
  const group = new THREE.Group()

  // ── Main plank (full cross-section with grooves) ──────────────
  // yBase = PH so the top surface (y=0 in profile) sits at curve.y + PH
  // and the bottom (y=-PH) rests at curve.y ≈ ground level.
  group.add(buildProfileExtrusion(fn, PH, TRACK_PROFILE, RAIL_SAMPLES, open, plankMat))

  // ── Groove interiors (darker wood tones inside each channel) ──
  for (const side of [-1, 1]) {
    const offFn = lateralOffset(fn, side)
    group.add(buildProfileExtrusion(offFn, PH, GROOVE_PROFILE, RAIL_SAMPLES, open, grooveMat))
  }

  // ── Elevated bridge supports ──────────────────────────────────
  const VIADUCT_THRESHOLD = 0.38
  const SUPPORT_SPACING   = 2.0
  let   lastSupportS      = -SUPPORT_SPACING

  let arcLen = 0
  let prevPt = curvePoint(fn, 0, 0)

  for (let i = 1; i <= 500; i++) {
    const t  = i / 500
    const pt = curvePoint(fn, t, 0)
    arcLen  += pt.distanceTo(prevPt)
    prevPt   = pt

    if (pt.y > VIADUCT_THRESHOLD && arcLen - lastSupportS >= SUPPORT_SPACING) {
      lastSupportS = arcLen
      const tang   = curveTangent(fn, t)
      buildBridgeSupport(pt, tang, pt.y + PH + 0.06, group)
    }
  }

  return { group }
}
