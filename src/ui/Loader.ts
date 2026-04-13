// ── Loader — 3D Split-flap departure board ────────────────────────────────────
// Three.js scene: physical board panel, spotlit room.
// Canvas 2D renders flip animation as a CanvasTexture on the board mesh.
// WebGPU CRT post-process applied on the Three.js render output.

import * as THREE from 'three'

// ═══════════════════════════════════════════════════════════════════════════════
// ── Board data
// ═══════════════════════════════════════════════════════════════════════════════

const ROW_LEN = 32
function mkRow(t: string, d: string, p: string, s: string) {
  return t.padEnd(5) + ' ' + d.padEnd(13) + ' ' + p.padEnd(2) + ' ' + s.padEnd(9)
}
const HEADER_ROW  = mkRow('HEURE', 'DESTINATION  ', 'PL', 'ÉTAT     ')
const DATA_ROWS = [
  { text: mkRow('07:52', 'AVALON',      ' 3', 'PARTI    '), delay: 320 },
  { text: mkRow('08:31', 'BRUMEVILLE',  ' 1', 'PRÉVU    '), delay: 570 },
  { text: mkRow('09:14', 'VOLTAÏC',     ' 7', 'RETARD   '), delay: 820 },
  { text: mkRow('10:07', 'SOLARIS',     ' 2', 'QUAI 2   '), delay: 1070 },
  { text: mkRow('10:45', 'NEBULA CITY', ' 5', 'CHARGMT  '), delay: 1320 },
]
const ACTIVE_ROW   = 4
const ACTIVE_FINAL = mkRow('10:45', 'NEBULA CITY', ' 5', 'EN ROUTE ')
const TITLE_TEXT   = 'PETIT TRAIN EXPRESS'

const FLIP_CHARS  = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.:-►ÉÀÂ'
const FLIP_MS     = 75
const EXTRA_FLIPS = 3
const COL_SEP     = [5, 19, 22]

// ═══════════════════════════════════════════════════════════════════════════════
// ── WGSL — CRT post-process
// ═══════════════════════════════════════════════════════════════════════════════

const WGSL_CRT = /* wgsl */`
struct Uni { time: f32, _a: f32, _b: f32, _c: f32 }
@group(0) @binding(0) var<uniform> u    : Uni;
@group(0) @binding(1) var          tex  : texture_2d<f32>;
@group(0) @binding(2) var          samp : sampler;

fn barrel(uv: vec2f, k: f32) -> vec2f {
  let c  = uv - 0.5;
  let r2 = dot(c, c);
  return uv + c * (r2 * k);
}
fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5);
}

@vertex fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  var P = array<vec2f,3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
  return vec4f(P[vi], 0.0, 1.0);
}

@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let res  = vec2f(textureDimensions(tex));
  let uv   = fc.xy / res;

  let buv  = barrel(uv, 0.042);
  // In-bounds mask — no branching, so textureSample stays in uniform control flow
  let mask = select(0.0, 1.0, all(buv >= vec2f(0.0)) && all(buv <= vec2f(1.0)));

  let ca  = 0.0012;
  let r   = textureSampleLevel(tex, samp, buv + vec2f( ca, 0.0), 0.0).r;
  let g   = textureSampleLevel(tex, samp, buv, 0.0).g;
  let b   = textureSampleLevel(tex, samp, buv + vec2f(-ca, 0.0), 0.0).b;
  var col = vec3f(r, g, b);

  let px    = 2.0 / res;
  var bloom = vec3f(0.0);
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      let s   = textureSampleLevel(tex, samp, buv + vec2f(f32(dx), f32(dy)) * px, 0.0).rgb;
      let lum = dot(s, vec3f(0.299, 0.587, 0.114));
      bloom  += s * max(0.0, lum - 0.48);
    }
  }
  col += bloom * 0.20;

  let scan = 0.90 + 0.10 * sin(fc.y * 3.14159265);
  col     *= scan;

  col = mix(col, col * vec3f(0.92, 0.98, 0.84), 0.15);

  let vig  = smoothstep(0.90, 0.28, length((uv - 0.5) * 1.4));
  col     *= 0.55 + 0.45 * vig;

  let grain = (hash(uv + fract(u.time * 0.057) * 17.3) - 0.5) * 0.025;
  col += grain;

  // Black outside barrel bounds
  col *= mask;

  return vec4f(clamp(col, vec3f(0.0), vec3f(1.2)), 1.0);
}
`

// ═══════════════════════════════════════════════════════════════════════════════
// ── Cell drawing helpers
// ═══════════════════════════════════════════════════════════════════════════════

function rndChar() {
  return FLIP_CHARS[Math.floor(Math.random() * FLIP_CHARS.length)]
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  prev: string, next: string, progress: number,
  charColor: string,
) {
  const mid = y + h / 2

  ctx.fillStyle = '#14141c'
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h)
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h)

  const fs = Math.round(h * 0.66)
  ctx.font         = `bold ${fs}px 'Courier New', monospace`
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle    = charColor

  const drawChar = (ch: string, half: 'top' | 'bottom' | 'all') => {
    ctx.save()
    if (half !== 'all') {
      ctx.beginPath()
      ctx.rect(x, half === 'top' ? y : mid, w, h / 2 + 1)
      ctx.clip()
    }
    ctx.fillText(ch, x + w / 2, mid)
    ctx.restore()
  }

  if (progress <= 0)      { drawChar(prev, 'all') }
  else if (progress >= 1) { drawChar(next, 'all') }
  else if (progress < 0.5) {
    const sy = Math.max(0, Math.cos(progress * Math.PI))
    drawChar(prev, 'bottom')
    ctx.save()
    ctx.beginPath(); ctx.rect(x, y, w, h / 2 + 1); ctx.clip()
    ctx.translate(0, mid); ctx.scale(1, sy); ctx.translate(0, -mid)
    drawChar(prev, 'all')
    ctx.restore()
    ctx.fillStyle = `rgba(0,0,8,${(1 - sy) * 0.72})`
    ctx.fillRect(x, y, w, (h / 2) * sy + 1)
  } else {
    const t2 = (progress - 0.5) * 2
    const sy = Math.sin(t2 * Math.PI / 2)
    drawChar(next, 'top')
    ctx.save()
    ctx.beginPath(); ctx.rect(x, mid - 1, w, h / 2 + 2); ctx.clip()
    ctx.translate(0, mid); ctx.scale(1, sy); ctx.translate(0, -mid)
    drawChar(next, 'all')
    ctx.restore()
    ctx.fillStyle = `rgba(0,0,8,${(1 - sy) * 0.55})`
    ctx.fillRect(x, mid, w, (h / 2) * sy + 1)
  }

  ctx.fillStyle = '#000000'
  ctx.fillRect(x, mid - 1, w, 2)
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── Cell state
// ═══════════════════════════════════════════════════════════════════════════════

interface CellState {
  row: number; col: number
  x: number;   y: number
  cw: number;  ch: number
  displayed: string
  queue: string[]
  queueIdx: number
  flipProgress: number
  flipStart: number
  isHeader: boolean
  isActive: boolean
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── Loader
// ═══════════════════════════════════════════════════════════════════════════════

export class Loader {
  // ── Offscreen board canvas (never in DOM — used as Three.js texture source)
  private _board:    HTMLCanvasElement
  private _bctx:     CanvasRenderingContext2D
  private _boardTex!: THREE.CanvasTexture

  // ── Three.js
  private _renderer!: THREE.WebGLRenderer
  private _scene!:    THREE.Scene
  private _camera!:   THREE.PerspectiveCamera
  private _boardGroup!: THREE.Group   // animated on reveal

  // ── Board layout
  private _cw = 36; private _ch = 54
  private _boardX = 0; private _boardY = 0
  private _boardW = 0; private _boardH = 0
  private _canvasW = 0; private _canvasH = 0

  // ── Cells
  private _cells:  CellState[] = []
  private _rowYs:  number[] = []

  // ── Animation
  private _raf    = 0
  private _t0     = 0
  private _revealDone = false

  // ── WebGPU CRT
  private _gpu:        GPUDevice | null = null
  private _gpuCanvas:  HTMLCanvasElement | null = null
  private _gpuCtx:     GPUCanvasContext | null = null
  private _gpuPipeline: GPURenderPipeline | null = null
  private _gpuBG:       GPUBindGroup | null = null
  private _gpuUni:      GPUBuffer | null = null
  private _gpuTex:      GPUTexture | null = null

  constructor() {
    this._board = document.createElement('canvas')
    this._bctx  = this._board.getContext('2d')!
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  show() {
    this._layout()
    this._board.width  = this._canvasW
    this._board.height = this._canvasH

    this._buildRenderer()
    this._buildScene()
    this._buildCells()
    this._scheduleRows()
    this._t0  = performance.now()
    this._raf = requestAnimationFrame(t => this._tick(t))
  }

  async shatter(): Promise<void> {
    await this._initGPU()

    const MIN_MS = 2400
    const elapsed = performance.now() - this._t0
    if (elapsed < MIN_MS) await this._sleep(MIN_MS - elapsed)

    await this._flipActiveStatus()
    await this._sleep(420)
    await this._revealCascade()
  }

  dispose() {
    cancelAnimationFrame(this._raf)
    this._renderer?.dispose()
    this._renderer?.domElement.remove()
    this._gpuCanvas?.remove()
  }

  // ── Main tick ──────────────────────────────────────────────────────────────

  private _tick(now: number) {
    if (this._revealDone) return

    // Draw board content onto offscreen canvas
    this._drawBoardCanvas(now)

    // Mark texture dirty
    if (this._boardTex) this._boardTex.needsUpdate = true

    // Subtle camera drift
    const t = now * 0.001
    this._camera.position.x = Math.sin(t * 0.11) * 0.06
    this._camera.position.y = -0.18 + Math.sin(t * 0.07) * 0.02
    this._camera.lookAt(0, 0, 0)

    // Render Three.js scene
    this._renderer.render(this._scene, this._camera)

    // GPU CRT pass
    if (this._gpu && this._gpuPipeline) this._renderGPU(t)

    this._raf = requestAnimationFrame(t => this._tick(t))
  }

  // ── Board canvas drawing ───────────────────────────────────────────────────

  private _drawBoardCanvas(now: number) {
    const ctx = this._bctx
    const W   = this._canvasW
    const H   = this._canvasH

    ctx.clearRect(0, 0, W, H)

    // Background
    ctx.fillStyle = '#0a0a12'
    ctx.fillRect(0, 0, W, H)

    // Title area
    const titleY  = this._boardY - 52
    const titleFS = Math.round(this._ch * 0.70)
    ctx.font      = `900 ${titleFS}px 'Courier New', monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor  = '#ff9500'
    ctx.shadowBlur   = 16
    ctx.fillStyle    = '#ffcc66'
    ctx.fillText(TITLE_TEXT, W / 2, titleY)
    ctx.shadowBlur = 0

    // Sub-line
    ctx.fillStyle = 'rgba(255,180,60,0.22)'
    ctx.fillRect(this._boardX, titleY + titleFS * 0.72, this._boardW, 1)

    // Column separators
    for (const sep of COL_SEP) {
      const sx = this._boardX + sep * (this._cw + 3) - 2
      ctx.fillStyle = 'rgba(255,255,255,0.07)'
      ctx.fillRect(sx, this._boardY, 1, this._boardH)
    }

    // Cells
    this._advanceCells(now)
    for (const cell of this._cells) {
      let progress = 0, prev = cell.displayed, next = cell.displayed
      if (cell.queueIdx < cell.queue.length && cell.flipStart > 0) {
        const t = (now - cell.flipStart) / FLIP_MS
        if (t >= 0) {
          progress = Math.min(1, t)
          next     = cell.queue[cell.queueIdx] ?? cell.displayed
          prev     = cell.queueIdx === 0 ? cell.displayed : (cell.queue[cell.queueIdx - 1] ?? cell.displayed)
        }
      }
      const isFlipping = cell.queueIdx < cell.queue.length && progress > 0 && progress < 1
      const col = cell.isHeader  ? '#505870'
        : cell.isActive          ? (isFlipping ? '#ffe060' : '#ffd080')
        :                          (isFlipping ? '#fff0c0' : '#e8d8a0')
      drawCell(ctx, cell.x, cell.y, cell.cw, cell.ch, prev, next, progress, col)
    }

    // Active row indicator
    if (this._rowYs.length > ACTIVE_ROW + 1) {
      const ry  = this._rowYs[ACTIVE_ROW + 1]
      const grd = ctx.createLinearGradient(this._boardX - 16, 0, this._boardX, 0)
      grd.addColorStop(0, 'rgba(255,150,0,0.0)')
      grd.addColorStop(1, 'rgba(255,150,0,0.55)')
      ctx.fillStyle = grd
      ctx.fillRect(this._boardX - 16, ry, 16, this._ch)
      ctx.font      = `bold ${Math.round(this._ch * 0.55)}px monospace`
      ctx.fillStyle = '#ff9500'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('►', this._boardX - 9, ry + this._ch / 2)
    }
  }

  // ── Three.js scene ─────────────────────────────────────────────────────────

  private _buildRenderer() {
    this._renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true })
    this._renderer.setPixelRatio(devicePixelRatio)
    this._renderer.setSize(innerWidth, innerHeight)
    this._renderer.outputColorSpace = THREE.SRGBColorSpace
    this._renderer.domElement.style.cssText =
      'position:fixed;inset:0;width:100vw;height:100vh;z-index:99999;pointer-events:none'
    document.body.appendChild(this._renderer.domElement)
  }

  private _buildScene() {
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x050509)
    scene.fog = new THREE.FogExp2(0x050509, 0.055)

    // ── Board canvas texture ─────────────────────────────────────────────────
    this._boardTex = new THREE.CanvasTexture(this._board)
    this._boardTex.minFilter = THREE.LinearFilter
    this._boardTex.magFilter = THREE.LinearFilter
    this._boardTex.colorSpace = THREE.SRGBColorSpace

    // ── World dimensions: board fills ~85% of view width ─────────────────────
    const aspect    = innerWidth / innerHeight
    const camZ      = 5.5
    const fov       = 46
    const halfH     = camZ * Math.tan((fov / 2) * Math.PI / 180)
    const halfW     = halfH * aspect
    const boardWorldW = halfW * 2 * 0.87
    const boardWorldH = boardWorldW * (this._canvasH / this._canvasW)

    // ── Board face ───────────────────────────────────────────────────────────
    this._boardGroup = new THREE.Group()

    const faceGeo = new THREE.PlaneGeometry(boardWorldW, boardWorldH)
    const faceMat = new THREE.MeshBasicMaterial({ map: this._boardTex })
    const face    = new THREE.Mesh(faceGeo, faceMat)
    this._boardGroup.add(face)

    // ── Physical frame around the board ─────────────────────────────────────
    const bezelW = boardWorldW + 0.28
    const bezelH = boardWorldH + 0.18
    const bezelGeo = new THREE.BoxGeometry(bezelW, bezelH, 0.10)
    const bezelMat = new THREE.MeshStandardMaterial({
      color: 0x181828, roughness: 0.85, metalness: 0.05,
    })
    const bezel = new THREE.Mesh(bezelGeo, bezelMat)
    bezel.position.z = -0.052
    this._boardGroup.add(bezel)

    // Mounting bracket top (thin strip)
    const bracketGeo = new THREE.BoxGeometry(bezelW * 0.92, 0.08, 0.14)
    const bracketMat = new THREE.MeshStandardMaterial({ color: 0x222234, roughness: 0.9, metalness: 0.3 })
    const bracket    = new THREE.Mesh(bracketGeo, bracketMat)
    bracket.position.set(0, bezelH / 2 + 0.04, -0.07)
    this._boardGroup.add(bracket)

    // Slight tilt for perspective depth
    this._boardGroup.rotation.x = -0.06
    scene.add(this._boardGroup)

    // ── Overhead fluorescent tube ─────────────────────────────────────────────
    const tubeGeo = new THREE.BoxGeometry(boardWorldW * 0.7, 0.06, 0.10)
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0xfff4e0, emissive: 0xfff4e0, emissiveIntensity: 1.2,
    })
    const tube = new THREE.Mesh(tubeGeo, tubeMat)
    tube.position.set(0, boardWorldH / 2 + 0.55, 0.1)
    scene.add(tube)

    // ── Lighting ─────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x202040, 0.6))

    // Warm key light from above-front
    const spot = new THREE.SpotLight(0xffeedd, 3.5, 18, Math.PI / 5, 0.45, 1.2)
    spot.position.set(0.4, boardWorldH / 2 + 2.5, 4.0)
    spot.target.position.set(0, 0, 0)
    scene.add(spot, spot.target)

    // Cool fill from below-left (screen reflection)
    const fill = new THREE.PointLight(0x304060, 0.8, 8)
    fill.position.set(-2, -boardWorldH / 2, 3)
    scene.add(fill)

    // ── Background wall ───────────────────────────────────────────────────────
    const wallGeo = new THREE.PlaneGeometry(30, 14)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x0c0c18, roughness: 1 })
    const wall    = new THREE.Mesh(wallGeo, wallMat)
    wall.position.z = -1.2
    scene.add(wall)

    // ── Floor ─────────────────────────────────────────────────────────────────
    const floorGeo = new THREE.PlaneGeometry(30, 20)
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x080810, roughness: 0.9, metalness: 0.1 })
    const floor    = new THREE.Mesh(floorGeo, floorMat)
    floor.rotation.x  = -Math.PI / 2
    floor.position.set(0, -boardWorldH / 2 - 1.2, -2)
    scene.add(floor)

    // ── Camera ────────────────────────────────────────────────────────────────
    this._camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 80)
    this._camera.position.set(0, -0.18, camZ)
    this._camera.lookAt(0, 0, 0)

    this._scene = scene
  }

  // ── Cell advancement ───────────────────────────────────────────────────────

  private _advanceCells(now: number) {
    for (const cell of this._cells) {
      if (cell.queueIdx >= cell.queue.length) continue
      if (cell.flipStart <= 0) continue
      const t = (now - cell.flipStart) / FLIP_MS
      if (t >= 1) {
        cell.displayed = cell.queue[cell.queueIdx]
        cell.queueIdx++
        if (cell.queueIdx < cell.queue.length) cell.flipStart = now
      }
    }
  }

  // ── Layout ─────────────────────────────────────────────────────────────────

  private _layout() {
    // Cell size: aim for ~36px wide, proportional height
    this._cw = 36
    this._ch = Math.round(this._cw * 1.52)
    const gapX = 3, gapY = 4

    this._boardW = ROW_LEN * this._cw + (ROW_LEN - 1) * gapX
    this._boardH = (DATA_ROWS.length + 1) * (this._ch + gapY) - gapY

    // Canvas: board + padding (left/right, top for title, bottom margin)
    const padX   = 24
    const padTop = this._ch * 2 + 16   // room for title
    const padBot = 16
    this._canvasW = this._boardW + padX * 2
    this._canvasH = this._boardH + padTop + padBot

    this._boardX = padX
    this._boardY = padTop
  }

  private _buildCells() {
    this._cells = []; this._rowYs = []
    const gapX = 3, gapY = 4

    const makeRow = (text: string, rowIdx: number, isHeader: boolean, isActive: boolean) => {
      const y = this._boardY + rowIdx * (this._ch + gapY)
      this._rowYs.push(y)
      for (let col = 0; col < ROW_LEN; col++) {
        this._cells.push({
          row: rowIdx, col,
          x: this._boardX + col * (this._cw + gapX), y,
          cw: this._cw, ch: this._ch,
          displayed: ' ', queue: [], queueIdx: 0,
          flipProgress: 0, flipStart: -1,
          isHeader, isActive,
        })
      }
    }

    makeRow(HEADER_ROW, 0, true, false)
    DATA_ROWS.forEach((r, i) => makeRow(r.text, i + 1, false, i === ACTIVE_ROW))
  }

  private _scheduleRows() {
    this._setRowTarget(0, HEADER_ROW, 80, 30)
    DATA_ROWS.forEach((r, i) => this._setRowTarget(i + 1, r.text, r.delay, 42))
  }

  private _setRowTarget(rowIndex: number, text: string, startMs: number, charStagger: number) {
    const row = this._cells.filter(c => c.row === rowIndex)
    for (let col = 0; col < row.length; col++) {
      const cell   = row[col]
      const target = text[col] ?? ' '
      if (target === cell.displayed) continue
      cell.queue    = [...Array.from({ length: EXTRA_FLIPS }, rndChar), target]
      cell.queueIdx = 0
      cell.flipStart = this._t0 + startMs + col * charStagger
    }
  }

  // ── EN ROUTE trigger ───────────────────────────────────────────────────────

  private _flipActiveStatus(): Promise<void> {
    // STATUS column: TIME(5)+SP(1)+DEST(13)+SP(1)+PLAT(2)+SP(1) = index 23
    const STATUS_COL = 23
    const row = this._cells.filter(c => c.row === ACTIVE_ROW + 1)
    return new Promise(resolve => {
      const now = performance.now()
      for (let i = STATUS_COL; i < ROW_LEN; i++) {
        const cell = row[i]
        cell.queue    = [...Array.from({ length: 5 }, rndChar), ACTIVE_FINAL[i] ?? ' ']
        cell.queueIdx = 0
        cell.flipStart = now + (i - STATUS_COL) * 55
      }
      const totalMs = (ROW_LEN - 1 - STATUS_COL) * 55 + 6 * FLIP_MS + 100
      setTimeout(resolve, totalMs)
    })
  }

  // ── Reveal cascade ─────────────────────────────────────────────────────────

  private _revealCascade(): Promise<void> {
    return new Promise(resolve => {
      const now = performance.now()
      for (const cell of this._cells) {
        const stagger = (cell.row * ROW_LEN + cell.col) * 8 + Math.random() * 60
        cell.queue    = [...Array.from({ length: 4 }, rndChar), ' ']
        cell.queueIdx = 0
        cell.flipStart = now + stagger
      }

      const totalCascade = DATA_ROWS.length * ROW_LEN * 8 + 4 * FLIP_MS + 200
      setTimeout(() => {
        // 3D board tilts and slides away
        this._animateBoardExit().then(() => {
          this._revealDone = true
          this._gpuCanvas?.remove()
          this._renderer.domElement.remove()
          this._renderer.dispose()
          resolve()
        })
      }, totalCascade)
    })
  }

  /** Board panel tilts up and fades while Three.js canvas fades out. */
  private _animateBoardExit(): Promise<void> {
    return new Promise(resolve => {
      const ANIM_MS = 480
      const start   = performance.now()
      const target  = this._gpuCanvas ?? this._renderer.domElement
      const initRotX = this._boardGroup.rotation.x

      const animate = (now: number) => {
        const p   = Math.min((now - start) / ANIM_MS, 1)
        const ep  = 1 - Math.pow(1 - p, 3)   // ease-out cubic

        // Board tilts upward and recedes
        this._boardGroup.rotation.x = initRotX - ep * 0.35
        this._boardGroup.position.y = ep * 0.6
        this._boardGroup.position.z = -ep * 1.2

        // Render to keep the GPU canvas updated
        this._renderer.render(this._scene, this._camera)
        if (this._gpu && this._gpuPipeline) this._renderGPU(now * 0.001)

        target.style.opacity = String(1 - ep)

        if (p < 1) requestAnimationFrame(animate)
        else resolve()
      }
      requestAnimationFrame(animate)
    })
  }

  // ── WebGPU ─────────────────────────────────────────────────────────────────

  private async _initGPU(): Promise<void> {
    try {
      if (!navigator.gpu) return
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
      if (!adapter) return
      const device = await adapter.requestDevice()

      const gpuCanvas = document.createElement('canvas')
      gpuCanvas.width  = this._renderer.domElement.width
      gpuCanvas.height = this._renderer.domElement.height
      gpuCanvas.style.cssText =
        'position:fixed;inset:0;width:100vw;height:100vh;z-index:100000;pointer-events:none'
      document.body.appendChild(gpuCanvas)

      // Hide the raw Three.js canvas — GPU canvas is on top
      this._renderer.domElement.style.visibility = 'hidden'

      const fmt = navigator.gpu.getPreferredCanvasFormat()
      const ctx  = gpuCanvas.getContext('webgpu') as GPUCanvasContext
      ctx.configure({ device, format: fmt, alphaMode: 'opaque' })

      const W = gpuCanvas.width, H = gpuCanvas.height
      const tex = device.createTexture({
        size: [W, H], format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      })
      const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' })
      const uni     = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })

      const mod = device.createShaderModule({ code: WGSL_CRT })
      const bgl = device.createBindGroupLayout({ entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ]})
      const bg = device.createBindGroup({ layout: bgl, entries: [
        { binding: 0, resource: { buffer: uni } },
        { binding: 1, resource: tex.createView() },
        { binding: 2, resource: sampler },
      ]})
      const pl = device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [bgl] }),
        vertex:   { module: mod, entryPoint: 'vs' },
        fragment: { module: mod, entryPoint: 'fs', targets: [{ format: fmt }] },
        primitive: { topology: 'triangle-list' },
      })

      this._gpu         = device
      this._gpuCanvas   = gpuCanvas
      this._gpuCtx      = ctx
      this._gpuPipeline = pl
      this._gpuBG       = bg
      this._gpuUni      = uni
      this._gpuTex      = tex
    } catch { /* silent fallback */ }
  }

  private _renderGPU(timeSec: number) {
    const device = this._gpu!
    // Read Three.js WebGL output
    device.queue.copyExternalImageToTexture(
      { source: this._renderer.domElement, flipY: false },
      { texture: this._gpuTex! },
      [this._renderer.domElement.width, this._renderer.domElement.height],
    )
    device.queue.writeBuffer(this._gpuUni!, 0, new Float32Array([timeSec, 0, 0, 0]))

    const encoder = device.createCommandEncoder()
    const pass    = encoder.beginRenderPass({
      colorAttachments: [{
        view:       this._gpuCtx!.getCurrentTexture().createView(),
        loadOp:    'clear',
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        storeOp:   'store',
      }],
    })
    pass.setPipeline(this._gpuPipeline!)
    pass.setBindGroup(0, this._gpuBG!)
    pass.draw(3)
    pass.end()
    device.queue.submit([encoder.finish()])
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private _sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }
}
