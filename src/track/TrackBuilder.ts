import * as THREE from 'three'
import { CurveFn, buildCatmullRom, curvePoint, curveTangent } from './curves.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Clone all materials inside a group so they can be independently modified. */
export function cloneGroupMaterials(group: THREE.Group) {
  group.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh
      if (Array.isArray(mesh.material)) {
        mesh.material = (mesh.material as THREE.Material[]).map(m => m.clone())
      } else {
        mesh.material = (mesh.material as THREE.Material).clone()
      }
    }
  })
}

/** Set opacity on all meshes in a group. */
export function setGroupOpacity(group: THREE.Group, opacity: number) {
  group.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh
      const mats = Array.isArray(mesh.material)
        ? (mesh.material as THREE.MeshStandardMaterial[])
        : [mesh.material as THREE.MeshStandardMaterial]
      for (const m of mats) {
        m.transparent = opacity < 1
        m.opacity = opacity
      }
    }
  })
}

/** Dispose geometries and cloned materials of a group. */
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

const RAIL_RADIUS = 0.04
const RAIL_GAUGE = 0.55         // demi-écartement (±Z)
const TIE_COUNT = 120
const TIE_W = 0.08
const TIE_H = 0.06
const TIE_D = 1.1
const RAIL_Y = 0.18             // hauteur des rails au-dessus du sol
const TIE_Y = RAIL_Y - 0.06

// Matériaux partagés entre reconstructions
const railMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.6, metalness: 0.8 })
const tieMat  = new THREE.MeshStandardMaterial({ color: 0x5c3d1e, roughness: 0.9 })

export interface TrackMeshes {
  group: THREE.Group
}

/** Build track geometry. Pass open=true for a non-looping section. */
export function buildTrack(fn: CurveFn, open = false): TrackMeshes {
  const group = new THREE.Group()

  // ── Rails (×2) ──────────────────────────────────────────────────────────────
  for (const side of [-1, 1]) {
    const offsetFn: CurveFn = (t) => {
      const { x, y, z } = fn(t)
      const tang = curveTangent(fn, t)
      return {
        x: x + side * RAIL_GAUGE * tang.z,
        y,
        z: z - side * RAIL_GAUGE * tang.x,
      }
    }
    const curve = buildCatmullRom(offsetFn, RAIL_Y, open)
    const geo = new THREE.TubeGeometry(curve, 256, RAIL_RADIUS, 8, !open)
    group.add(new THREE.Mesh(geo, railMat))
  }

  // ── Traverses ────────────────────────────────────────────────────────────────
  const tieGeo = new THREE.BoxGeometry(TIE_W, TIE_H, TIE_D)
  for (let i = 0; i < TIE_COUNT; i++) {
    const t = i / TIE_COUNT
    const pos = curvePoint(fn, t, TIE_Y)
    const tang = curveTangent(fn, t)
    const mesh = new THREE.Mesh(tieGeo, tieMat)
    mesh.position.copy(pos)
    mesh.rotation.y = Math.atan2(tang.x, tang.z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  }

  // ── Viaduct supports ─────────────────────────────────────────────────────────
  const VIADUCT_THRESHOLD = 0.35
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x7a7a7a, roughness: 0.9 })
  for (let i = 0; i < 200; i++) {
    const t = i / 200
    const pt = curvePoint(fn, t, 0)
    if (pt.y > VIADUCT_THRESHOLD) {
      const h = pt.y + RAIL_Y + 0.1
      const pillarGeo = new THREE.CylinderGeometry(0.07, 0.09, h, 8)
      const pillar = new THREE.Mesh(pillarGeo, pillarMat)
      pillar.position.set(pt.x, h / 2, pt.z)
      pillar.castShadow = true
      group.add(pillar)
    }
  }

  return { group }
}
