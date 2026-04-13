import * as THREE from 'three'

export class DayNight {
  private scene: THREE.Scene
  private moon: THREE.DirectionalLight
  private stars: THREE.Points | null = null
  private moonMesh: THREE.Mesh | null = null

  isNight = false

  constructor(scene: THREE.Scene) {
    this.scene   = scene

    // Lune
    this.moon = new THREE.DirectionalLight(0x8899bb, 0)
    this.moon.position.set(-10, 20, -5)
    this.scene.add(this.moon)

    this._buildStars()
    this._buildMoonMesh()
  }

  toggle() {
    this.isNight = !this.isNight
    this._apply()
    return this.isNight
  }

  private _apply() {
    const n = this.isNight
    this.moon.intensity = n ? 0.6 : 0
    if (this.stars)    this.stars.visible    = n
    if (this.moonMesh) this.moonMesh.visible = n
  }

  private _buildStars() {
    const count = 500
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi   = Math.random() * Math.PI
      const r     = 80
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.abs(Math.cos(phi)) + 10
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.25, sizeAttenuation: true })
    this.stars = new THREE.Points(geo, mat)
    this.stars.visible = false
    this.scene.add(this.stars)
  }

  private _buildMoonMesh() {
    const geo = new THREE.SphereGeometry(1.2, 16, 16)
    const mat = new THREE.MeshStandardMaterial({
      color: 0xddddaa,
      emissive: 0xddddaa,
      emissiveIntensity: 0.6,
      roughness: 1,
    })
    this.moonMesh = new THREE.Mesh(geo, mat)
    this.moonMesh.position.set(-18, 28, -20)
    this.moonMesh.visible = false
    this.scene.add(this.moonMesh)
  }

  dispose() {
    this.stars?.geometry.dispose()
    ;(this.stars?.material as THREE.Material)?.dispose()
    this.moonMesh?.geometry.dispose()
    ;(this.moonMesh?.material as THREE.Material)?.dispose()
    this.scene.remove(this.moon)
    if (this.stars)    this.scene.remove(this.stars)
    if (this.moonMesh) this.scene.remove(this.moonMesh)
  }
}
