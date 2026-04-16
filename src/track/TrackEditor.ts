import * as THREE from 'three'
import { CurveFn, findNearestT, curvePoint } from './curves.js'

// ── Constantes ────────────────────────────────────────────────────────────────

const STRAIGHT_LEN  = 2.5
const CURVE_RADIUS  = 2.5
const CURVE_DTHETA  = Math.PI / 2     // virages à 90°
const DIR_COUNT     = 4               // 0=+X  1=+Z  2=-X  3=-Z
const CLOSE_DIST    = 0.3
const RAIL_Y        = 0.18
const RAIL_GAUGE    = 0.55
const RAIL_R        = 0.04
const GHOST_R       = 0.10            // rayon tube ghost (plus épais → meilleur raycasting)
const SLOPE_HEIGHT  = 1.2             // height change per slope piece

// Couleurs des ghosts
const GHOST_COLORS: Record<SegType, number> = {
  'curve-left':   0x4cc9f0,   // bleu
  'straight':     0xffd166,   // jaune
  'curve-right':  0xf4a261,   // orange
  'slope-up':     0xe63946,   // rouge
  'slope-down':   0x4361ee,   // bleu foncé
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type SegType = 'straight' | 'curve-right' | 'curve-left' | 'slope-up' | 'slope-down'

export interface Segment {
  type:       SegType
  startX:     number
  startZ:     number
  startAngle: number
  length:     number
  startY?:   number
  endY?:     number
  centerX?:  number
  centerZ?:  number
  phi0?:     number
  turnSign?: number   // -1=droite, +1=gauche
  radius?:   number
  dtheta?:   number
}

export interface SwitchData {
  fnB:     CurveFn
  forkPos: { x: number; z: number; y: number }
  // Raw segments for serialisation (Supabase payload)
  prefix:  Segment[]
  pathA:   Segment[]
  pathB:   Segment[]
}

// ── Géométrie d'un segment ────────────────────────────────────────────────────

function ptOnSeg(seg: Segment, s: number): { x: number; y: number; z: number } {
  const ss = Math.max(0, Math.min(s, seg.length))
  const startY = seg.startY ?? 0
  const endY   = seg.endY   ?? startY
  const y      = startY + (endY - startY) * (ss / seg.length)

  if (seg.type !== 'curve-right' && seg.type !== 'curve-left') {
    return {
      x: seg.startX + ss * Math.cos(seg.startAngle),
      y,
      z: seg.startZ + ss * Math.sin(seg.startAngle),
    }
  }
  const phi = seg.phi0! + seg.turnSign! * (ss / seg.radius!)
  return {
    x: seg.centerX! + seg.radius! * Math.cos(phi),
    y,
    z: seg.centerZ! + seg.radius! * Math.sin(phi),
  }
}

function sampleSeg(seg: Segment, N: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= N; i++) {
    const { x, y, z } = ptOnSeg(seg, (i / N) * seg.length)
    pts.push(new THREE.Vector3(x, RAIL_Y + y, z))
  }
  return pts
}

function buildSegTube(seg: Segment, radius: number, mat: THREE.Material): THREE.Mesh {
  const N    = seg.type === 'straight' || seg.type === 'slope-up' || seg.type === 'slope-down' ? 2 : 16
  const pts  = sampleSeg(seg, N)
  const curve = new THREE.CatmullRomCurve3(pts, false)
  const geo   = new THREE.TubeGeometry(curve, N, radius, 6, false)
  return new THREE.Mesh(geo, mat)
}

// ── CurveFn personnalisée ─────────────────────────────────────────────────────

export function buildCustomCurveFn(segments: Segment[]): CurveFn {
  const totalLen = segments.reduce((acc, s) => acc + s.length, 0)
  if (totalLen === 0) return () => ({ x: 0, y: 0, z: 0 })

  return (t: number) => {
    const target = ((t % 1) + 1) % 1 * totalLen
    let cum = 0
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      if (cum + seg.length >= target || i === segments.length - 1) {
        return ptOnSeg(seg, target - cum)
      }
      cum += seg.length
    }
    return { x: segments[0].startX, y: segments[0].startY ?? 0, z: segments[0].startZ }
  }
}

// ── État de construction ──────────────────────────────────────────────────────

interface BuildState {
  x:        number
  z:        number
  y:        number
  dirIndex: number
}

type BuildPhase = 'prefix' | 'pathA' | 'pathB'

// ── Palette UI ────────────────────────────────────────────────────────────────

const C = {
  green:  '#06d6a0',
  orange: '#f4a261',
  red:    '#e63946',
  blue:   '#4cc9f0',
  panel:  '#fffef8',
  border: '#e8ddd0',
  muted:  '#8a7a72',
  text:   '#2d2320',
}

// ── TrackEditor ───────────────────────────────────────────────────────────────

export class TrackEditor {
  private segments: Segment[] = []
  private state: BuildState   = { x: 0, z: 0, y: 0, dirIndex: 0 }

  private _closed      = false
  private toolbar!:      HTMLElement

  // Fork / switch state
  private _phase: BuildPhase    = 'prefix'
  private _prefix: Segment[]    = []
  private _pathA:  Segment[]    = []
  private _pathB:  Segment[]    = []
  private _forkState: BuildState | null = null
  private _pathADone = false
  private _hasFork   = false

  // Preview pistes posées
  private previewGroup = new THREE.Group()
  private previewMat!:   THREE.MeshStandardMaterial
  private startMat:      THREE.MeshStandardMaterial
  private endMat:        THREE.MeshStandardMaterial

  // Ghosts interactifs
  private ghostGroup   = new THREE.Group()
  private ghostEntries: { mesh: THREE.Mesh; type: SegType; mat: THREE.MeshStandardMaterial }[] = []
  private hoveredType: SegType | null = null
  private mouseNDC     = new THREE.Vector2(-9, -9)
  private raycaster    = new THREE.Raycaster()
  private _camera:     THREE.Camera | null = null
  private _canvasEl:   HTMLCanvasElement | null = null

  // Signal placement (post-closure phase)
  private _signalTs:        number[]         = []
  private _closedFn:        CurveFn | null   = null
  private _ghostSignalMesh: THREE.Mesh | null = null
  private _signalMarkers:   THREE.Group       = new THREE.Group()
  private _ghostSignalT                       = 0
  private _groundPlane      = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

  onComplete?: (fn: CurveFn, segments: Segment[], switchData?: SwitchData, signalTs?: number[]) => void
  onCancel?:   () => void

  constructor(private scene: THREE.Scene) {
    this.previewMat = new THREE.MeshStandardMaterial({ color: 0xf4a261, roughness: 0.5, metalness: 0.3 })
    this.startMat   = new THREE.MeshStandardMaterial({ color: 0x06d6a0, emissive: 0x03a87a, emissiveIntensity: 0.6 })
    this.endMat     = new THREE.MeshStandardMaterial({ color: 0xf4a261, emissive: 0xcc5500, emissiveIntensity: 0.6 })
    this.scene.add(this.previewGroup)
    this.scene.add(this.ghostGroup)
    this.scene.add(this._signalMarkers)
    this._buildToolbar()
    this._rebuildPreview()
    this._rebuildGhosts()
  }

  // ── API publique ──────────────────────────────────────────────────────────

  get isClosed()  { return this._closed }
  get count()     { return this.segments.length }

  /** Active les interactions ghosts (raycasting + clic sur le canvas). */
  activate(camera: THREE.Camera, canvas: HTMLCanvasElement) {
    this._camera   = camera
    this._canvasEl = canvas
    canvas.addEventListener('mousemove', this._onMouseMove)
    canvas.addEventListener('click',     this._onCanvasClick)
  }

  update() {
    if (!this._camera) return

    this.raycaster.setFromCamera(this.mouseNDC, this._camera)

    // ── Signal placement ghost (when loop is closed) ────────────────────────
    if (this._closed && this._closedFn && this._ghostSignalMesh) {
      const hit = new THREE.Vector3()
      if (this.raycaster.ray.intersectPlane(this._groundPlane, hit)) {
        const nearest = findNearestT(this._closedFn, hit, 0, 200)
        this._ghostSignalT = nearest.t
        const pos = curvePoint(this._closedFn, nearest.t, 0.18)
        this._ghostSignalMesh.position.set(pos.x, pos.y + 0.5, pos.z)
        this._ghostSignalMesh.visible = true
      }
      document.body.style.cursor = 'crosshair'
      return  // don't process piece ghosts while in signal phase
    }

    if (this._ghostSignalMesh) this._ghostSignalMesh.visible = false
    if (this.ghostEntries.length === 0) return

    // ── Piece ghost hover ──────────────────────────────────────────────────
    const meshes = this.ghostEntries.map(e => e.mesh)
    const hits   = this.raycaster.intersectObjects(meshes, true)

    let newHovered: SegType | null = null
    if (hits.length > 0) {
      const hitMesh = hits[0].object as THREE.Mesh
      const entry   = this.ghostEntries.find(e => e.mesh === hitMesh || e.mesh.children.includes(hitMesh))
      newHovered = entry?.type ?? null
    }

    if (newHovered !== this.hoveredType) {
      this.hoveredType = newHovered
      this._updateGhostHighlight()
      document.body.style.cursor = newHovered ? 'pointer' : 'default'
    }
  }

  addStraight()    { if (!this._closed) { this._add('straight');    this._afterAdd() } }
  addCurveRight()  { if (!this._closed) { this._add('curve-right'); this._afterAdd() } }
  addCurveLeft()   { if (!this._closed) { this._add('curve-left');  this._afterAdd() } }
  addSlopeUp()     { if (!this._closed) { this._add('slope-up');    this._afterAdd() } }
  addSlopeDown()   { if (!this._closed) { this._add('slope-down');  this._afterAdd() } }

  undo() {
    if (this.segments.length === 0) return
    this.segments.pop()
    this._closed = false
    this.state   = { x: 0, z: 0, y: 0, dirIndex: 0 }
    // If we're in pathA or pathB, restore from forkState
    if (this._phase === 'pathA' || this._phase === 'pathB') {
      if (this._forkState) {
        this.state = { ...this._forkState }
      }
    }
    for (const seg of this.segments) this._advance(seg)
    this._afterAdd()
  }

  /** Add a fork point — splits prefix from pathA. */
  fork() {
    if (this._hasFork || this._phase !== 'prefix') return
    this._hasFork   = true
    this._prefix    = [...this.segments]
    this._forkState = { ...this.state }
    this.segments   = []
    this._phase     = 'pathA'
    this._afterAdd()
  }

  /** Start building pathB after pathA is done. */
  startPathB() {
    if (!this._pathADone || this._phase !== 'pathA') return
    this.segments = []
    this._closed  = false
    if (this._forkState) this.state = { ...this._forkState }
    this._phase   = 'pathB'
    this._afterAdd()
  }

  validate() {
    if (!this._closed) return

    const signalTs = [...this._signalTs]

    if (this._hasFork && this._phase === 'pathB') {
      this._pathB = [...this.segments]
      const prefix  = [...this._prefix]
      const pathA   = [...this._pathA]
      const pathB   = [...this._pathB]
      const fnA     = buildCustomCurveFn([...prefix, ...pathA])
      const fnB     = buildCustomCurveFn([...prefix, ...pathB])
      const forkPos = { x: this._forkState!.x, z: this._forkState!.z, y: this._forkState!.y }
      this.onComplete?.(fnA, [...prefix, ...pathA], { fnB, forkPos, prefix, pathA, pathB }, signalTs)
    } else if (this._hasFork && this._phase === 'pathA') {
      this._pathA = [...this.segments]
      const fnA = buildCustomCurveFn([...this._prefix, ...this._pathA])
      this.onComplete?.(fnA, [...this._prefix, ...this._pathA], undefined, signalTs)
    } else {
      this.onComplete?.(buildCustomCurveFn(this.segments), this.segments, undefined, signalTs)
    }
  }

  cancel() {
    this.onCancel?.()
  }

  dispose() {
    this.toolbar.remove()
    document.body.style.cursor = 'default'
    if (this._canvasEl) {
      this._canvasEl.removeEventListener('mousemove', this._onMouseMove)
      this._canvasEl.removeEventListener('click',     this._onCanvasClick)
    }
    this._clearGroup(this.previewGroup)
    this._clearGroup(this.ghostGroup)
    this._clearGroup(this._signalMarkers)
    this.scene.remove(this.previewGroup)
    this.scene.remove(this.ghostGroup)
    this.scene.remove(this._signalMarkers)
    if (this._ghostSignalMesh) {
      this.scene.remove(this._ghostSignalMesh)
      this._ghostSignalMesh.geometry.dispose()
      ;(this._ghostSignalMesh.material as THREE.Material).dispose()
      this._ghostSignalMesh = null
    }
    this.previewMat.dispose()
    this.startMat.dispose()
    this.endMat.dispose()
    for (const e of this.ghostEntries) e.mat.dispose()
  }

  // ── Signal placement ──────────────────────────────────────────────────────

  private _createGhostSignal() {
    const geo  = new THREE.SphereGeometry(0.22, 10, 8)
    const mat  = new THREE.MeshStandardMaterial({
      color: 0xffb703, emissive: 0xffb703, emissiveIntensity: 0.6,
      transparent: true, opacity: 0.75, roughness: 0.3,
    })
    this._ghostSignalMesh = new THREE.Mesh(geo, mat)
    this._ghostSignalMesh.visible = false
    this.scene.add(this._ghostSignalMesh)
  }

  private _placeSignal(t: number) {
    this._signalTs.push(t)

    // Permanent amber marker
    const pos  = curvePoint(this._closedFn!, t, 0.18)
    const geo  = new THREE.SphereGeometry(0.18, 10, 8)
    const mat  = new THREE.MeshStandardMaterial({
      color: 0xffb703, emissive: 0xffb703, emissiveIntensity: 0.5, roughness: 0.3,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(pos.x, pos.y + 0.5, pos.z)
    this._signalMarkers.add(mesh)

    this._updateToolbar()
  }

  private _removeLastSignal() {
    if (this._signalTs.length === 0) return
    this._signalTs.pop()
    const children = this._signalMarkers.children
    const last = children[children.length - 1]
    if (last) {
      this._signalMarkers.remove(last)
      ;(last as THREE.Mesh).geometry.dispose()
      ;((last as THREE.Mesh).material as THREE.Material).dispose()
    }
    this._updateToolbar()
  }

  private _onMouseMove = (e: MouseEvent) => {
    const el   = e.currentTarget as HTMLCanvasElement
    const rect = el.getBoundingClientRect()
    this.mouseNDC.x =  (e.clientX - rect.left) / rect.width  * 2 - 1
    this.mouseNDC.y = -(e.clientY - rect.top)  / rect.height * 2 + 1
  }

  private _onCanvasClick = (e: MouseEvent) => {
    // Signal placement mode — loop is closed, clicking places a signal
    if (this._closed && this._closedFn) {
      this._placeSignal(this._ghostSignalT)
      return
    }
    if (!this.hoveredType || this._closed) return
    switch (this.hoveredType) {
      case 'straight':    this.addStraight();   break
      case 'curve-left':  this.addCurveLeft();  break
      case 'curve-right': this.addCurveRight(); break
      case 'slope-up':    this.addSlopeUp();    break
      case 'slope-down':  this.addSlopeDown();  break
    }
  }

  // ── Construction ──────────────────────────────────────────────────────────

  private _afterAdd() {
    this._checkClose()
    this._rebuildPreview()
    this._rebuildGhosts()
    this.hoveredType = null
    document.body.style.cursor = 'default'
  }

  private _add(type: SegType) {
    const { x, z, y, dirIndex } = this.state
    const angle = dirIndex * (Math.PI / 2)
    let seg: Segment

    if (type === 'slope-up' || type === 'slope-down') {
      const endY = type === 'slope-up'
        ? y + SLOPE_HEIGHT
        : y - SLOPE_HEIGHT
      seg = {
        type,
        startX: x, startZ: z, startAngle: angle,
        startY: y, endY,
        length: STRAIGHT_LEN,
      }
    } else if (type === 'straight') {
      seg = { type, startX: x, startZ: z, startAngle: angle, length: STRAIGHT_LEN, startY: y, endY: y }
    } else {
      const R  = CURVE_RADIUS
      const ts = type === 'curve-right' ? -1 : 1
      const cx   = x - ts * R * Math.sin(angle)
      const cz   = z + ts * R * Math.cos(angle)
      const phi0 = Math.atan2(z - cz, x - cx)
      seg = {
        type, startX: x, startZ: z, startAngle: angle,
        length: R * CURVE_DTHETA,
        centerX: cx, centerZ: cz, phi0,
        turnSign: ts, radius: R, dtheta: CURVE_DTHETA,
        startY: y, endY: y,
      }
    }

    this.segments.push(seg)
    this._advance(seg)
  }

  private _advance(seg: Segment) {
    if (seg.type === 'straight' || seg.type === 'slope-up' || seg.type === 'slope-down') {
      this.state.x += seg.length * Math.cos(seg.startAngle)
      this.state.z += seg.length * Math.sin(seg.startAngle)
      this.state.y  = seg.endY ?? seg.startY ?? 0
    } else {
      const phi    = seg.phi0! + seg.turnSign! * seg.dtheta!
      this.state.x = seg.centerX! + seg.radius! * Math.cos(phi)
      this.state.z = seg.centerZ! + seg.radius! * Math.sin(phi)
      this.state.y = seg.endY ?? seg.startY ?? 0
      const dt     = seg.type === 'curve-right' ? -1 : 1
      this.state.dirIndex = ((this.state.dirIndex + dt) + DIR_COUNT) % DIR_COUNT
    }
  }

  private _checkClose() {
    if (this.segments.length < 3) return
    const dist = Math.sqrt(this.state.x ** 2 + this.state.z ** 2)
    const yOk  = Math.abs(this.state.y) < 0.2   // must be back at ground level

    if (this._hasFork && (this._phase === 'pathA' || this._phase === 'pathB')) {
      const distToOrigin = Math.sqrt(this.state.x ** 2 + this.state.z ** 2)
      if (distToOrigin < CLOSE_DIST && this.state.dirIndex === 0 && yOk) {
        this._closed = true
        if (this._phase === 'pathA') {
          this._pathA    = [...this.segments]
          this._pathADone = true
        }
        // Compute fn for signal placement on first closure
        if (!this._closedFn) {
          this._closedFn = buildCustomCurveFn([...this._prefix, ...this.segments])
          this._createGhostSignal()
        }
      }
    } else {
      if (dist < CLOSE_DIST && this.state.dirIndex === 0 && yOk) {
        this._closed = true
        if (!this._closedFn) {
          this._closedFn = buildCustomCurveFn(this.segments)
          this._createGhostSignal()
        }
      }
    }
  }

  // ── Preview des rails posés ───────────────────────────────────────────────

  private _clearGroup(g: THREE.Group) {
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose() })
    g.clear()
  }

  private _rebuildPreview() {
    this._clearGroup(this.previewGroup)
    this._updateToolbar()

    this.previewMat.color.set(this._closed ? 0x06d6a0 : 0xf4a261)
    this.previewMat.emissive.set(this._closed ? 0x02a07a : 0x000000)
    this.previewMat.emissiveIntensity = this._closed ? 0.15 : 0

    const tieMat = new THREE.MeshStandardMaterial({ color: 0x5c3d1e, roughness: 0.9 })

    // Draw prefix segments (grayed out) when in pathA/pathB phase
    const prefixMat = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.5, transparent: true, opacity: 0.6 })
    if (this._hasFork && this._prefix.length > 0) {
      for (const seg of this._prefix) {
        this._drawSegPreview(seg, prefixMat, tieMat)
      }
    }

    // Draw pathA preview when building pathB
    if (this._phase === 'pathB' && this._pathA.length > 0) {
      const pathAMat = new THREE.MeshStandardMaterial({ color: 0x4cc9f0, roughness: 0.5, transparent: true, opacity: 0.7 })
      for (const seg of this._pathA) {
        this._drawSegPreview(seg, pathAMat, tieMat)
      }
    }

    for (const seg of this.segments) {
      this._drawSegPreview(seg, this.previewMat, tieMat)
    }

    // Marqueur départ (vert)
    const mGeo  = new THREE.SphereGeometry(0.15, 8, 8)
    const mMesh = new THREE.Mesh(mGeo, this.startMat)
    mMesh.position.set(0, RAIL_Y + 0.2, 0)
    this.previewGroup.add(mMesh)

    // Fork indicator
    if (this._forkState) {
      const forkGeo  = new THREE.SphereGeometry(0.18, 8, 8)
      const forkMat  = new THREE.MeshStandardMaterial({ color: 0xff6b35, emissive: 0xff6b35, emissiveIntensity: 0.5 })
      const forkMesh = new THREE.Mesh(forkGeo, forkMat)
      forkMesh.position.set(this._forkState.x, RAIL_Y + 0.25, this._forkState.z)
      this.previewGroup.add(forkMesh)
    }

    // Marqueur extrémité courante (orange) — caché si fermé
    if (this.segments.length > 0 && !this._closed) {
      const eGeo   = new THREE.SphereGeometry(0.15, 8, 8)
      const eMesh  = new THREE.Mesh(eGeo, this.endMat)
      eMesh.position.set(this.state.x, RAIL_Y + 0.2 + this.state.y, this.state.z)
      this.previewGroup.add(eMesh)
    }
  }

  private _drawSegPreview(seg: Segment, mat: THREE.MeshStandardMaterial, tieMat: THREE.MeshStandardMaterial) {
    const N   = (seg.type === 'straight' || seg.type === 'slope-up' || seg.type === 'slope-down') ? 2 : 16
    const pts = sampleSeg(seg, N)
    for (const side of [-1, 1]) {
      const railPts = pts.map((p, i) => {
        const pA   = pts[Math.max(0, i - 1)]
        const pB   = pts[Math.min(N, i + 1)]
        const tang = new THREE.Vector3().subVectors(pB, pA).normalize()
        return new THREE.Vector3(
          p.x + side * RAIL_GAUGE * tang.z, p.y,
          p.z - side * RAIL_GAUGE * tang.x,
        )
      })
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts, false), N, RAIL_R, 6, false)
      this.previewGroup.add(new THREE.Mesh(geo, mat))
    }

    // Traverses
    const tieGeo = new THREE.BoxGeometry(0.07, 0.05, 1.0)
    const TIE_N  = Math.max(2, Math.round(seg.length / 0.6))
    for (let i = 0; i <= TIE_N; i++) {
      const t            = i / TIE_N
      const { x, y, z }  = ptOnSeg(seg, t * seg.length)
      const next         = ptOnSeg(seg, Math.min((t + 0.01), 1) * seg.length)
      const tie          = new THREE.Mesh(tieGeo, tieMat)
      tie.position.set(x, RAIL_Y + y - 0.05, z)
      tie.rotation.y  = Math.atan2(next.x - x, next.z - z)
      this.previewGroup.add(tie)
    }
  }

  // ── Ghosts interactifs ────────────────────────────────────────────────────

  private _rebuildGhosts() {
    this._clearGroup(this.ghostGroup)
    this.ghostEntries = []

    if (this._closed) return  // boucle fermée → plus rien à ajouter

    const TYPES: SegType[] = ['curve-left', 'straight', 'curve-right', 'slope-up', 'slope-down']

    for (const type of TYPES) {
      const ghost = this._computeGhostSeg(type)
      const color = GHOST_COLORS[type]

      const mat = new THREE.MeshStandardMaterial({
        color,
        transparent: true,
        opacity: 0.45,
        roughness: 0.5,
        metalness: 0.2,
      })

      const N    = (ghost.type === 'straight' || ghost.type === 'slope-up' || ghost.type === 'slope-down') ? 3 : 18
      const pts  = sampleSeg(ghost, N)
      const tube = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(pts, false), N, GHOST_R, 7, false,
      )
      const mesh = new THREE.Mesh(tube, mat)

      // Flèche à l'extrémité
      const exitState = this._computeExitState(ghost)
      const arrowGroup = this._buildArrow(exitState.x, exitState.z, exitState.y, exitState.angle, color)
      arrowGroup.traverse(o => {
        if ((o as THREE.Mesh).isMesh) {
          const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial
          m.transparent = true
          m.opacity     = 0.5
        }
      })
      mesh.add(arrowGroup)

      this.ghostGroup.add(mesh)
      this.ghostEntries.push({ mesh, type, mat })
    }
  }

  private _computeGhostSeg(type: SegType): Segment {
    const { x, z, y, dirIndex } = this.state
    const angle = dirIndex * (Math.PI / 2)

    if (type === 'straight') {
      return { type, startX: x, startZ: z, startAngle: angle, length: STRAIGHT_LEN, startY: y, endY: y }
    }

    if (type === 'slope-up') {
      return { type, startX: x, startZ: z, startAngle: angle, length: STRAIGHT_LEN, startY: y, endY: y + SLOPE_HEIGHT }
    }

    if (type === 'slope-down') {
      return { type, startX: x, startZ: z, startAngle: angle, length: STRAIGHT_LEN, startY: y, endY: y - SLOPE_HEIGHT }
    }

    const R  = CURVE_RADIUS
    const ts = type === 'curve-right' ? -1 : 1
    const cx = x - ts * R * Math.sin(angle)
    const cz = z + ts * R * Math.cos(angle)
    return {
      type, startX: x, startZ: z, startAngle: angle,
      length: R * CURVE_DTHETA,
      centerX: cx, centerZ: cz,
      phi0: Math.atan2(z - cz, x - cx),
      turnSign: ts, radius: R, dtheta: CURVE_DTHETA,
      startY: y, endY: y,
    }
  }

  private _computeExitState(seg: Segment): { x: number; z: number; y: number; angle: number } {
    let ex: number, ez: number, ey: number, edir: number
    if (seg.type === 'straight' || seg.type === 'slope-up' || seg.type === 'slope-down') {
      ex    = seg.startX + seg.length * Math.cos(seg.startAngle)
      ez    = seg.startZ + seg.length * Math.sin(seg.startAngle)
      ey    = seg.endY ?? seg.startY ?? 0
      edir  = seg.startAngle
    } else {
      const phi = seg.phi0! + seg.turnSign! * seg.dtheta!
      ex   = seg.centerX! + seg.radius! * Math.cos(phi)
      ez   = seg.centerZ! + seg.radius! * Math.sin(phi)
      ey   = seg.endY ?? seg.startY ?? 0
      const dt = seg.type === 'curve-right' ? -1 : 1
      const exitDirIndex = ((this.state.dirIndex + dt) + DIR_COUNT) % DIR_COUNT
      edir = exitDirIndex * (Math.PI / 2)
    }
    return { x: ex, z: ez, y: ey, angle: edir }
  }

  private _buildArrow(x: number, z: number, y: number, angle: number, color: number): THREE.Group {
    const group = new THREE.Group()
    group.position.set(x, RAIL_Y + 0.05 + y, z)

    const coneGeo = new THREE.ConeGeometry(0.18, 0.45, 8)
    const coneMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4 })
    const cone    = new THREE.Mesh(coneGeo, coneMat)

    cone.rotation.z = -Math.PI / 2
    cone.rotation.y = -angle

    group.add(cone)
    return group
  }

  private _updateGhostHighlight() {
    for (const { mesh, type, mat } of this.ghostEntries) {
      const hovered = type === this.hoveredType
      mat.opacity          = hovered ? 0.85 : 0.45
      mat.emissive.set(hovered ? GHOST_COLORS[type] : 0x000000)
      mat.emissiveIntensity = hovered ? 0.35 : 0

      mesh.children[0]?.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial
          m.opacity          = hovered ? 1.0 : 0.5
          m.emissiveIntensity = hovered ? 0.7 : 0.4
        }
      })
    }
  }

  // ── Toolbar HTML ──────────────────────────────────────────────────────────

  private _buildToolbar() {
    this._injectStyles()
    const el = document.createElement('div')
    el.className = 'te-toolbar'
    el.innerHTML = `
      <div class="te-hint" data-hint>
        Cliquez sur un <b>ghost</b> dans la scène, ou utilisez les boutons
      </div>
      <div class="te-pieces">
        <button class="te-btn te-piece" data-action="left"
          style="--gc:${C.blue}" title="Virage gauche">
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
            <path d="M5 13 Q5 7 13 7 L21 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none"/>
            <polyline points="17,3 21,7 17,11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
            <line x1="5" y1="19" x2="5" y2="13" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
          <span>Gauche</span>
        </button>
        <button class="te-btn te-piece" data-action="straight"
          style="--gc:${C.orange}" title="Tout droit">
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
            <line x1="13" y1="21" x2="13" y2="5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
            <polyline points="9,9 13,5 17,9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
          </svg>
          <span>Droit</span>
        </button>
        <button class="te-btn te-piece" data-action="right"
          style="--gc:#f4a261" title="Virage droite">
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
            <path d="M21 13 Q21 7 13 7 L5 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none"/>
            <polyline points="9,3 5,7 9,11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
            <line x1="21" y1="19" x2="21" y2="13" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
          <span>Droite</span>
        </button>
        <button class="te-btn te-piece" data-action="slope-up"
          style="--gc:#e63946" title="Montée">
          <span style="font-size:18px">↗</span>
          <span>Montée</span>
        </button>
        <button class="te-btn te-piece" data-action="slope-down"
          style="--gc:#4361ee" title="Descente">
          <span style="font-size:18px">↘</span>
          <span>Descente</span>
        </button>
      </div>
      <div class="te-actions">
        <button class="te-btn te-fork" data-action="fork" title="Créer un aiguillage">
          ⑂ Fourche
        </button>
        <button class="te-btn te-pathb" data-action="pathb" title="Commencer chemin B" disabled>
          ⇒ Chemin B
        </button>
        <button class="te-btn te-undo" data-action="undo">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M3 8a5 5 0 1 0 1-2.8" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
            <polyline points="1,4 3,8 7,6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          </svg>
          Annuler
        </button>
        <div class="te-signal-panel" data-signal-panel style="display:none"></div>
        <button class="te-btn te-validate" data-action="validate" disabled>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <polyline points="2,8 6,12 14,4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Valider
        </button>
        <button class="te-btn te-quit" data-action="cancel">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
            <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
          Quitter
        </button>
      </div>
    `

    el.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null
      if (!btn) return
      switch (btn.dataset.action) {
        case 'straight':   this.addStraight();   break
        case 'left':       this.addCurveLeft();  break
        case 'right':      this.addCurveRight(); break
        case 'slope-up':   this.addSlopeUp();    break
        case 'slope-down': this.addSlopeDown();  break
        case 'fork':       this.fork();          break
        case 'pathb':      this.startPathB();    break
        case 'undo':       this.undo();          break
        case 'validate':        this.validate();            break
        case 'cancel':          this.cancel();              break
        case 'remove-signal':   this._removeLastSignal();   break
      }
    })

    document.body.appendChild(el)
    this.toolbar = el
  }

  private _updateToolbar() {
    const hint        = this.toolbar.querySelector('[data-hint]')!
    const validate    = this.toolbar.querySelector('[data-action="validate"]') as HTMLButtonElement
    const forkBtn     = this.toolbar.querySelector('[data-action="fork"]') as HTMLButtonElement
    const pathbBtn    = this.toolbar.querySelector('[data-action="pathb"]') as HTMLButtonElement
    const signalPanel = this.toolbar.querySelector('[data-signal-panel]') as HTMLElement

    // Show/hide fork button — only in prefix phase and not yet forked
    forkBtn.style.display = (!this._hasFork && this._phase === 'prefix') ? '' : 'none'
    // Show/hide pathB button
    pathbBtn.style.display = this._hasFork ? '' : 'none'
    if (this._pathADone && this._phase === 'pathA') {
      pathbBtn.removeAttribute('disabled')
    } else {
      pathbBtn.setAttribute('disabled', '')
    }

    if (this._closed) {
      let msg = '<span style="color:#06d6a0;font-weight:900">✓ Boucle fermée !</span>'
      if (this._hasFork && this._phase === 'pathA') {
        msg += ' Cliquez <b>Chemin B</b> ou <b>Valider</b>.'
      } else if (this._hasFork && this._phase === 'pathB') {
        msg += ' Cliquez <b>Valider</b> pour créer l\'aiguillage.'
      } else {
        msg += ' <span style="color:#e88c00">Cliquez sur la voie pour placer des feux</span>, puis <b>Valider</b>.'
      }
      hint.innerHTML = msg
      validate.removeAttribute('disabled')

      // Signal panel
      signalPanel.style.display = ''
      signalPanel.innerHTML = `
        <span style="font-size:11px;font-weight:800;color:#e88c00">
          🚦 ${this._signalTs.length} feu${this._signalTs.length !== 1 ? 'x' : ''} placé${this._signalTs.length !== 1 ? 's' : ''}
        </span>
        ${this._signalTs.length > 0
          ? `<button class="te-btn te-remove-sig" data-action="remove-signal">✕ Retirer dernier</button>`
          : ''
        }
      `
    } else {
      signalPanel.style.display = 'none'
      validate.setAttribute('disabled', '')
      if (this.segments.length === 0) {
        const phaseMsg = this._phase === 'pathA' ? ' [Chemin A]' : this._phase === 'pathB' ? ' [Chemin B]' : ''
        hint.innerHTML = `Cliquez sur un <b>ghost</b> dans la scène, ou utilisez les boutons${phaseMsg}`
      } else {
        const dist  = Math.sqrt(this.state.x ** 2 + this.state.z ** 2).toFixed(1)
        const DIRS  = ['+X ▶', '+Z ▼', '−X ◀', '−Z ▲']
        const dirOk = this.state.dirIndex === 0
        const phaseLabel = this._phase === 'pathA' ? ' [Chemin A]' : this._phase === 'pathB' ? ' [Chemin B]' : ''
        hint.innerHTML =
          `${this.segments.length} pièce${this.segments.length > 1 ? 's' : ''}${phaseLabel} · ` +
          `Dist. départ : <b>${dist}</b> · ` +
          `Dir : <span style="color:${dirOk ? '#06d6a0' : '#e63946'}">${DIRS[this.state.dirIndex]}</span> · ` +
          `Y : <b>${this.state.y.toFixed(1)}</b>`
      }
    }
  }

  private _injectStyles() {
    if (document.getElementById('te-styles')) return
    const style = document.createElement('style')
    style.id = 'te-styles'
    style.textContent = `
      .te-toolbar {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${C.panel};
        border: 2.5px solid ${C.border};
        border-radius: 20px;
        box-shadow: 0 8px 32px rgba(0,0,0,.18), 0 2px 8px rgba(0,0,0,.10);
        padding: 12px 18px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        align-items: center;
        font-family: 'Nunito', system-ui, sans-serif;
        font-size: 12px;
        color: ${C.text};
        user-select: none;
        z-index: 200;
        min-width: 360px;
      }
      .te-hint {
        font-size: 11px;
        font-weight: 700;
        color: ${C.muted};
        letter-spacing: .2px;
        text-align: center;
        line-height: 1.5;
      }
      .te-pieces, .te-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: center; }
      .te-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 8px 14px;
        border-radius: 12px;
        border: 2px solid ${C.border};
        background: #fff;
        color: ${C.text};
        font-family: inherit;
        font-size: 10px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: .4px;
        cursor: pointer;
        transition: background .12s, transform .1s, border-color .12s;
        min-width: 72px;
      }
      .te-piece { border-color: #c8bdb0; color: var(--gc, #5c3d1e); padding: 10px 14px 7px; }
      .te-piece:hover {
        background: color-mix(in srgb, var(--gc, #f4a261) 12%, white);
        border-color: var(--gc, ${C.orange});
        transform: translateY(-2px);
      }
      .te-piece:active { transform: translateY(0); }
      .te-undo, .te-validate, .te-quit, .te-fork, .te-pathb {
        flex-direction: row; gap: 6px; min-width: auto;
        padding: 7px 12px; font-size: 11px;
      }
      .te-undo { color: ${C.muted}; }
      .te-undo:hover { background: #f0f0f0; }
      .te-fork {
        color: #ff6b35; border-color: #ffb59a;
        background: #fff8f5;
      }
      .te-fork:hover { background: #ff6b35; color: #fff; }
      .te-pathb {
        color: #4361ee; border-color: #aab4f5;
        background: #f5f6ff;
      }
      .te-pathb:not([disabled]):hover { background: #4361ee; color: #fff; }
      .te-pathb[disabled] { opacity: .4; cursor: not-allowed; }
      .te-validate {
        background: #e8faf5; border-color: #06d6a0; color: #03a87a;
      }
      .te-validate:not([disabled]):hover {
        background: #06d6a0; color: #fff; transform: translateY(-1px);
      }
      .te-validate[disabled] { opacity: .4; cursor: not-allowed; }
      .te-quit {
        color: ${C.red};
        border-color: color-mix(in srgb, ${C.red} 30%, transparent);
        background:   color-mix(in srgb, ${C.red}  8%, transparent);
      }
      .te-quit:hover { background: ${C.red}; color: #fff; }
      .te-signal-panel {
        display: flex; align-items: center; gap: 10px;
        background: #fff8e7; border: 1.5px solid #ffcf5c;
        border-radius: 12px; padding: 6px 12px;
        font-size: 11px;
      }
      .te-remove-sig {
        flex-direction: row; gap: 5px; min-width: auto;
        padding: 4px 10px; font-size: 10px;
        color: ${C.red}; border-color: #f5b8b8; background: #fff5f5;
      }
      .te-remove-sig:hover { background: ${C.red}; color: #fff; }
    `
    document.head.appendChild(style)
  }
}
