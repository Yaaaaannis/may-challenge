/**
 * SpeedGauge — vintage locomotive HUD  (landscape layout)
 * ┌──────────┬─────────────────────────┬──────────────────┐
 * │  Levier  │     Tachymètre          │  Barre + Frein   │
 * └──────────┴─────────────────────────┴──────────────────┘
 */

// ── Canvas dimensions (landscape) ────────────────────────────────────────
const W = 500
const H = 185

// ── Left column — throttle lever ─────────────────────────────────────────
const LV_CX   = 36       // horizontal centre of lever track
const LV_TOP  = 28       // Y at max speed (top of track)
const LV_BOT  = 156      // Y at min speed (bottom of track)
const LV_TW   = 10       // track width
const LV_HW   = 40       // handle width
const LV_HH   = 20       // handle height

// ── Section dividers ──────────────────────────────────────────────────────
const DIV1    = 75        // lever / gauge boundary
const DIV2    = 350       // gauge / controls boundary

// ── Centre column — gauge ─────────────────────────────────────────────────
const CX      = 212
const CY      = 90
const R_RING  = 68        // brass ring outer radius
const R_ARC   = 60        // arc/needle radius
const R_TOUT  = 59        // tick outer edge
const R_TMAJ  = 48        // major tick inner edge
const R_TMIN  = 53        // minor tick inner edge
const R_LBL   = 40        // label radius

// Arc: 270° clockwise from 135° (7-o'clock) through top to 45° (5-o'clock)
const A0    = 3 * Math.PI / 4
const SWEEP = 3 * Math.PI / 2

// ── Right column — bar + brake ────────────────────────────────────────────
const BAR_X   = DIV2 + 12
const BAR_Y   = 30
const BAR_W   = W - BAR_X - 10         // ≈ 128 px
const BAR_H   = 13
const BTN_X   = DIV2 + 8
const BTN_Y   = 66
const BTN_W   = W - BTN_X - 8          // ≈ 134 px
const BTN_H   = H - BTN_Y - 10         // ≈ 109 px

// Right-column centre X (for centred text)
const RCX     = (DIV2 + W) / 2         // ≈ 425

// ── Speed range (keep in sync with World.ts) ──────────────────────────────
const SPEED_MIN = 0.05
const SPEED_MAX = 3.0

// ── Palette ───────────────────────────────────────────────────────────────
const C = {
  panelBg:   '#120d06',
  brassL:    '#d4aa50',
  brassM:    '#a07828',
  brassD:    '#7a5018',
  brassVD:   '#3e2808',
  faceBg:    '#f0e8cc',
  tickDark:  '#1e1400',
  zoneGreen: '#1a7a36',
  zoneYellow:'#c48c0a',
  zoneRed:   '#b01818',
  needle:    '#cc1818',
  needleBk:  '#2a1a06',
  capOuter:  '#c8a030',
  capInner:  '#f0d878',
  speedNum:  '#1a1000',
  label:     '#3a2800',
  barBg:     '#1e1008',
  barBorder: '#c8a030',
  btnText:   '#f0e0c0',
  rivet:     '#a08028',
  rivetHi:   '#e0c060',
}

// ── Helpers ───────────────────────────────────────────────────────────────

function toAngle(f: number): number {
  return A0 + f * SWEEP
}

function speedToY(speed: number): number {
  const f = (speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)
  return LV_BOT - f * (LV_BOT - LV_TOP)   // top = fast
}

function yToSpeed(y: number): number {
  const f = (LV_BOT - Math.max(LV_TOP, Math.min(LV_BOT, y))) / (LV_BOT - LV_TOP)
  return SPEED_MIN + f * (SPEED_MAX - SPEED_MIN)
}

// ── Class ─────────────────────────────────────────────────────────────────

export class SpeedGauge {
  private readonly _canvas: HTMLCanvasElement
  private readonly _ctx:    CanvasRenderingContext2D
  private _dpr = 1

  private _braking     = false
  private _leverSpeed  = 0.8
  private _dragging    = false
  private _dragOffsetY = 0

  onSpeedChange: ((speed: number) => void) | null = null

  get braking(): boolean { return this._braking }

  constructor() {
    this._canvas = document.createElement('canvas')
    this._dpr    = Math.min(window.devicePixelRatio ?? 1, 2)
    this._canvas.width  = W * this._dpr
    this._canvas.height = H * this._dpr

    Object.assign(this._canvas.style, {
      position:         'fixed',
      bottom:           '14px',
      left:             '50%',
      transform:        'translateX(-50%)',
      width:            W + 'px',
      height:           H + 'px',
      zIndex:           '200',
      userSelect:       'none',
      WebkitUserSelect: 'none',
      pointerEvents:    'auto',
      cursor:           'default',
    })

    this._ctx = this._canvas.getContext('2d')!
    this._ctx.scale(this._dpr, this._dpr)

    this._canvas.addEventListener('mousedown',  this._onMouseDown)
    this._canvas.addEventListener('touchstart', this._onTouchStart, { passive: false })
    document.addEventListener('mousemove',      this._onDocMove)
    document.addEventListener('mouseup',        this._onDocUp)
    document.addEventListener('touchmove',      this._onDocTouchMove, { passive: false })
    document.addEventListener('touchend',       this._onDocTouchEnd)

    document.body.appendChild(this._canvas)
    this.update(0, 0, 1)
  }

  // ── Public API ────────────────────────────────────────────────────────────

  setLeverSpeed(speed: number) {
    this._leverSpeed = Math.max(SPEED_MIN, Math.min(SPEED_MAX, speed))
  }

  update(actualSpeed: number, derailRisk: number, safeSpeedFrac: number) {
    const ctx   = this._ctx
    const sFrac = Math.min(actualSpeed / SPEED_MAX, 1)
    const risk  = Math.min(derailRisk, 1.5)

    ctx.save()
    ctx.clearRect(0, 0, W, H)
    this._drawPanel(ctx)
    this._drawTitle(ctx)
    this._drawDivider(ctx, DIV1)
    this._drawDivider(ctx, DIV2)
    this._drawLever(ctx)
    this._drawGaugeFace(ctx)
    this._drawBrassRing(ctx)
    this._drawRivets(ctx)
    this._drawArcZones(ctx, safeSpeedFrac)
    this._drawTicks(ctx)
    this._drawNeedle(ctx, sFrac)
    this._drawCenterCap(ctx)
    this._drawSpeedValue(ctx, actualSpeed)
    this._drawDerailBar(ctx, risk)
    this._drawBrakeButton(ctx)
    ctx.restore()
  }

  dispose() {
    this._canvas.removeEventListener('mousedown',  this._onMouseDown)
    this._canvas.removeEventListener('touchstart', this._onTouchStart)
    document.removeEventListener('mousemove',      this._onDocMove)
    document.removeEventListener('mouseup',        this._onDocUp)
    document.removeEventListener('touchmove',      this._onDocTouchMove)
    document.removeEventListener('touchend',       this._onDocTouchEnd)
    this._canvas.remove()
  }

  // ── Interaction ───────────────────────────────────────────────────────────

  private _toCanvas(clientX: number, clientY: number): [number, number] {
    const r = this._canvas.getBoundingClientRect()
    return [(clientX - r.left) * (W / r.width), (clientY - r.top) * (H / r.height)]
  }

  private _onMouseDown  = (e: MouseEvent)  => this._handleDown(...this._toCanvas(e.clientX, e.clientY))
  private _onTouchStart = (e: TouchEvent)  => { e.preventDefault(); this._handleDown(...this._toCanvas(e.touches[0].clientX, e.touches[0].clientY)) }
  private _onDocMove    = (e: MouseEvent)  => { if (this._dragging) this._moveLever(this._toCanvas(e.clientX, e.clientY)[1]) }
  private _onDocTouchMove = (e: TouchEvent) => { if (this._dragging) { e.preventDefault(); this._moveLever(this._toCanvas(e.touches[0].clientX, e.touches[0].clientY)[1]) } }
  private _onDocUp      = () => { this._dragging = false; this._braking = false; this._canvas.style.cursor = 'default' }
  private _onDocTouchEnd = () => { this._dragging = false; this._braking = false }

  private _handleDown(cx: number, cy: number) {
    // Lever handle
    const hy = speedToY(this._leverSpeed)
    if (cx >= LV_CX - LV_HW / 2 && cx <= LV_CX + LV_HW / 2 &&
        cy >= hy - LV_HH / 2     && cy <= hy + LV_HH / 2) {
      this._dragging = true; this._dragOffsetY = cy - hy
      this._canvas.style.cursor = 'grabbing'; return
    }
    // Click anywhere on track → snap
    if (cx >= LV_CX - LV_HW / 2 && cx <= LV_CX + LV_HW / 2 &&
        cy >= LV_TOP && cy <= LV_BOT) {
      this._dragging = true; this._dragOffsetY = 0; this._moveLever(cy); return
    }
    // Brake button
    if (cx >= BTN_X && cx <= BTN_X + BTN_W && cy >= BTN_Y && cy <= BTN_Y + BTN_H)
      this._braking = true
  }

  private _moveLever(canvasY: number) {
    const speed = yToSpeed(canvasY - this._dragOffsetY)
    this._leverSpeed = Math.round(speed * 100) / 100
    this.onSpeedChange?.(this._leverSpeed)
  }

  // ── Drawing ───────────────────────────────────────────────────────────────

  private _drawPanel(ctx: CanvasRenderingContext2D) {
    const r = 10
    ctx.beginPath(); ctx.roundRect(0, 0, W, H, r)
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, '#1e1508'); g.addColorStop(0.5, C.panelBg); g.addColorStop(1, '#0a0804')
    ctx.fillStyle = g; ctx.fill()
    ctx.beginPath(); ctx.roundRect(1, 1, W - 2, H - 2, r - 1)
    ctx.strokeStyle = C.brassD; ctx.lineWidth = 2; ctx.stroke()
    ctx.beginPath(); ctx.roundRect(3, 3, W - 6, H - 6, r - 2)
    ctx.strokeStyle = C.brassVD; ctx.lineWidth = 1; ctx.stroke()
  }

  private _drawTitle(ctx: CanvasRenderingContext2D) {
    ctx.font = 'bold 8px monospace'; ctx.letterSpacing = '3px'
    ctx.fillStyle = C.brassL; ctx.textAlign = 'center'
    ctx.fillText('LOCOMOTIVE', W / 2, 14)
    ctx.letterSpacing = '0px'
  }

  private _drawDivider(ctx: CanvasRenderingContext2D, x: number) {
    ctx.beginPath(); ctx.moveTo(x, 20); ctx.lineTo(x, H - 20)
    const g = ctx.createLinearGradient(0, 20, 0, H - 20)
    g.addColorStop(0, 'transparent'); g.addColorStop(0.2, C.brassD)
    g.addColorStop(0.8, C.brassD); g.addColorStop(1, 'transparent')
    ctx.strokeStyle = g; ctx.lineWidth = 1.5; ctx.stroke()
  }

  // ── Lever ─────────────────────────────────────────────────────────────────

  private _drawLever(ctx: CanvasRenderingContext2D) {
    const hy  = speedToY(this._leverSpeed)
    const tx  = LV_CX - LV_TW / 2

    // Column label (rotated)
    ctx.save()
    ctx.translate(LV_CX, (LV_TOP + LV_BOT) / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.font = 'bold 7px monospace'; ctx.letterSpacing = '2px'
    ctx.fillStyle = C.brassM; ctx.textAlign = 'center'
    ctx.fillText('RÉGULATEUR', 0, -(LV_CX - 4))
    ctx.letterSpacing = '0px'
    ctx.restore()

    // Track ridge (brass surround)
    ctx.beginPath(); ctx.roundRect(tx - 1, LV_TOP - 2, LV_TW + 2, LV_BOT - LV_TOP + 4, 5)
    const tg = ctx.createLinearGradient(tx - 1, 0, tx + LV_TW + 1, 0)
    tg.addColorStop(0, C.brassVD); tg.addColorStop(0.3, C.brassM)
    tg.addColorStop(0.7, C.brassM); tg.addColorStop(1, C.brassVD)
    ctx.fillStyle = tg; ctx.fill()

    // Inner groove
    ctx.beginPath(); ctx.roundRect(tx + 2, LV_TOP, LV_TW - 4, LV_BOT - LV_TOP, 3)
    ctx.fillStyle = '#080502'; ctx.fill()

    // Notch marks (7 marks → labels 0, 5, 10, 15, 20, 25, 30)
    for (let i = 0; i <= 6; i++) {
      const f   = i / 6
      const s   = SPEED_MIN + f * (SPEED_MAX - SPEED_MIN)
      const ny  = speedToY(s)
      const maj = i % 2 === 0
      ctx.beginPath()
      ctx.moveTo(tx - (maj ? 7 : 4), ny); ctx.lineTo(tx, ny)
      ctx.strokeStyle = maj ? C.brassL : C.brassD
      ctx.lineWidth   = maj ? 1.5 : 1; ctx.stroke()
      if (maj) {
        ctx.font = '7px monospace'; ctx.fillStyle = C.brassL; ctx.textAlign = 'right'
        ctx.fillText(String(Math.round(f * 30)), tx - 9, ny + 2.5)
      }
    }

    // MIN / MAX labels
    ctx.font = 'bold 7px monospace'; ctx.textAlign = 'left'
    ctx.fillStyle = '#cc5544'; ctx.fillText('MAX', tx + LV_TW + 3, LV_TOP + 4)
    ctx.fillStyle = '#558855'; ctx.fillText('MIN', tx + LV_TW + 3, LV_BOT + 1)

    // Handle shadow
    const hx = LV_CX - LV_HW / 2
    ctx.beginPath(); ctx.roundRect(hx + 2, hy - LV_HH / 2 + 3, LV_HW, LV_HH, 5)
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill()

    // Handle body
    ctx.beginPath(); ctx.roundRect(hx, hy - LV_HH / 2, LV_HW, LV_HH, 5)
    const hg = ctx.createLinearGradient(hx, hy - LV_HH / 2, hx, hy + LV_HH / 2)
    hg.addColorStop(0, '#e8cc68'); hg.addColorStop(0.3, C.brassL)
    hg.addColorStop(0.65, C.brassD); hg.addColorStop(1, C.brassVD)
    ctx.fillStyle = hg; ctx.fill()
    ctx.strokeStyle = '#f0dc80'; ctx.lineWidth = 1; ctx.stroke()

    // Grip lines
    for (let g = 0; g < 3; g++) {
      const gy = hy - LV_HH / 2 + 4 + g * (LV_HH - 8) / 2
      ctx.beginPath(); ctx.moveTo(hx + 5, gy); ctx.lineTo(hx + LV_HW - 5, gy)
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5; ctx.stroke()
      ctx.beginPath(); ctx.moveTo(hx + 5, gy + 0.8); ctx.lineTo(hx + LV_HW - 5, gy + 0.8)
      ctx.strokeStyle = 'rgba(255,240,140,0.28)'; ctx.lineWidth = 0.8; ctx.stroke()
    }

    // Speed badge (right of handle, tracks with it)
    const bx = hx + LV_HW + 3
    const by = hy - 9
    ctx.beginPath(); ctx.roundRect(bx, by, 28, 18, 3)
    ctx.fillStyle = C.panelBg; ctx.fill()
    ctx.strokeStyle = C.brassD; ctx.lineWidth = 1; ctx.stroke()
    ctx.font = 'bold 10px monospace'; ctx.fillStyle = C.brassL; ctx.textAlign = 'center'
    ctx.fillText(String(Math.round(this._leverSpeed * 10)), bx + 14, by + 12.5)
  }

  // ── Gauge ─────────────────────────────────────────────────────────────────

  private _drawGaugeFace(ctx: CanvasRenderingContext2D) {
    ctx.beginPath(); ctx.arc(CX, CY, R_RING - 1, 0, 2 * Math.PI)
    const g = ctx.createRadialGradient(CX - 10, CY - 10, 4, CX, CY, R_RING)
    g.addColorStop(0, '#fffff0'); g.addColorStop(0.6, C.faceBg); g.addColorStop(1, '#c8b888')
    ctx.fillStyle = g; ctx.fill()
  }

  private _drawBrassRing(ctx: CanvasRenderingContext2D) {
    ctx.beginPath()
    ctx.arc(CX, CY, R_RING + 4, 0, 2 * Math.PI)
    ctx.arc(CX, CY, R_RING - 2, 0, 2 * Math.PI, true)
    const g = ctx.createLinearGradient(CX - R_RING, CY - R_RING, CX + R_RING, CY + R_RING)
    g.addColorStop(0, C.brassL); g.addColorStop(0.35, '#f0d070')
    g.addColorStop(0.6, C.brassD); g.addColorStop(1, C.brassVD)
    ctx.fillStyle = g; ctx.fill()
  }

  private _drawRivets(ctx: CanvasRenderingContext2D) {
    const rr = R_RING + 1.5
    for (const ang of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
      const rx = CX + rr * Math.cos(ang), ry = CY + rr * Math.sin(ang)
      ctx.beginPath(); ctx.arc(rx, ry, 4, 0, 2 * Math.PI); ctx.fillStyle = C.brassVD; ctx.fill()
      ctx.beginPath(); ctx.arc(rx, ry, 3, 0, 2 * Math.PI)
      const rg = ctx.createRadialGradient(rx - 1, ry - 1, 0.5, rx, ry, 3)
      rg.addColorStop(0, C.rivetHi); rg.addColorStop(1, C.rivet)
      ctx.fillStyle = rg; ctx.fill()
    }
  }

  private _drawArcZones(ctx: CanvasRenderingContext2D, safeSpeedFrac: number) {
    const AW = 9
    const arc = (f0: number, f1: number, col: string) => {
      if (f1 <= f0) return
      ctx.beginPath(); ctx.arc(CX, CY, R_ARC + AW / 2, toAngle(f0), toAngle(f1))
      ctx.strokeStyle = col; ctx.lineWidth = AW; ctx.lineCap = 'butt'; ctx.stroke()
    }
    const ye = Math.min(safeSpeedFrac + 0.08, 1)
    arc(0, 1, '#8a8a8a')
    if (safeSpeedFrac > 0)    arc(0, safeSpeedFrac, C.zoneGreen)
    if (ye > safeSpeedFrac)   arc(safeSpeedFrac, ye, C.zoneYellow)
    if (ye < 1)               arc(ye, 1, C.zoneRed)
    // Safe-speed notch
    if (safeSpeedFrac > 0.02 && safeSpeedFrac < 0.98) {
      const a = toAngle(safeSpeedFrac)
      ctx.beginPath()
      ctx.moveTo(CX + (R_ARC - 3) * Math.cos(a), CY + (R_ARC - 3) * Math.sin(a))
      ctx.lineTo(CX + (R_ARC + AW + 3) * Math.cos(a), CY + (R_ARC + AW + 3) * Math.sin(a))
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.stroke()
    }
  }

  private _drawTicks(ctx: CanvasRenderingContext2D) {
    for (let i = 0; i <= 30; i++) {
      const f = i / 30, ang = toAngle(f), maj = i % 5 === 0
      const cos = Math.cos(ang), sin = Math.sin(ang)
      ctx.beginPath()
      ctx.moveTo(CX + (maj ? R_TMAJ : R_TMIN) * cos, CY + (maj ? R_TMAJ : R_TMIN) * sin)
      ctx.lineTo(CX + R_TOUT * cos, CY + R_TOUT * sin)
      ctx.strokeStyle = C.tickDark; ctx.lineWidth = maj ? 2 : 1; ctx.lineCap = 'round'; ctx.stroke()
      if (maj && i % 10 === 0) {
        ctx.save()
        ctx.translate(CX + R_LBL * cos, CY + R_LBL * sin)
        ctx.rotate(ang + Math.PI / 2)
        ctx.font = 'bold 8px monospace'; ctx.fillStyle = C.tickDark
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(String(i), 0, 0)
        ctx.restore()
      }
    }
  }

  private _drawNeedle(ctx: CanvasRenderingContext2D, speedFrac: number) {
    const ang = toAngle(speedFrac)
    const cos = Math.cos(ang), sin = Math.sin(ang)
    const pc  = Math.cos(ang + Math.PI / 2), ps = Math.sin(ang + Math.PI / 2)
    const TIP = R_ARC - 4, BASE = 15
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4
    ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2
    ctx.beginPath()
    ctx.moveTo(CX + TIP * cos,                       CY + TIP * sin)
    ctx.lineTo(CX + 1.5 * pc,                        CY + 1.5 * ps)
    ctx.lineTo(CX - BASE * cos + 5 * pc,             CY - BASE * sin + 5 * ps)
    ctx.lineTo(CX - BASE * cos - 5 * pc,             CY - BASE * sin - 5 * ps)
    ctx.lineTo(CX - 1.5 * pc,                        CY - 1.5 * ps)
    ctx.closePath()
    const ng = ctx.createLinearGradient(CX - BASE * cos, CY - BASE * sin, CX + TIP * cos, CY + TIP * sin)
    ng.addColorStop(0, C.needleBk); ng.addColorStop(0.3, C.needle); ng.addColorStop(1, '#ff6666')
    ctx.fillStyle = ng; ctx.fill()
    ctx.restore()
  }

  private _drawCenterCap(ctx: CanvasRenderingContext2D) {
    ctx.beginPath(); ctx.arc(CX, CY, 8, 0, 2 * Math.PI); ctx.fillStyle = C.capOuter; ctx.fill()
    ctx.beginPath(); ctx.arc(CX, CY, 5, 0, 2 * Math.PI)
    const g = ctx.createRadialGradient(CX - 2, CY - 2, 1, CX, CY, 5)
    g.addColorStop(0, C.capInner); g.addColorStop(1, C.capOuter)
    ctx.fillStyle = g; ctx.fill()
  }

  private _drawSpeedValue(ctx: CanvasRenderingContext2D, speed: number) {
    ctx.font = '7px monospace'; ctx.fillStyle = C.label; ctx.textAlign = 'center'
    ctx.fillText('× 10 KM/H', CX, CY + 22)
    ctx.font = 'bold 20px monospace'; ctx.fillStyle = C.speedNum
    ctx.fillText(String(Math.round(speed * 10)).padStart(2, ' '), CX, CY + 40)
  }

  // ── Derailment bar ────────────────────────────────────────────────────────

  private _drawDerailBar(ctx: CanvasRenderingContext2D, risk: number) {
    ctx.font = 'bold 7px monospace'; ctx.letterSpacing = '0.5px'
    ctx.fillStyle = '#a06020'; ctx.textAlign = 'center'
    ctx.fillText('DÉRAILLEMENT', RCX, BAR_Y - 6)
    ctx.letterSpacing = '0px'

    ctx.beginPath(); ctx.roundRect(BAR_X, BAR_Y, BAR_W, BAR_H, 3)
    ctx.fillStyle = C.barBg; ctx.fill()
    ctx.strokeStyle = C.barBorder; ctx.lineWidth = 1; ctx.stroke()

    const fw = risk / 1.5 * BAR_W
    if (fw > 0) {
      const bg = ctx.createLinearGradient(BAR_X, 0, BAR_X + BAR_W, 0)
      bg.addColorStop(0, '#1a7a36'); bg.addColorStop(0.55, '#c48c0a')
      bg.addColorStop(0.85, '#b01818'); bg.addColorStop(1, '#ff1010')
      ctx.save()
      ctx.beginPath(); ctx.roundRect(BAR_X, BAR_Y, BAR_W, BAR_H, 3); ctx.clip()
      ctx.fillStyle = bg; ctx.fillRect(BAR_X, BAR_Y, fw, BAR_H)
      ctx.restore()
    }

    // 100% threshold marker
    const mx = BAR_X + BAR_W * (1.0 / 1.5)
    ctx.beginPath(); ctx.moveTo(mx, BAR_Y - 3); ctx.lineTo(mx, BAR_Y + BAR_H + 3)
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5
    ctx.setLineDash([2, 2]); ctx.stroke(); ctx.setLineDash([])

    const pct = Math.round(risk * 100)
    ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'
    ctx.fillStyle = risk > 0.85 ? '#ff4444' : risk > 0.55 ? '#ffaa00' : '#66cc66'
    ctx.fillText(`${pct}%`, RCX, BAR_Y + BAR_H + 11)
  }

  // ── Brake button ──────────────────────────────────────────────────────────

  private _drawBrakeButton(ctx: CanvasRenderingContext2D) {
    const p  = this._braking
    const by = p ? BTN_Y + 2 : BTN_Y

    ctx.beginPath(); ctx.roundRect(BTN_X + 2, BTN_Y + 3, BTN_W, BTN_H, 6)
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fill()

    ctx.beginPath(); ctx.roundRect(BTN_X, by, BTN_W, BTN_H, 6)
    const bg = ctx.createLinearGradient(BTN_X, by, BTN_X, by + BTN_H)
    bg.addColorStop(0, p ? '#dd2828' : '#9a1414')
    bg.addColorStop(1, p ? '#881010' : '#550808')
    ctx.fillStyle = bg; ctx.fill()
    ctx.strokeStyle = p ? '#e0a000' : C.brassL; ctx.lineWidth = p ? 2 : 1.5; ctx.stroke()

    if (!p) {
      ctx.beginPath(); ctx.roundRect(BTN_X + 4, BTN_Y + 3, BTN_W - 8, 5, 3)
      ctx.fillStyle = 'rgba(255,200,150,0.18)'; ctx.fill()
    }

    const ty = by + BTN_H / 2
    ctx.textAlign = 'center'
    ctx.font = '18px monospace'; ctx.fillStyle = C.btnText; ctx.fillText('🛑', RCX, ty - 6)
    ctx.font = 'bold 8px monospace'; ctx.letterSpacing = '1px'
    ctx.fillStyle = p ? '#ffddaa' : C.btnText
    ctx.fillText("FREIN D'URGENCE", RCX, ty + 10)
    ctx.letterSpacing = '0px'
    if (p) {
      ctx.font = '7px monospace'; ctx.fillStyle = '#ffaaaa'
      ctx.fillText('— ACTIF —', RCX, ty + 22)
    }
  }
}
