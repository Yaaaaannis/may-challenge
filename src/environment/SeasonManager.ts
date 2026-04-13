import * as THREE from 'three'

export type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter'

// ── Seeded RNG ────────────────────────────────────────────────────────────────
function makeRng(seed: number): () => number {
  let s = (seed ^ 0xdeadbeef) >>> 0
  return () => {
    s = Math.imul(s ^ (s >>> 15), s | 1)
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61)
    return ((s ^ (s >>> 14)) >>> 0) / 0xffffffff
  }
}

function mat(
  color: number, rough = 0.9, metal = 0,
  emissive?: number, emInt = 0,
): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })
  if (emissive !== undefined) { m.emissive.setHex(emissive); m.emissiveIntensity = emInt }
  return m
}

export class SeasonManager {
  private scene:   THREE.Scene
  private _meshes: THREE.InstancedMesh[] = []
  private _dummy   = new THREE.Object3D()

  constructor(scene: THREE.Scene) { this.scene = scene }

  setSeason(id: SeasonId) {
    this._clear()
    if (id === 'spring') this._buildSpring()
    else if (id === 'autumn') this._buildAutumn()
    else if (id === 'winter') this._buildWinter()
    // summer = no overlay
  }

  dispose() { this._clear() }

  // ── Private ────────────────────────────────────────────────────────────────

  private _inst(
    geo: THREE.BufferGeometry,
    material: THREE.MeshStandardMaterial,
    count: number,
    seed: number,
    minR: number, maxR: number,
    scaleMin: number, scaleMax: number,
    yOff: number, yScale = 1.0, tiltMax = 0,
  ) {
    const mesh = new THREE.InstancedMesh(geo, material, count)
    mesh.castShadow = true
    const rng = makeRng(seed)
    const d   = this._dummy
    for (let i = 0; i < count; i++) {
      const ang  = rng() * Math.PI * 2
      const r    = minR + rng() * (maxR - minR)
      const s    = scaleMin + rng() * (scaleMax - scaleMin)
      const ry   = rng() * Math.PI * 2
      const tilt = tiltMax ? (rng() - 0.5) * 2 * tiltMax : 0
      d.position.set(Math.cos(ang) * r, yOff * s, Math.sin(ang) * r)
      d.rotation.set(tilt, ry, tilt * 0.4)
      d.scale.set(s, s * yScale, s)
      d.updateMatrix()
      mesh.setMatrixAt(i, d.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    this.scene.add(mesh)
    this._meshes.push(mesh)
  }

  private _buildSpring() {
    // Cherry blossom trees (trunk + blossom ball, same seed → same positions)
    this._inst(new THREE.CylinderGeometry(0.10, 0.17, 1, 6),
      mat(0x7a4a2a), 55, 7001, 10, 45, 0.7, 1.6, 0.5)
    this._inst(new THREE.SphereGeometry(0.75, 8, 6),
      mat(0xffb0cc, 0.55, 0, 0xff88aa, 0.18), 55, 7001, 10, 45, 0.7, 1.6, 1.7)

    // Fallen petals (tiny flat discs on ground)
    this._inst(new THREE.CylinderGeometry(0.13, 0.13, 0.01, 5),
      mat(0xffd0e0, 0.8, 0, 0xffbbcc, 0.06), 250, 7002, 8, 44, 0.4, 2.0, 0.005, 0.08, 0.25)

    // White+yellow wildflowers
    this._inst(new THREE.SphereGeometry(0.055, 5, 4),
      mat(0xffffff, 0.4, 0, 0xffeeff, 0.25), 180, 7003, 8, 44, 0.6, 1.5, 0.34)
    this._inst(new THREE.SphereGeometry(0.055, 5, 4),
      mat(0xffee44, 0.4, 0, 0xffdd00, 0.25), 120, 7004, 8, 44, 0.6, 1.5, 0.34)
  }

  private _buildAutumn() {
    // Fallen leaves (4 colours, flat discs)
    const leafColors = [0xcc4400, 0xe86020, 0xddaa00, 0xb83300]
    for (let ci = 0; ci < 4; ci++) {
      this._inst(new THREE.CylinderGeometry(0.16, 0.16, 0.012, 5),
        mat(leafColors[ci], 0.9), 130, 8001 + ci, 8, 44, 0.4, 2.2, 0.005, 0.05, 0.35)
    }

    // Autumn trees (trunk + warm-coloured crown, same seed)
    this._inst(new THREE.CylinderGeometry(0.11, 0.17, 1, 6),
      mat(0x3a2008), 60, 8005, 10, 45, 0.7, 1.8, 0.5)
    this._inst(new THREE.SphereGeometry(0.65, 8, 6),
      mat(0xcc5511, 0.8), 60, 8005, 10, 45, 0.7, 1.8, 1.6)
    this._inst(new THREE.SphereGeometry(0.50, 7, 5),
      mat(0xdd9922, 0.8), 40, 8006, 11, 44, 0.7, 1.5, 1.7)

    // Small orange pumpkins on ground
    this._inst(new THREE.SphereGeometry(0.13, 7, 5),
      mat(0xff7711, 0.7, 0, 0xff5500, 0.08), 45, 8007, 9, 40, 0.6, 1.4, 0.13, 0.85)
  }

  private _buildWinter() {
    // Snow mounds
    const snowMat = mat(0xeef5ff, 0.35, 0, 0xddeeff, 0.06)
    this._inst(new THREE.SphereGeometry(0.5, 7, 5), snowMat, 100, 9001, 8, 46, 0.4, 2.2, 0.12, 0.45)

    // Snow-covered pines (trunk + green cone + white snow cone, same seed)
    this._inst(new THREE.CylinderGeometry(0.09, 0.15, 1, 6),
      mat(0x2a1a08), 72, 9002, 10, 45, 0.6, 2.0, 0.5)
    this._inst(new THREE.ConeGeometry(0.70, 1.9, 7),
      mat(0x2a5a2a, 0.85), 72, 9002, 10, 45, 0.6, 2.0, 1.95)
    this._inst(new THREE.ConeGeometry(0.76, 0.70, 7),
      mat(0xe8f5ff, 0.4, 0, 0xffffff, 0.18), 72, 9002, 10, 45, 0.6, 2.0, 1.85)

    // Icicles (cone geometry pre-rotated to point DOWN)
    const icicleGeo = new THREE.ConeGeometry(0.04, 0.55, 5)
    icicleGeo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI))
    this._inst(icicleGeo,
      mat(0xb8d8f0, 0.08, 0.6, 0x88ccff, 0.38),
      110, 9003, 8, 44, 0.7, 1.5, 2.0, 1.0)

    // Frozen ponds (flat glowing disc)
    this._inst(new THREE.CylinderGeometry(4.0, 4.0, 0.06, 12),
      mat(0x8ab8d8, 0.05, 0.3, 0x44aacc, 0.12),
      4, 9004, 12, 36, 0.6, 1.4, 0.03, 0.015)

    // Snowflake-like star bursts (thin crossed boxes) — use flat thin cylinders rotated in pairs
    const sfGeo = new THREE.BoxGeometry(0.55, 0.03, 0.03)
    this._inst(sfGeo, mat(0xeef8ff, 0.3, 0, 0xcceeff, 0.2), 60, 9005, 9, 43, 0.5, 1.6, 0.5)
  }

  private _clear() {
    for (const m of this._meshes) {
      this.scene.remove(m)
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    }
    this._meshes = []
  }
}
