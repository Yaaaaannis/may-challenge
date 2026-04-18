import * as THREE from 'three'
import { CurveFn, curvePoint, curveTangent } from '../track/curves.js'

// ── Dimensions ────────────────────────────────────────────────────────────────

const WAGON_Y     = 0.32   // centre height above curve Y

// Body
const BODY_L  = 1.28   // along track (X in inner space)
const BODY_H  = 0.56   // height
const BODY_W  = 0.60   // width (Z in inner space, becomes lateral after rotation)

// Roof (slightly arched cylinder segment)
const ROOF_R       = 0.52   // cylinder radius for arch
const ROOF_HALF_ANG = 0.60  // half-angle of arc in radians (~34°)
const ROOF_SEG      = 10

// Bogie truck
const BOGIE_OFFSET  = 0.38   // ±X from body centre (along track)
const BOGIE_Z_HALF  = 0.22   // ±Z (lateral) — wheel gauge
const BOGIE_WHEEL_R = 0.120
const BOGIE_WHEEL_T = 0.055
const BOGIE_FRAME_L = 0.44
const BOGIE_FRAME_H = 0.06
const BOGIE_FRAME_W = BOGIE_Z_HALF * 2 + BOGIE_WHEEL_T + 0.02

// Window
const WIN_W  = 0.22
const WIN_H  = 0.18
const WIN_D  = 0.008

// Buffer plate
const BUF_H = 0.10
const BUF_D = 0.05

// Reference for wheel-roll
export const WAGON_BODY_REF_R = 4.5
export const WHEEL_RADIUS     = BOGIE_WHEEL_R

// ── Shared materials ──────────────────────────────────────────────────────────

const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.6 })
const axleMat  = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.6, metalness: 0.7 })
const roofMat  = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.0 })
const bufMat   = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.7 })
const handleMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5, metalness: 0.6 })

const WIN_COLOR_DAY   = 0x88ccff
const WIN_COLOR_NIGHT = 0xffffaa

// ── Wagon class ───────────────────────────────────────────────────────────────

export class Wagon {
  readonly group = new THREE.Group()
  private inner  = new THREE.Group()

  private bodyMesh!:     THREE.Mesh
  private bogieGroups:   THREE.Group[]  = []    // [front, rear] bogie groups (rotate with track)
  private spinGroups:    THREE.Group[]  = []    // individual wheel spin groups
  private windowMeshes: THREE.Mesh[]   = []

  arcDist: number

  constructor(scene: THREE.Scene, color: number, arcDist: number) {
    this.arcDist = arcDist
    this._build(color)
    this.group.add(this.inner)
    scene.add(this.group)
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  private _build(color: number) {
    const bodyMat  = new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.0 })
    const bodyGeo  = new THREE.BoxGeometry(BODY_L, BODY_H, BODY_W)
    this.bodyMesh  = new THREE.Mesh(bodyGeo, bodyMat)
    this.bodyMesh.castShadow    = true
    this.bodyMesh.receiveShadow = true
    this.bodyMesh.userData.isBody = true

    // ── Arched roof ───────────────────────────────────────────────────────────
    const roofMesh = this._buildArch()
    roofMesh.position.y = BODY_H * 0.5
    roofMesh.castShadow = true

    // ── Windows (2 per side) ──────────────────────────────────────────────────
    const winGeo = new THREE.BoxGeometry(WIN_W, WIN_H, WIN_D)
    const winMatBase = new THREE.MeshStandardMaterial({ color: WIN_COLOR_DAY, emissive: 0 })
    for (const xOff of [-0.30, 0.30]) {
      for (const side of [-1, 1]) {
        const wm  = new THREE.Mesh(winGeo, winMatBase.clone())
        wm.position.set(xOff, 0.06, side * (BODY_W * 0.5 + WIN_D * 0.5 + 0.001))
        this.windowMeshes.push(wm)
        this.bodyMesh.add(wm)
      }
    }

    // ── Corner posts (rounded vertical strips) ────────────────────────────────
    const postGeo = new THREE.CylinderGeometry(0.032, 0.032, BODY_H, 8)
    const postMat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 })
    for (const xs of [-1, 1]) {
      for (const zs of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, postMat)
        post.position.set(xs * (BODY_L * 0.5 - 0.022), 0, zs * (BODY_W * 0.5 - 0.022))
        this.bodyMesh.add(post)
      }
    }

    // ── Bottom sill ───────────────────────────────────────────────────────────
    const sillGeo = new THREE.BoxGeometry(BODY_L + 0.02, 0.04, BODY_W + 0.02)
    const sill    = new THREE.Mesh(sillGeo, new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 }))
    sill.position.y = -(BODY_H * 0.5) + 0.02
    this.bodyMesh.add(sill)

    // ── End buffers (×2) ──────────────────────────────────────────────────────
    for (const xSide of [-1, 1]) {
      // Buffer beam (full-width bar at each end)
      const beamGeo  = new THREE.BoxGeometry(0.04, BUF_H, BODY_W * 0.80)
      const beamMesh = new THREE.Mesh(beamGeo, bufMat)
      beamMesh.position.set(xSide * (BODY_L * 0.5 + 0.02), -(BODY_H * 0.5) + BUF_H * 0.5 + 0.04, 0)
      this.bodyMesh.add(beamMesh)

      // Two buffer heads
      for (const zOff of [-0.14, 0.14]) {
        const headGeo  = new THREE.CylinderGeometry(0.048, 0.048, BUF_D, 10)
        const headMesh = new THREE.Mesh(headGeo, bufMat)
        headMesh.rotation.z = Math.PI / 2
        headMesh.position.set(xSide * (BODY_L * 0.5 + 0.04 + BUF_D * 0.5), -(BODY_H * 0.5) + BUF_H * 0.5 + 0.04, zOff)
        this.bodyMesh.add(headMesh)
      }
    }

    // ── Side grab handles ─────────────────────────────────────────────────────
    const handleGeo = new THREE.TorusGeometry(0.055, 0.010, 6, 8, Math.PI)
    for (const side of [-1, 1]) {
      const handle = new THREE.Mesh(handleGeo, handleMat)
      handle.rotation.x  = side * Math.PI * 0.5
      handle.position.set(0, BODY_H * 0.5 - 0.08, side * (BODY_W * 0.5 + 0.025))
      this.bodyMesh.add(handle)
    }

    this.inner.add(this.bodyMesh)
    this.inner.add(roofMesh)

    // ── Bogies (×2: front and rear) ───────────────────────────────────────────
    for (const xOff of [-BOGIE_OFFSET, BOGIE_OFFSET]) {
      const { bogieGroup, spinGroups } = this._buildBogie()
      bogieGroup.position.set(xOff, -(BODY_H * 0.5) + BOGIE_WHEEL_R - 0.02, 0)
      this.inner.add(bogieGroup)
      this.bogieGroups.push(bogieGroup)
      this.spinGroups.push(...spinGroups)
    }

    // Inner pre-rotation: +X local aligns with track tangent
    this.inner.rotation.y = Math.PI / 2
  }

  // ── Arched roof ────────────────────────────────────────────────────────────

  private _buildArch(): THREE.Mesh {
    const shape = new THREE.Shape()

    // Build a curved arc cross-section (segment of a cylinder)
    const pts: [number, number][] = []
    for (let i = 0; i <= ROOF_SEG; i++) {
      const a = -ROOF_HALF_ANG + (2 * ROOF_HALF_ANG * i / ROOF_SEG)
      pts.push([ROOF_R * Math.sin(a), ROOF_R * Math.cos(a)])
    }

    // Offset so the arc bottom sits at y=0
    const arcBottomY = ROOF_R * Math.cos(ROOF_HALF_ANG)
    const offsetY    = -arcBottomY

    shape.moveTo(pts[0][0], pts[0][1] + offsetY)
    for (let i = 1; i <= ROOF_SEG; i++) {
      shape.lineTo(pts[i][0], pts[i][1] + offsetY)
    }
    // Close: go down to flat base line
    shape.lineTo(pts[ROOF_SEG][0], 0)
    shape.lineTo(pts[0][0], 0)

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth:         BODY_L + 0.02,
      bevelEnabled:  true,
      bevelThickness: 0.012,
      bevelSize:      0.010,
      bevelSegments:  2,
    })
    // ExtrudeGeometry goes along Z; rotate so it goes along X (wagon length)
    const mesh = new THREE.Mesh(geo, roofMat)
    mesh.rotation.y = Math.PI / 2
    mesh.position.set(0, 0, -(BODY_L + 0.02) * 0.5)
    // After rotation.y = π/2: local Z → world X, local X → world -Z
    // Correct with a wrapper group
    const wrapper = new THREE.Group()
    wrapper.add(mesh)
    // Rotate the whole extrusion so the length axis aligns with body X
    const result = new THREE.Mesh(new THREE.BoxGeometry(0, 0, 0), roofMat) // dummy placeholder
    result.visible = false

    // Build directly as a group — return a real mesh using TubeGeometry approach instead
    return this._buildArchMesh()
  }

  private _buildArchMesh(): THREE.Mesh {
    // Build roof arch using custom BufferGeometry:
    // Sweep a 2-D arc profile along the wagon's X axis (BODY_L + overlap)
    const N_LEN  = 12   // along wagon length

    const arcPts: [number, number][] = []
    for (let i = 0; i <= ROOF_SEG; i++) {
      const a = -ROOF_HALF_ANG + (2 * ROOF_HALF_ANG * i / ROOF_SEG)
      arcPts.push([ROOF_R * Math.sin(a), ROOF_R * Math.cos(a)])
    }
    const arcBottom = ROOF_R * Math.cos(ROOF_HALF_ANG)

    const roofLen    = BODY_L + 0.02
    const ringCount  = N_LEN + 1
    const M          = ROOF_SEG + 3   // arc points + 2 bottom corners for a closed shape
    const positions  = new Float32Array(ringCount * M * 3)
    const uvData     = new Float32Array(ringCount * M * 2)

    // Cross-section profile (in local Z-Y plane, where Z is across wagon, Y is up)
    // Arc points + two closing base points
    const profile: [number, number][] = [
      ...arcPts.map(([z, y]) => [z, y - arcBottom] as [number, number]),
      [ arcPts[ROOF_SEG][0],  0 ],  // bottom-right
      [ arcPts[0][0],         0 ],  // bottom-left
    ]

    for (let i = 0; i < ringCount; i++) {
      const xWorld = -roofLen * 0.5 + (roofLen * i / N_LEN)
      const uvv    = i / N_LEN
      for (let j = 0; j < M; j++) {
        const [pz, py] = profile[j]
        const b = (i * M + j) * 3
        positions[b]     = xWorld
        positions[b + 1] = py
        positions[b + 2] = pz
        const u = (i * M + j) * 2
        uvData[u]     = j / M
        uvData[u + 1] = uvv
      }
    }

    const idx: number[] = []
    for (let i = 0; i < N_LEN; i++) {
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

    const mesh = new THREE.Mesh(geo, roofMat)
    mesh.castShadow    = true
    mesh.receiveShadow = true
    return mesh
  }

  // ── Bogie truck ────────────────────────────────────────────────────────────

  private _buildBogie(): { bogieGroup: THREE.Group; spinGroups: THREE.Group[] } {
    const bogieGroup = new THREE.Group()
    const spinGroups: THREE.Group[] = []

    // Frame (flat H-shaped plate)
    const frameGeo = new THREE.BoxGeometry(BOGIE_FRAME_L, BOGIE_FRAME_H, BOGIE_FRAME_W)
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7, metalness: 0.4 })
    const frame    = new THREE.Mesh(frameGeo, frameMat)
    frame.receiveShadow = true
    bogieGroup.add(frame)

    // Side-frames (two longitudinal bars)
    const sfGeo = new THREE.BoxGeometry(BOGIE_FRAME_L - 0.04, 0.08, 0.04)
    for (const zs of [-1, 1]) {
      const sf = new THREE.Mesh(sfGeo, frameMat)
      sf.position.set(0, -BOGIE_FRAME_H * 0.5 - 0.02, zs * (BOGIE_Z_HALF - 0.01))
      bogieGroup.add(sf)
    }

    // Wheels (2 axles × 2 wheels = 4 wheels per bogie)
    const wheelGeo = new THREE.CylinderGeometry(BOGIE_WHEEL_R, BOGIE_WHEEL_R, BOGIE_WHEEL_T, 18)
    const axleGeo  = new THREE.CylinderGeometry(0.022, 0.022, BOGIE_Z_HALF * 2 + BOGIE_WHEEL_T + 0.04, 8)

    for (const xOff of [-BOGIE_FRAME_L * 0.36, BOGIE_FRAME_L * 0.36]) {
      // Axle rod
      const axle = new THREE.Mesh(axleGeo, axleMat)
      axle.rotation.x = Math.PI / 2
      axle.position.set(xOff, -BOGIE_FRAME_H * 0.5 - 0.03, 0)
      bogieGroup.add(axle)

      // Two wheels (left and right)
      for (const zs of [-1, 1]) {
        const spinGrp = new THREE.Group()
        const wheel   = new THREE.Mesh(wheelGeo, wheelMat)
        wheel.rotation.x = Math.PI / 2   // disk faces Z
        spinGrp.add(wheel)
        spinGrp.position.set(xOff, -BOGIE_FRAME_H * 0.5 - 0.03, zs * BOGIE_Z_HALF)
        bogieGroup.add(spinGrp)
        spinGroups.push(spinGrp)
      }
    }

    return { bogieGroup, spinGroups }
  }

  // ── Per-frame update ───────────────────────────────────────────────────────

  update(fn: CurveFn, t: number, wheelRot: number) {
    const DT    = 0.004
    const tangA = curveTangent(fn, t)
    const dTang = curveTangent(fn, t + DT).sub(tangA.clone())
    const dLen  = dTang.length()
    const inLoop = dLen > 0.04 && (
      Math.abs(dTang.y) / dLen > 0.5 ||
      Math.abs(tangA.y) > 0.45
    )
    const upDir = inLoop ? dTang.normalize() : new THREE.Vector3(0, 1, 0)

    const pos   = curvePoint(fn, t, 0).addScaledVector(upDir, WAGON_Y)
    const ahead = curvePoint(fn, t + 0.001, 0).addScaledVector(upDir, WAGON_Y)

    this.group.position.copy(pos)
    this.group.up.copy(upDir)
    this.group.lookAt(ahead)

    for (const sg of this.spinGroups) {
      sg.rotation.z = -wheelRot
    }
  }

  // ── Colour / night mode ────────────────────────────────────────────────────

  setColor(hex: number) {
    ;(this.bodyMesh.material as THREE.MeshStandardMaterial).color.setHex(hex)
  }

  getColor(): number {
    return (this.bodyMesh.material as THREE.MeshStandardMaterial).color.getHex()
  }

  setNightMode(night: boolean) {
    for (const w of this.windowMeshes) {
      const mat = w.material as THREE.MeshStandardMaterial
      if (night) {
        mat.emissive.setHex(WIN_COLOR_NIGHT)
        mat.emissiveIntensity = 0.9
      } else {
        mat.emissive.setHex(0)
        mat.emissiveIntensity = 0
      }
    }
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.group)
    this.inner.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose()
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose())
        else obj.material.dispose()
      }
    })
  }
}
