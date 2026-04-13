import * as THREE from 'three'
import { Sky } from 'three/examples/jsm/objects/Sky.js'

// ── Per-biome sky parameters ──────────────────────────────────────────────────
const BIOME_SKY: Record<string, { turbidity: number; rayleigh: number; mie: number }> = {
  prairie: { turbidity: 2.5, rayleigh: 3.0, mie: 0.003 },
  desert:  { turbidity: 10,  rayleigh: 1.2, mie: 0.018 },
  foret:   { turbidity: 2.0, rayleigh: 3.5, mie: 0.003 },
  toundra: { turbidity: 1.5, rayleigh: 2.0, mie: 0.002 },
  volcan:  { turbidity: 16,  rayleigh: 0.5, mie: 0.05  },
}

export class SkyManager {
  private scene: THREE.Scene
  private _sky:  Sky
  private _night = false

  constructor(scene: THREE.Scene) {
    this.scene = scene

    this._sky = new Sky()
    this._sky.scale.setScalar(450)
    scene.add(this._sky)

    const u = this._sky.material.uniforms
    u['turbidity'].value       = 2.5
    u['rayleigh'].value        = 3.0
    u['mieCoefficient'].value  = 0.003
    u['mieDirectionalG'].value = 0.86

    this._updateSun(0.55)  // soleil plus haut = ciel plus bleu, horizon moins blanc
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  setNight(night: boolean) {
    this._night = night
    this._sky.visible = !night
  }

  setBiome(id: string) {
    const p = BIOME_SKY[id] ?? BIOME_SKY['prairie']
    const u = this._sky.material.uniforms
    u['turbidity'].value       = p.turbidity
    u['rayleigh'].value        = p.rayleigh
    u['mieCoefficient'].value  = p.mie
  }

  setFullParams(turbidity: number, rayleigh: number, mie: number, mieG: number) {
    const u = this._sky.material.uniforms
    u['turbidity'].value       = turbidity
    u['rayleigh'].value        = rayleigh
    u['mieCoefficient'].value  = mie
    u['mieDirectionalG'].value = mieG
  }

  setSunElevation(elevation: number) {
    if (!this._night) this._updateSun(elevation)
  }

  dispose() {
    this.scene.remove(this._sky)
    this._sky.geometry.dispose()
    this._sky.material.dispose()
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _updateSun(elevation: number) {
    const phi   = THREE.MathUtils.degToRad(90 - elevation * 85)
    const theta = THREE.MathUtils.degToRad(185)
    const sunPos = new THREE.Vector3().setFromSphericalCoords(1, phi, theta)
    this._sky.material.uniforms['sunPosition'].value.copy(sunPos)
  }
}
