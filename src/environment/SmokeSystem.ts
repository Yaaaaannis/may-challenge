import * as THREE from 'three'

const CAP       = 150
const CHIMNEY_Y = 0.85   // fallback offset si pas de cheminée trouvée

// ── Gradient map 3 niveaux pour rendu cartoon ─────────────────────────────────
function makeToonGradient(): THREE.DataTexture {
  const data = new Uint8Array([40, 160, 255])   // ombre / mi-teinte / lumière
  const tex  = new THREE.DataTexture(data, 3, 1, THREE.RedFormat)
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  tex.needsUpdate = true
  return tex
}

interface Puff {
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  age: number; maxAge: number
  s0: number   // taille de base
}

export class SmokeSystem {
  private scene:    THREE.Scene
  private _mesh:    THREE.InstancedMesh
  private _puffs:   Puff[]
  private _emit     = 0
  private _dummy    = new THREE.Object3D()

  // Multiplicateurs debug
  private _rateMult = 1.0
  private _riseMult = 1.0
  private _sizeMult = 1.0

  // Burst au démarrage / accélération
  private _prevSpeed    = 0
  private _burstEnergy  = 0   // 0..4 — décroît naturellement

  setEmissionRate(v: number) { this._rateMult = v }
  setRiseSpeed(v: number)    { this._riseMult = v }
  setPuffSize(v: number)     { this._sizeMult = v }

  /** Déclenche un burst de fumée (ex : sortie de looping). */
  triggerBurst(energy: number) {
    this._burstEnergy = Math.min(this._burstEnergy + energy, 6.0)
  }

  constructor(scene: THREE.Scene) {
    this.scene = scene

    // Sphère plus ronde et plus grande pour look cartoon
    const geo = new THREE.SphereGeometry(1, 8, 7)

    const mat = new THREE.MeshToonMaterial({
      color:       0xfafafa,
      gradientMap: makeToonGradient(),
      transparent: true,
      opacity:     0.88,
      depthWrite:  false,
      depthTest:   true,
    })

    this._mesh = new THREE.InstancedMesh(geo, mat, CAP)
    this._mesh.frustumCulled = false
    this._mesh.renderOrder   = 1
    scene.add(this._mesh)

    this._puffs = Array.from({ length: CAP }, () =>
      ({ x:0, y:0, z:0, vx:0, vy:0, vz:0, age:99, maxAge:1, s0:0.1 })
    )

    const d = this._dummy
    d.scale.set(0, 0, 0)
    d.updateMatrix()
    for (let i = 0; i < CAP; i++) this._mesh.setMatrixAt(i, d.matrix)
    this._mesh.instanceMatrix.needsUpdate = true
  }

  update(dt: number, locoPos: THREE.Vector3, speed: number, chimneyPositions?: THREE.Vector3[], repellers?: Array<{ pos: THREE.Vector3; radius: number }>) {
    // ── Burst : détecte démarrage et accélération ──────────────────────────────
    const dSpeed = speed - this._prevSpeed
    if (dSpeed > 0.001) {
      // Boost fort si on repart de l'arrêt
      const startupBoost = Math.max(0, 0.3 - this._prevSpeed) * 6.0
      // Boost proportionnel à l'accélération
      const accelBoost   = (dSpeed / Math.max(dt, 0.008)) * 0.04
      this._burstEnergy  = Math.min(this._burstEnergy + (startupBoost + accelBoost) * dt, 4.0)
    }
    this._burstEnergy *= Math.pow(0.18, dt)   // décroissance rapide (~1.7s pour vider)
    this._prevSpeed    = speed

    // ── Émission ──────────────────────────────────────────────────────────────
    const baseRate = 2.0 + Math.abs(speed) * 3.5 + this._burstEnergy * 5.0
    this._emit += baseRate * this._rateMult * dt

    const useChimneys = chimneyPositions && chimneyPositions.length > 0
    while (this._emit >= 1) {
      this._emit -= 1
      if (useChimneys) {
        const idx = Math.floor(Math.random() * chimneyPositions!.length)
        this._spawn(chimneyPositions![idx], true)
      } else {
        this._spawn(locoPos, false)
      }
    }

    // ── Animation des puffs ───────────────────────────────────────────────────
    const d = this._dummy
    for (let i = 0; i < CAP; i++) {
      const p = this._puffs[i]
      if (p.age >= p.maxAge) {
        d.scale.set(0, 0, 0)
        d.updateMatrix()
        this._mesh.setMatrixAt(i, d.matrix)
        continue
      }
      p.age += dt
      p.x   += p.vx * dt
      p.y   += p.vy * dt
      p.z   += p.vz * dt
      p.vy  *= 1 - dt * 0.25   // légère résistance à la montée

      // ── Répulseurs : chaque zone de collision repousse les puffs ─────────
      if (repellers) {
        for (const { pos: rep, radius: R } of repellers) {
          const dx = p.x - rep.x
          const dy = p.y - rep.y
          const dz = p.z - rep.z
          const d2 = dx * dx + dy * dy + dz * dz
          if (d2 < R * R && d2 > 0.0001) {
            const d     = Math.sqrt(d2)
            const force = ((R - d) / R) * 6.0 * dt
            p.vx += (dx / d) * force
            p.vy += (dy / d) * force
            p.vz += (dz / d) * force
          }
        }
      }

      const t = p.age / p.maxAge   // 0 → 1

      // Cartoon : pop rapide → plateau → disparition brutale
      let sc: number
      if (t < 0.18) {
        // Pop in
        sc = p.s0 * (t / 0.18)
      } else if (t < 0.72) {
        // Grossit légèrement
        sc = p.s0 * (1.0 + (t - 0.18) * 0.55)
      } else {
        // Disparition rapide
        sc = p.s0 * 1.30 * (1.0 - (t - 0.72) / 0.28)
      }

      d.position.set(p.x, p.y, p.z)
      d.scale.set(sc, sc, sc)
      d.updateMatrix()
      this._mesh.setMatrixAt(i, d.matrix)
    }
    this._mesh.instanceMatrix.needsUpdate = true
  }

  private _spawn(pos: THREE.Vector3, atExactPos: boolean) {
    const burstBonus = this._burstEnergy

    for (let i = 0; i < CAP; i++) {
      const p = this._puffs[i]
      if (p.age < p.maxAge) continue

      p.x = pos.x + (Math.random() - 0.5) * 0.10
      p.y = pos.y + (atExactPos ? 0.12 : CHIMNEY_Y)   // spawn au-dessus de l'ouverture
      p.z = pos.z + (Math.random() - 0.5) * 0.10

      // Légère dérive horizontale aléatoire pour cartoon
      p.vx = (Math.random() - 0.5) * 0.35
      p.vy = (0.55 + Math.random() * 0.7 + burstBonus * 0.15) * this._riseMult
      p.vz = (Math.random() - 0.5) * 0.35

      p.age    = 0
      p.maxAge = 1.4 + Math.random() * 1.0

      // Taille : plus grosse avec burst
      p.s0 = (0.07 + Math.random() * 0.04 + burstBonus * 0.025) * this._sizeMult
      return
    }
  }

  dispose() {
    this.scene.remove(this._mesh)
    this._mesh.geometry.dispose()
    ;(this._mesh.material as THREE.Material).dispose()
  }
}
