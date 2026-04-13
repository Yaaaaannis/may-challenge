import * as THREE from 'three'
import { CurveFn, curvePoint } from '../track/curves.js'

const WAGON_Y = 0.32

// Geometry dims
const BODY_W = 1.30, BODY_H = 0.64, BODY_D = 0.62
const ROOF_W = 1.32, ROOF_H = 0.10, ROOF_D = 0.64
const WHEEL_R = 0.12, WHEEL_T = 0.06
const WIN_W = 0.22, WIN_H = 0.18, WIN_D = 0.01

const WHEEL_POSITIONS = [
  [-0.42,  0.36],  // [x, z] pairs (±Z sides handled in loop)
  [ 0.42,  0.36],
]

// Shared materials (never recolour these)
const roofMat  = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 })
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.5 })

// Reference body radius for wheel-roll calc
export const WAGON_BODY_REF_R = 4.5   // default circuit radius
export const WHEEL_RADIUS = WHEEL_R

const WINDOW_COLORS_DAY   = 0x88ccff
const WINDOW_COLORS_NIGHT = 0xffffaa

export class Wagon {
  readonly group = new THREE.Group()
  private inner = new THREE.Group()
  private bodyMesh!:  THREE.Mesh
  private spinGroups: THREE.Group[] = []
  private windowMeshes: THREE.Mesh[] = []

  /** Arc-length distance behind the locomotive in world units. */
  arcDist: number

  constructor(scene: THREE.Scene, color: number, arcDist: number) {
    this.arcDist = arcDist
    this._build(color)
    this.group.add(this.inner)
    scene.add(this.group)
  }

  private _build(color: number) {
    // Body
    const bodyGeo  = new THREE.BoxGeometry(BODY_W, BODY_H, BODY_D)
    const bodyMat  = new THREE.MeshStandardMaterial({ color, roughness: 0.8 })
    this.bodyMesh  = new THREE.Mesh(bodyGeo, bodyMat)
    this.bodyMesh.castShadow = true
    this.bodyMesh.userData.isBody  = true

    // Roof
    const roofGeo  = new THREE.BoxGeometry(ROOF_W, ROOF_H, ROOF_D)
    const roofMesh = new THREE.Mesh(roofGeo, roofMat)
    roofMesh.position.y = BODY_H / 2 + ROOF_H / 2

    // Windows (2 per side)
    const winGeo = new THREE.BoxGeometry(WIN_W, WIN_H, WIN_D)
    const winMat = new THREE.MeshStandardMaterial({ color: WINDOW_COLORS_DAY, emissive: 0x000000 })
    for (const xOff of [-0.30, 0.30]) {
      for (const side of [-1, 1]) {
        const w = new THREE.Mesh(winGeo, winMat.clone())
        w.position.set(xOff, 0.06, side * (BODY_D / 2 + WIN_D / 2 + 0.001))
        this.windowMeshes.push(w)
        this.bodyMesh.add(w)
      }
    }

    this.inner.add(this.bodyMesh)
    this.inner.add(roofMesh)

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, WHEEL_T, 16)
    for (const [wx, absZ] of WHEEL_POSITIONS) {
      for (const side of [-1, 1]) {
        const spinGroup = new THREE.Group()
        const wheelMesh = new THREE.Mesh(wheelGeo, wheelMat)
        wheelMesh.rotation.x = Math.PI / 2   // axe le long de Z (essieu latéral)
        spinGroup.add(wheelMesh)
        spinGroup.position.set(wx, -BODY_H / 2 + WHEEL_R, side * absZ)
        this.inner.add(spinGroup)
        this.spinGroups.push(spinGroup)
      }
    }

    // Inner pre-rotation so lookAt aligns with +X local
    this.inner.rotation.y = Math.PI / 2
  }

  /** Called each frame. t is already resolved to arc-length position by TrainController. */
  update(fn: CurveFn, t: number, wheelRot: number) {
    const pos = curvePoint(fn, t, WAGON_Y)
    const ahead = curvePoint(fn, t + 0.001, WAGON_Y)

    this.group.position.copy(pos)
    this.group.lookAt(ahead)

    for (const sg of this.spinGroups) {
      sg.rotation.z = -wheelRot
    }
  }

  setColor(hex: number) {
    const mat = (this.bodyMesh.material as THREE.MeshStandardMaterial)
    mat.color.setHex(hex)
  }

  getColor(): number {
    return (this.bodyMesh.material as THREE.MeshStandardMaterial).color.getHex()
  }

  setNightMode(night: boolean) {
    for (const w of this.windowMeshes) {
      const mat = w.material as THREE.MeshStandardMaterial
      if (night) {
        mat.emissive.setHex(WINDOW_COLORS_NIGHT)
        mat.emissiveIntensity = 0.9
      } else {
        mat.emissive.setHex(0x000000)
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
