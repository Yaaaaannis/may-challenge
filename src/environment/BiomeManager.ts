import * as THREE from 'three'

// ── Seeded RNG ────────────────────────────────────────────────────────────────

class RNG {
  private s: number
  constructor(seed: number) { this.s = (seed ^ 0xdeadbeef) >>> 0 }
  next(): number {
    this.s = Math.imul(this.s ^ (this.s >>> 15), this.s | 1)
    this.s ^= this.s + Math.imul(this.s ^ (this.s >>> 7), this.s | 61)
    return ((this.s ^ (this.s >>> 14)) >>> 0) / 0xffffffff
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type BiomeId = 'prairie' | 'desert' | 'foret' | 'toundra' | 'volcan'

export interface BiomeDayNight {
  daySky: number;  dayFogNear: number; dayFogFar: number
  dayAmbientColor: number; dayAmbientInt: number
  daySunColor: number; daySunInt: number
  nightSky: number; nightFogNear: number; nightFogFar: number
  nightAmbientColor: number; nightAmbientInt: number
}

interface DecPart {
  geo:     THREE.BufferGeometry
  mat:     THREE.MeshStandardMaterial
  yOff:    number    // center y from ground at scale=1
  yScale?: number    // independent y squish (1 = same as xz)
}

interface DecGroup {
  parts:    DecPart[]
  count:    number
  seed:     number
  minR:     number
  maxR:     number
  scaleMin: number
  scaleMax: number
  tiltMax?: number
}

interface BiomeDef {
  id:          BiomeId
  name:        string
  icon:        string
  color:       number   // panel button accent color
  groundColor: number
  dn:          BiomeDayNight
  groups:      DecGroup[]
}

// ── Material helper ───────────────────────────────────────────────────────────

function m(
  color: number, rough = 0.9, metal = 0,
  emissive = 0, emInt = 0,
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })
  if (emissive) { mat.emissive.setHex(emissive); mat.emissiveIntensity = emInt }
  return mat
}

// ── Biome definitions ─────────────────────────────────────────────────────────

const BIOMES: BiomeDef[] = [

  // ── Prairie ─────────────────────────────────────────────────────────────────
  {
    id: 'prairie', name: 'Prairie', icon: '🌿', color: 0x4a9a30,
    groundColor: 0x7caa5c,
    dn: {
      daySky: 0x87ceeb, dayFogNear: 25, dayFogFar: 65,
      dayAmbientColor: 0xffffff, dayAmbientInt: 0.5,
      daySunColor: 0xffffff, daySunInt: 1.2,
      nightSky: 0x061122, nightFogNear: 10, nightFogFar: 40,
      nightAmbientColor: 0x334466, nightAmbientInt: 0.25,
    },
    groups: [
      {
        parts: [
          { geo: new THREE.CylinderGeometry(0.12, 0.20, 1, 6), mat: m(0x5c3d1e), yOff: 0.5 },
          { geo: new THREE.SphereGeometry(0.70, 8, 6),          mat: m(0x3a7a2a), yOff: 1.5 },
        ],
        count: 65, seed: 1001, minR: 10, maxR: 46, scaleMin: 0.8, scaleMax: 1.9, tiltMax: 0.08,
      },
      {
        parts: [
          { geo: new THREE.CylinderGeometry(0.08, 0.13, 1, 5), mat: m(0x4a2e10), yOff: 0.5 },
          { geo: new THREE.SphereGeometry(0.45, 7, 5),          mat: m(0x4a9a30), yOff: 1.2 },
        ],
        count: 45, seed: 1002, minR: 10, maxR: 46, scaleMin: 0.6, scaleMax: 1.5, tiltMax: 0.1,
      },
      {
        parts: [
          { geo: new THREE.SphereGeometry(0.38, 6, 4), mat: m(0x888888, 0.95), yOff: 0.12, yScale: 0.55 },
        ],
        count: 28, seed: 1003, minR: 8, maxR: 44, scaleMin: 0.5, scaleMax: 1.6,
      },
      // Yellow wildflowers
      {
        parts: [
          { geo: new THREE.CylinderGeometry(0.02, 0.02, 0.28, 4), mat: m(0x6a9a3a), yOff: 0.14 },
          { geo: new THREE.SphereGeometry(0.07, 5, 4),             mat: m(0xffcc00, 0.4, 0, 0xffaa00, 0.4), yOff: 0.36 },
        ],
        count: 110, seed: 1004, minR: 8, maxR: 44, scaleMin: 0.7, scaleMax: 1.6,
      },
      // Pink wildflowers
      {
        parts: [
          { geo: new THREE.CylinderGeometry(0.02, 0.02, 0.28, 4), mat: m(0x6a9a3a), yOff: 0.14 },
          { geo: new THREE.SphereGeometry(0.07, 5, 4),             mat: m(0xff6688, 0.4, 0, 0xff3366, 0.3), yOff: 0.36 },
        ],
        count: 80, seed: 1005, minR: 8, maxR: 44, scaleMin: 0.7, scaleMax: 1.5,
      },
    ],
  },

  // ── Désert ──────────────────────────────────────────────────────────────────
  {
    id: 'desert', name: 'Désert', icon: '🏜️', color: 0xd4a030,
    groundColor: 0xd4a56a,
    dn: {
      daySky: 0xf0c870, dayFogNear: 18, dayFogFar: 55,
      dayAmbientColor: 0xffd090, dayAmbientInt: 0.65,
      daySunColor: 0xfff0a0, daySunInt: 1.8,
      nightSky: 0x1a0d05, nightFogNear: 8, nightFogFar: 35,
      nightAmbientColor: 0x442211, nightAmbientInt: 0.2,
    },
    groups: [
      // Cactus (body + pre-rotated arms via geometry transforms)
      (() => {
        const bodyGeo = new THREE.CylinderGeometry(0.18, 0.22, 1.2, 7)
        const armRGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.5, 6)
        armRGeo.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2))
        armRGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(0.36, 0.55, 0))
        const armLGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.5, 6)
        armLGeo.applyMatrix4(new THREE.Matrix4().makeRotationZ(-Math.PI / 2))
        armLGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(-0.36, 0.4, 0))
        const armTopRGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.35, 6)
        armTopRGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(0.36, 0.88, 0))
        const armTopLGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.35, 6)
        armTopLGeo.applyMatrix4(new THREE.Matrix4().makeTranslation(-0.36, 0.73, 0))
        const cactusGreen = m(0x4a8a3a, 0.8)
        return {
          parts: [
            { geo: bodyGeo,    mat: cactusGreen, yOff: 0.6 },
            { geo: armRGeo,    mat: cactusGreen, yOff: 0.6 },
            { geo: armLGeo,    mat: cactusGreen, yOff: 0.6 },
            { geo: armTopRGeo, mat: cactusGreen, yOff: 0.6 },
            { geo: armTopLGeo, mat: cactusGreen, yOff: 0.6 },
          ],
          count: 42, seed: 2001, minR: 10, maxR: 44, scaleMin: 0.7, scaleMax: 1.9,
        }
      })(),
      {
        parts: [
          { geo: new THREE.SphereGeometry(0.55, 7, 5), mat: m(0xb89060, 0.95), yOff: 0.2, yScale: 0.6 },
        ],
        count: 55, seed: 2002, minR: 9, maxR: 46, scaleMin: 0.4, scaleMax: 2.2, tiltMax: 0.2,
      },
      {
        parts: [
          { geo: new THREE.SphereGeometry(0.22, 6, 4), mat: m(0xa07848, 0.95), yOff: 0.1, yScale: 0.65 },
        ],
        count: 90, seed: 2003, minR: 8, maxR: 46, scaleMin: 0.4, scaleMax: 1.6,
      },
      // Sand dunes
      {
        parts: [
          { geo: new THREE.SphereGeometry(2.8, 9, 5), mat: m(0xc8955a, 0.98), yOff: -1.4, yScale: 0.32 },
        ],
        count: 14, seed: 2004, minR: 13, maxR: 44, scaleMin: 0.6, scaleMax: 1.6,
      },
    ],
  },

  // ── Forêt ────────────────────────────────────────────────────────────────────
  {
    id: 'foret', name: 'Forêt', icon: '🌲', color: 0x1a5a20,
    groundColor: 0x2d5a2d,
    dn: {
      daySky: 0x7a9a7a, dayFogNear: 12, dayFogFar: 38,
      dayAmbientColor: 0x88aa88, dayAmbientInt: 0.4,
      daySunColor: 0xccffcc, daySunInt: 0.8,
      nightSky: 0x040d04, nightFogNear: 6, nightFogFar: 24,
      nightAmbientColor: 0x0e2210, nightAmbientInt: 0.2,
    },
    groups: [
      // Multi-layered pine trees
      {
        parts: [
          { geo: new THREE.CylinderGeometry(0.10, 0.16, 1, 6),  mat: m(0x3a2008, 0.95), yOff: 0.5 },
          { geo: new THREE.ConeGeometry(0.85, 2.2, 7),           mat: m(0x1a5a20, 0.85), yOff: 2.1 },
          { geo: new THREE.ConeGeometry(0.60, 1.6, 7),           mat: m(0x246a2a, 0.85), yOff: 3.1 },
          { geo: new THREE.ConeGeometry(0.38, 1.1, 7),           mat: m(0x2e7a35, 0.85), yOff: 3.9 },
        ],
        count: 110, seed: 3001, minR: 9, maxR: 46, scaleMin: 0.7, scaleMax: 2.1, tiltMax: 0.06,
      },
      // Mushrooms
      {
        parts: [
          { geo: new THREE.CylinderGeometry(0.05, 0.07, 0.25, 6), mat: m(0xf0e8d8, 0.7), yOff: 0.12 },
          { geo: new THREE.SphereGeometry(0.22, 8, 5),             mat: m(0xcc3311, 0.6), yOff: 0.36, yScale: 0.65 },
        ],
        count: 65, seed: 3002, minR: 8, maxR: 44, scaleMin: 0.5, scaleMax: 2.0,
      },
      // Tree stumps
      {
        parts: [
          { geo: new THREE.CylinderGeometry(0.26, 0.33, 0.4, 7), mat: m(0x5c3d1e, 0.95), yOff: 0.2 },
        ],
        count: 24, seed: 3003, minR: 9, maxR: 42, scaleMin: 0.6, scaleMax: 1.5,
      },
      // Bushes
      {
        parts: [
          { geo: new THREE.SphereGeometry(0.48, 7, 5), mat: m(0x1a6a18, 0.9), yOff: 0.26, yScale: 0.7 },
        ],
        count: 55, seed: 3004, minR: 8, maxR: 44, scaleMin: 0.5, scaleMax: 1.7,
      },
      // Mossy rocks
      {
        parts: [
          { geo: new THREE.SphereGeometry(0.4, 6, 4),  mat: m(0x4a6a2a, 0.95), yOff: 0.14, yScale: 0.6 },
        ],
        count: 32, seed: 3005, minR: 9, maxR: 44, scaleMin: 0.5, scaleMax: 2.2, tiltMax: 0.25,
      },
    ],
  },

  // ── Toundra ──────────────────────────────────────────────────────────────────
  {
    id: 'toundra', name: 'Toundra', icon: '❄️', color: 0x66bbdd,
    groundColor: 0xddeef5,
    dn: {
      daySky: 0xbce8fa, dayFogNear: 18, dayFogFar: 58,
      dayAmbientColor: 0xbbd8ee, dayAmbientInt: 0.55,
      daySunColor: 0xeef6ff, daySunInt: 0.9,
      nightSky: 0x060d14, nightFogNear: 8, nightFogFar: 38,
      nightAmbientColor: 0x1a2a3a, nightAmbientInt: 0.35,
    },
    groups: [
      // Snow pines: dark trunk + green cone + snowy overlay cones
      {
        parts: [
          { geo: new THREE.CylinderGeometry(0.09, 0.15, 1, 6),  mat: m(0x2a1a0a, 0.95), yOff: 0.5 },
          { geo: new THREE.ConeGeometry(0.70, 1.9, 7),           mat: m(0x2a5a2a, 0.85), yOff: 1.95 },
          { geo: new THREE.ConeGeometry(0.73, 0.75, 7),          mat: m(0xe8f5ff, 0.45, 0, 0xffffff, 0.15), yOff: 1.85 },
          { geo: new THREE.ConeGeometry(0.47, 1.3, 7),           mat: m(0x2a5a2a, 0.85), yOff: 2.95 },
          { geo: new THREE.ConeGeometry(0.50, 0.55, 7),          mat: m(0xe8f5ff, 0.45, 0, 0xffffff, 0.15), yOff: 2.88 },
        ],
        count: 85, seed: 4001, minR: 9, maxR: 46, scaleMin: 0.6, scaleMax: 1.9, tiltMax: 0.06,
      },
      // Snowmen (3 spheres)
      {
        parts: [
          { geo: new THREE.SphereGeometry(0.35, 8, 6), mat: m(0xf5f5f8, 0.25), yOff: 0.35 },
          { geo: new THREE.SphereGeometry(0.25, 8, 6), mat: m(0xf0f2f8, 0.25), yOff: 0.93 },
          { geo: new THREE.SphereGeometry(0.16, 8, 6), mat: m(0xeeeff8, 0.25), yOff: 1.30 },
          // Carrot nose: small orange cone
          { geo: (() => { const g = new THREE.ConeGeometry(0.04, 0.14, 5); g.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI/2)); g.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 1.30, 0.20)); return g })(), mat: m(0xff8800), yOff: 0 },
        ],
        count: 14, seed: 4002, minR: 9, maxR: 40, scaleMin: 0.8, scaleMax: 1.4,
      },
      // Ice shards
      {
        parts: [
          { geo: new THREE.ConeGeometry(0.06, 0.65, 5), mat: m(0xa8d8f0, 0.15, 0.6, 0x88ccff, 0.35), yOff: 0.32 },
        ],
        count: 85, seed: 4003, minR: 8, maxR: 44, scaleMin: 0.5, scaleMax: 2.6, tiltMax: 0.45,
      },
      // Snow mounds
      {
        parts: [
          { geo: new THREE.SphereGeometry(0.45, 6, 4), mat: m(0xe8f2f8, 0.35), yOff: 0.12, yScale: 0.52 },
        ],
        count: 55, seed: 4004, minR: 8, maxR: 44, scaleMin: 0.5, scaleMax: 2.0,
      },
    ],
  },

  // ── Volcan ───────────────────────────────────────────────────────────────────
  {
    id: 'volcan', name: 'Volcan', icon: '🌋', color: 0xdd4400,
    groundColor: 0x1a0808,
    dn: {
      daySky: 0x2a1008, dayFogNear: 10, dayFogFar: 32,
      dayAmbientColor: 0xff6030, dayAmbientInt: 0.35,
      daySunColor: 0xff8844, daySunInt: 0.5,
      nightSky: 0x0a0200, nightFogNear: 6, nightFogFar: 22,
      nightAmbientColor: 0x440a00, nightAmbientInt: 0.3,
    },
    groups: [
      // Volcanic basalt columns
      {
        parts: [
          { geo: new THREE.CylinderGeometry(0.20, 0.32, 1, 5), mat: m(0x130c06, 0.95), yOff: 0.5 },
        ],
        count: 55, seed: 5001, minR: 9, maxR: 45, scaleMin: 0.5, scaleMax: 3.8, tiltMax: 0.14,
      },
      // Glowing lava rocks (icosahedron = jagged)
      {
        parts: [
          { geo: new THREE.IcosahedronGeometry(0.5, 0), mat: m(0x180a04, 0.85, 0.3, 0xff4400, 0.35), yOff: 0.26, yScale: 0.7 },
        ],
        count: 75, seed: 5002, minR: 8, maxR: 46, scaleMin: 0.3, scaleMax: 2.2, tiltMax: 0.55,
      },
      // Obsidian spikes
      {
        parts: [
          { geo: new THREE.ConeGeometry(0.12, 0.95, 4), mat: m(0x040405, 0.05, 0.9), yOff: 0.47 },
        ],
        count: 65, seed: 5003, minR: 9, maxR: 44, scaleMin: 0.4, scaleMax: 2.2, tiltMax: 0.28,
      },
      // Lava pools (flat glowing disks)
      {
        parts: [
          { geo: new THREE.CylinderGeometry(1.3, 1.3, 0.07, 10), mat: m(0xff4400, 0.25, 0, 0xff7700, 1.1), yOff: 0.035 },
        ],
        count: 18, seed: 5004, minR: 11, maxR: 44, scaleMin: 0.5, scaleMax: 1.9,
      },
      // Embers (many tiny glowing spheres)
      {
        parts: [
          { geo: new THREE.SphereGeometry(0.055, 4, 3), mat: m(0xff6600, 0.2, 0, 0xff4400, 1.6), yOff: 0.055 },
        ],
        count: 220, seed: 5005, minR: 8, maxR: 46, scaleMin: 0.5, scaleMax: 2.8,
      },
    ],
  },
]

// ── BiomeManager ──────────────────────────────────────────────────────────────

export class BiomeManager {
  private scene:     THREE.Scene
  private groundMat: THREE.MeshStandardMaterial
  private ambient:   THREE.AmbientLight
  private sun:       THREE.DirectionalLight

  private _current: BiomeDef = BIOMES[0]
  private _night              = false
  private _meshes: THREE.InstancedMesh[] = []
  private _dummy  = new THREE.Object3D()

  constructor(
    scene:     THREE.Scene,
    groundMat: THREE.MeshStandardMaterial,
    ambient:   THREE.AmbientLight,
    sun:       THREE.DirectionalLight,
  ) {
    this.scene     = scene
    this.groundMat = groundMat
    this.ambient   = ambient
    this.sun       = sun
  }

  get biomes()    { return BIOMES }
  get currentId() { return this._current.id }

  // ── Public API ─────────────────────────────────────────────────────────────

  setBiome(id: BiomeId, night: boolean) {
    const def = BIOMES.find(b => b.id === id)
    if (!def) return

    this._clear()
    this._current = def
    this._night   = night

    this.groundMat.color.setHex(def.groundColor)
    this._applyDN(night, def.dn)

    for (const group of def.groups) {
      this._buildGroup(group)
    }
  }

  setNightMode(night: boolean) {
    this._night = night
    this._applyDN(night, this._current.dn)
  }

  dispose() { this._clear() }

  // ── Private ────────────────────────────────────────────────────────────────

  private _applyDN(night: boolean, dn: BiomeDayNight) {
    const sky = night ? dn.nightSky : dn.daySky
    this.scene.background = new THREE.Color(sky)

    if (!this.scene.fog) {
      this.scene.fog = new THREE.Fog(sky,
        night ? dn.nightFogNear : dn.dayFogNear,
        night ? dn.nightFogFar  : dn.dayFogFar,
      )
    } else if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.setHex(sky)
      this.scene.fog.near = night ? dn.nightFogNear : dn.dayFogNear
      this.scene.fog.far  = night ? dn.nightFogFar  : dn.dayFogFar
    }

    this.ambient.color.setHex(night ? dn.nightAmbientColor : dn.dayAmbientColor)
    this.ambient.intensity = night ? dn.nightAmbientInt : dn.dayAmbientInt
    this.sun.color.setHex(night ? 0xffffff : dn.daySunColor)
    this.sun.intensity = night ? 0 : dn.daySunInt
  }

  private _buildGroup(group: DecGroup) {
    const rng = new RNG(group.seed)
    const placements: { x: number; z: number; s: number; ry: number; tilt: number }[] = []

    for (let i = 0; i < group.count; i++) {
      const r    = group.minR + rng.next() * (group.maxR - group.minR)
      const ang  = rng.next() * Math.PI * 2
      const s    = group.scaleMin + rng.next() * (group.scaleMax - group.scaleMin)
      const ry   = rng.next() * Math.PI * 2
      const tilt = group.tiltMax ? (rng.next() - 0.5) * 2 * group.tiltMax : 0
      placements.push({ x: Math.cos(ang) * r, z: Math.sin(ang) * r, s, ry, tilt })
    }

    for (const part of group.parts) {
      const mesh = new THREE.InstancedMesh(part.geo, part.mat, group.count)
      mesh.castShadow    = true
      mesh.receiveShadow = true

      const d = this._dummy
      for (let i = 0; i < group.count; i++) {
        const { x, z, s, ry, tilt } = placements[i]
        d.position.set(x, part.yOff * s, z)
        d.rotation.set(tilt, ry, tilt * 0.4)
        d.scale.set(s, s * (part.yScale ?? 1), s)
        d.updateMatrix()
        mesh.setMatrixAt(i, d.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
      this.scene.add(mesh)
      this._meshes.push(mesh)
    }
  }

  private _clear() {
    for (const mesh of this._meshes) {
      this.scene.remove(mesh)
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    }
    this._meshes = []
  }
}
