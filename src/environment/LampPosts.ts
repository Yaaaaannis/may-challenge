import * as THREE from 'three'
import { CurveFn, curvePoint, curveTangent } from '../track/curves.js'

const POST_COUNT = 8
const POST_H = 2.8
const ARM_L  = 0.7
const LAMP_R = 0.12

export class LampPosts {
  private scene: THREE.Scene
  private group = new THREE.Group()
  private lights: THREE.PointLight[] = []

  constructor(scene: THREE.Scene) {
    this.scene = scene
    scene.add(this.group)
  }

  /** Rebuild posts around a new circuit. */
  build(fn: CurveFn, count = POST_COUNT) {
    // Clear previous
    this.lights = []
    this.group.clear()

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.7 })
    const lampMat  = new THREE.MeshStandardMaterial({
      color: 0xff9933,
      emissive: 0xff6600,
      emissiveIntensity: 0,
    })

    for (let i = 0; i < count; i++) {
      const t    = i / count
      const base = curvePoint(fn, t, 0)
      const tang = curveTangent(fn, t)

      // Décaler latéralement vers l'extérieur du circuit
      const offset = 1.6
      base.x += tang.z * offset
      base.z -= tang.x * offset

      const post = new THREE.Group()
      post.position.copy(base)

      // Fût
      const trunkGeo = new THREE.CylinderGeometry(0.05, 0.07, POST_H, 8)
      const trunk    = new THREE.Mesh(trunkGeo, trunkMat)
      trunk.position.y = POST_H / 2
      trunk.castShadow = true
      post.add(trunk)

      // Bras (orienté vers la voie)
      const armGeo  = new THREE.CylinderGeometry(0.03, 0.03, ARM_L, 6)
      const arm     = new THREE.Mesh(armGeo, trunkMat)
      arm.rotation.z = Math.PI / 2
      arm.position.set(-ARM_L / 2 * Math.sign(tang.z + 0.0001), POST_H - 0.1, 0)
      post.add(arm)

      // Lampe
      const lampGeo  = new THREE.SphereGeometry(LAMP_R, 10, 10)
      const lampMesh = new THREE.Mesh(lampGeo, lampMat.clone())
      lampMesh.position.set(-ARM_L * Math.sign(tang.z + 0.0001), POST_H - 0.1, 0)
      post.add(lampMesh)

      // PointLight
      const light = new THREE.PointLight(0xff9944, 0, 6)
      light.position.copy(lampMesh.position)
      post.add(light)
      this.lights.push(light)

      this.group.add(post)
    }
  }

  setNightMode(night: boolean) {
    for (const l of this.lights) {
      l.intensity = night ? 1.5 : 0
    }
    // Allumer/éteindre l'émissive des lampes
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry instanceof THREE.SphereGeometry) {
        const mat = obj.material as THREE.MeshStandardMaterial
        if (mat.emissive) {
          mat.emissiveIntensity = night ? 1.2 : 0
        }
      }
    })
  }

  dispose() {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose()
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose())
        else obj.material.dispose()
      }
    })
    this.scene.remove(this.group)
  }
}
