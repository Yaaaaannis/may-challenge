import * as THREE from 'three'
import { CurveFn, curvePoint } from '../track/curves.js'

// ── Minimap ────────────────────────────────────────────────────────────────────
// 2D canvas overlay (bottom-left) showing the track path, oriented vehicle
// rectangles, and signal dots.

const MAP_SIZE  = 160
const TRACK_PTS = 220
const MARGIN    = 12
const SIGNAL_R  = 3.5
// Rectangle half-dimensions in canvas-px
const LOCO_HW   = 9    // half-width (along travel dir)
const LOCO_HH   = 4    // half-height (perpendicular)
const WAGON_HW  = 7
const WAGON_HH  = 3.5

export interface VehicleInfo {
  pos:    THREE.Vector3
  forward: THREE.Vector3   // normalized world-space forward (XZ)
  isLoco: boolean
  color:  number           // hex colour
}

export class Minimap {
  private _canvas: HTMLCanvasElement
  private _ctx:    CanvasRenderingContext2D

  // Track projection params — set by buildTrack, used by project()
  private _minX  = 0
  private _minZ  = 0
  private _scale = 1
  private _offX  = 0
  private _offZ  = 0

  // Cached path in canvas-space
  private _path: Array<{ cx: number; cy: number }> = []

  constructor() {
    this._canvas = document.createElement('canvas')
    this._canvas.width  = MAP_SIZE
    this._canvas.height = MAP_SIZE
    this._canvas.style.cssText = `
      position: fixed;
      bottom: 16px;
      left: 16px;
      width:  ${MAP_SIZE}px;
      height: ${MAP_SIZE}px;
      border-radius: 12px;
      border: 1.5px solid rgba(255,255,255,0.18);
      background: rgba(10, 12, 18, 0.82);
      backdrop-filter: blur(6px);
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      z-index: 9000;
    `
    this._ctx = this._canvas.getContext('2d')!
    document.body.appendChild(this._canvas)
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  buildTrack(fn: CurveFn) {
    const pts: Array<{ x: number; z: number }> = []
    for (let i = 0; i <= TRACK_PTS; i++) {
      const p = curvePoint(fn, i / TRACK_PTS, 0)
      pts.push({ x: p.x, z: p.z })
    }

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const p of pts) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
      if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z
    }

    const rangeX = maxX - minX || 1
    const rangeZ = maxZ - minZ || 1
    this._scale  = (MAP_SIZE - MARGIN * 2) / Math.max(rangeX, rangeZ)
    this._minX   = minX
    this._minZ   = minZ
    this._offX   = MARGIN + (MAP_SIZE - MARGIN * 2 - rangeX * this._scale) / 2
    this._offZ   = MARGIN + (MAP_SIZE - MARGIN * 2 - rangeZ * this._scale) / 2

    this._path = pts.map(p => this._project(p.x, p.z))
  }

  update(
    vehicles: VehicleInfo[],
    signals:  Array<{ t: number; state: 'green' | 'red' }>,
  ) {
    const ctx = this._ctx
    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE)
    if (this._path.length < 2) return

    // ── Track ──────────────────────────────────────────────────────────────
    ctx.beginPath()
    ctx.moveTo(this._path[0].cx, this._path[0].cy)
    for (let i = 1; i < this._path.length; i++) ctx.lineTo(this._path[i].cx, this._path[i].cy)
    ctx.closePath()
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'
    ctx.lineWidth   = 1.5
    ctx.stroke()

    // ── Signals ────────────────────────────────────────────────────────────
    for (const sig of signals) {
      const idx = Math.round(((sig.t % 1 + 1) % 1) * TRACK_PTS)
      const { cx, cy } = this._path[Math.min(idx, this._path.length - 1)]
      const col = sig.state === 'green' ? '#00ff66' : '#ff3300'
      ctx.beginPath()
      ctx.arc(cx, cy, SIGNAL_R, 0, Math.PI * 2)
      ctx.fillStyle    = col
      ctx.shadowColor  = col
      ctx.shadowBlur   = 5
      ctx.fill()
      ctx.shadowBlur = 0
    }

    // ── Vehicles ───────────────────────────────────────────────────────────
    for (const v of vehicles) {
      const { cx, cy } = this._project(v.pos.x, v.pos.z)

      // Canvas-space forward direction (Z in world → Y on canvas)
      const fx =  v.forward.x   // world X → canvas X
      const fy =  v.forward.z   // world Z → canvas Y (no flip needed)
      const angle = Math.atan2(fy, fx)

      const hw = v.isLoco ? LOCO_HW : WAGON_HW
      const hh = v.isLoco ? LOCO_HH : WAGON_HH

      // Draw oriented rectangle via canvas transform
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(angle)

      const hexStr = '#' + v.color.toString(16).padStart(6, '0')
      ctx.fillStyle   = hexStr
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth   = 0.8
      ctx.shadowColor = hexStr
      ctx.shadowBlur  = v.isLoco ? 10 : 6

      ctx.beginPath()
      if (ctx.roundRect) {
        ctx.roundRect(-hw, -hh, hw * 2, hh * 2, 1.5)
      } else {
        ctx.rect(-hw, -hh, hw * 2, hh * 2)
      }
      ctx.fill()
      ctx.stroke()
      ctx.shadowBlur = 0

      // Small nose chevron on loco
      if (v.isLoco) {
        ctx.beginPath()
        ctx.moveTo(hw, 0)
        ctx.lineTo(hw - 4,  hh)
        ctx.lineTo(hw - 4, -hh)
        ctx.closePath()
        ctx.fillStyle = 'rgba(255,255,200,0.7)'
        ctx.fill()
      }

      ctx.restore()
    }
  }

  dispose() {
    this._canvas.remove()
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _project(wx: number, wz: number): { cx: number; cy: number } {
    return {
      cx: this._offX + (wx - this._minX) * this._scale,
      cy: this._offZ + (wz - this._minZ) * this._scale,
    }
  }
}
