import * as THREE from 'three'

export type WeatherType = 'clear' | 'rain' | 'storm'

const RAIN_COUNT = 1800
const AREA_R     = 38
const DROP_SPAN  = 26
const DROP_LEN   = 0.30

export class WeatherManager {
  private scene:      THREE.Scene
  private _type:      WeatherType = 'clear'
  private _night      = false
  private _fallSpeed  = 22
  private _opacity    = 0.5

  setFallSpeed(v: number) { this._fallSpeed = v }
  setOpacity(v: number) {
    this._opacity = v
    ;(this._rain.material as THREE.MeshBasicMaterial).opacity = v
  }

  private _rain:    THREE.InstancedMesh
  private _dropX:   Float32Array
  private _dropZ:   Float32Array
  private _dropY:   Float32Array

  // Lightning
  private _flash:       THREE.PointLight
  private _flashTimer   = 999
  private _flashDur     = 0
  private _flashPeak    = 0
  private _nextFlash    = 4.0

  private _dummy = new THREE.Object3D()

  constructor(scene: THREE.Scene) {
    this.scene = scene

    const geo = new THREE.BoxGeometry(0.022, DROP_LEN, 0.022)
    const mat = new THREE.MeshBasicMaterial({
      color: 0xb0cce0, transparent: true, opacity: 0.5, depthWrite: false,
    })
    this._rain = new THREE.InstancedMesh(geo, mat, RAIN_COUNT)
    this._rain.visible = false
    this._rain.frustumCulled = false
    scene.add(this._rain)

    this._dropX = new Float32Array(RAIN_COUNT)
    this._dropZ = new Float32Array(RAIN_COUNT)
    this._dropY = new Float32Array(RAIN_COUNT)
    for (let i = 0; i < RAIN_COUNT; i++) {
      const ang = Math.random() * Math.PI * 2
      const r   = Math.sqrt(Math.random()) * AREA_R
      this._dropX[i] = Math.cos(ang) * r
      this._dropZ[i] = Math.sin(ang) * r
      this._dropY[i] = Math.random() * DROP_SPAN
    }

    this._flash = new THREE.PointLight(0xaaddff, 0, 300)
    this._flash.position.set(0, 35, 0)
    scene.add(this._flash)
  }

  setWeather(type: WeatherType) {
    this._type = type
    this._rain.visible = type !== 'clear'
    if (type === 'clear') this._flash.intensity = 0
  }

  update(dt: number) {
    if (this._type === 'clear') return

    for (let i = 0; i < RAIN_COUNT; i++) {
      this._dropY[i] -= this._fallSpeed * dt
      if (this._dropY[i] < -DROP_LEN) this._dropY[i] += DROP_SPAN
    }

    const d = this._dummy
    d.rotation.set(0, 0, 0)
    d.scale.set(1, 1, 1)
    for (let i = 0; i < RAIN_COUNT; i++) {
      d.position.set(this._dropX[i], this._dropY[i], this._dropZ[i])
      d.updateMatrix()
      this._rain.setMatrixAt(i, d.matrix)
    }
    this._rain.instanceMatrix.needsUpdate = true

    // Lightning (storm only)
    if (this._type === 'storm') {
      this._nextFlash -= dt
      if (this._nextFlash <= 0) {
        this._flashPeak  = 20 + Math.random() * 15
        this._flashDur   = 0.05 + Math.random() * 0.08
        this._flashTimer = 0
        this._nextFlash  = 2 + Math.random() * 7
        this._flash.intensity = this._flashPeak
      }
      if (this._flashTimer < this._flashDur) {
        this._flashTimer += dt
        const t = this._flashTimer / this._flashDur
        this._flash.intensity = this._flashPeak * (1 - t * t)
      } else {
        this._flash.intensity = 0
      }
    }
  }

  setNightMode(night: boolean) {
    this._night = night
    ;(this._rain.material as THREE.MeshBasicMaterial).opacity = night ? 0.32 : 0.5
  }

  dispose() {
    this.scene.remove(this._rain)
    this._rain.geometry.dispose()
    ;(this._rain.material as THREE.Material).dispose()
    this.scene.remove(this._flash)
  }
}
