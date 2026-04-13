import * as THREE from 'three'
import { CurveFn, curvePoint, curveTangent } from '../track/curves.js'

const LIGHT_INT   = 0.9
const LIGHT_DIST  = 5.5

export class TunnelManager {
  private scene:   THREE.Scene
  private _objs:   THREE.Object3D[] = []
  private _lights: THREE.PointLight[] = []
  private _active  = false

  constructor(scene: THREE.Scene) { this.scene = scene }

  build(fn: CurveFn, tCenter: number, halfSpan = 0.09) {
    this._clear()
    this._active = true

    const tIn  = ((tCenter - halfSpan) + 1) % 1
    const tOut = ((tCenter + halfSpan) + 1) % 1

    const posIn  = curvePoint(fn, tIn,  0)
    const posOut = curvePoint(fn, tOut, 0)
    const posC   = curvePoint(fn, tCenter, 0)
    const tangIn  = curveTangent(fn, tIn)
    const tangOut = curveTangent(fn, tOut)

    // ── Mountain mound ────────────────────────────────────────────────────────
    const mtnGeo = new THREE.SphereGeometry(1, 16, 10)
    const mtnMat = new THREE.MeshStandardMaterial({ color: 0x6a7a55, roughness: 1.0 })
    const mtn    = new THREE.Mesh(mtnGeo, mtnMat)
    mtn.position.copy(posC)
    mtn.scale.set(5.5, 3.8, 5.0)
    mtn.castShadow    = true
    mtn.receiveShadow = true
    this.scene.add(mtn)
    this._objs.push(mtn)

    // ── Arch portals ─────────────────────────────────────────────────────────
    for (const { pos, tang } of [
      { pos: posIn,  tang: tangIn  },
      { pos: posOut, tang: tangOut },
    ]) {
      const arch = this._makeArch()
      arch.position.copy(pos)
      arch.rotation.y = Math.atan2(tang.x, tang.z)
      this.scene.add(arch)
      this._objs.push(arch)
    }

    // ── Interior lights ───────────────────────────────────────────────────────
    for (let step = -1; step <= 1; step++) {
      const t  = ((tCenter + step * halfSpan * 0.55) + 1) % 1
      const lp = curvePoint(fn, t, 1.1)
      const lt = new THREE.PointLight(0xffeecc, LIGHT_INT, LIGHT_DIST)
      lt.position.copy(lp)
      this.scene.add(lt)
      this._lights.push(lt)
    }
  }

  setNightMode(night: boolean) {
    for (const lt of this._lights) lt.intensity = night ? 2.0 : LIGHT_INT
  }

  clear() { this._clear() }
  dispose() { this._clear() }

  // ── Private ────────────────────────────────────────────────────────────────

  private _makeArch(): THREE.Group {
    const group    = new THREE.Group()
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7a6a58, roughness: 0.9, metalness: 0.08 })

    const W = 2.0, H = 1.9, D = 0.5, PW = 0.36

    // Left pillar
    const lp = new THREE.Mesh(new THREE.BoxGeometry(PW, H, D), stoneMat)
    lp.position.set(-W / 2, H / 2, 0)
    group.add(lp)

    // Right pillar
    const rp = new THREE.Mesh(new THREE.BoxGeometry(PW, H, D), stoneMat.clone())
    rp.position.set( W / 2, H / 2, 0)
    group.add(rp)

    // Lintel
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(W + PW, 0.38, D), stoneMat.clone())
    lintel.position.set(0, H + 0.19, 0)
    group.add(lintel)

    // Arch (half torus)
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(W / 2, 0.18, 6, 12, Math.PI),
      stoneMat.clone(),
    )
    arc.position.set(0, H, 0)
    arc.rotation.z = Math.PI
    group.add(arc)

    group.traverse(o => {
      if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true }
    })
    return group
  }

  private _clear() {
    for (const obj of this._objs) {
      this.scene.remove(obj)
      obj.traverse(o => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose()
          ;(o.material as THREE.Material).dispose()
        }
      })
    }
    for (const lt of this._lights) this.scene.remove(lt)
    this._objs   = []
    this._lights = []
    this._active = false
  }
}
