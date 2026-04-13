/**
 * ScoreBoard — vintage scoreboard (top-left).
 * Passive stats only: passages count + next-station approach indicator.
 */

const W = 195

const C = {
  bg:       '#120d06',
  brassL:   '#d4aa50',
  brassD:   '#7a5018',
  brassVD:  '#3e2808',
  green:    '#44cc66',
  red:      '#ff4444',
  yellow:   '#ffcc44',
  blue:     '#44aaff',
  text:     '#f0e0c0',
  dim:      '#7a6040',
}

export class ScoreBoard {
  private readonly _el: HTMLElement
  private _stops      = 0
  private _stations: string[] = []
  private _lastMsg    = ''
  private _lastMsgColor = C.green
  private _msgTimer   = 0
  // Approach indicator
  private _approachName      = ''
  private _approachProximity = 0   // 0 = far, 1 = at station

  constructor() {
    this._el = document.createElement('div')
    Object.assign(this._el.style, {
      position:      'fixed',
      top:           '14px',
      left:          '14px',
      width:         W + 'px',
      zIndex:        '200',
      fontFamily:    'monospace',
      fontSize:      '11px',
      color:         C.text,
      background:    'linear-gradient(180deg,#1e1508 0%,#120d06 60%,#0a0804 100%)',
      border:        `1.5px solid ${C.brassD}`,
      borderRadius:  '8px',
      padding:       '10px',
      boxShadow:     `0 0 0 1px ${C.brassVD}`,
      userSelect:    'none',
      pointerEvents: 'none',
    })
    document.body.appendChild(this._el)
    this._render()
  }

  // ── Public API ──────────────────────────────────────────────────────────

  setStations(names: string[]) {
    this._stations = names
    this._render()
  }

  /** Called each time the train stops at a station. */
  arrival(name: string) {
    this._stops++
    this._flash(`✓ ${name}`, C.green)
    this._render()
  }

  /** Update the next-station approach bar. Call every tick. */
  setApproach(name: string, proximity: number) {
    const changed = name !== this._approachName || Math.abs(proximity - this._approachProximity) > 0.01
    this._approachName      = name
    this._approachProximity = proximity
    if (changed) this._render()
  }

  tick(dt: number) {
    if (this._msgTimer > 0) {
      this._msgTimer -= dt
      if (this._msgTimer <= 0) { this._lastMsg = ''; this._render() }
    }
  }

  dispose() { this._el.remove() }

  // ── Private ─────────────────────────────────────────────────────────────

  private _flash(msg: string, color: string) {
    this._lastMsg      = msg
    this._lastMsgColor = color
    this._msgTimer     = 3.5
    this._render()
  }

  private _render() {
    // Station list
    const stationRows = this._stations.map(n =>
      `<div style="color:${C.dim};padding-left:6px;font-size:10px">• ${n}</div>`
    ).join('')

    // Approach bar
    const approachHtml = this._approachProximity > 0 ? (() => {
      const pct      = Math.round(this._approachProximity * 100)
      const barW     = Math.round(this._approachProximity * (W - 24))
      const barColor = this._approachProximity > 0.75 ? C.yellow : C.blue
      return `
        <div style="margin-top:8px;border-top:1px solid ${C.brassVD};padding-top:6px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span style="color:${C.dim};font-size:9px;letter-spacing:1px">PROCHAINE</span>
            <span style="color:${barColor};font-size:10px;font-weight:bold">${this._approachName.toUpperCase()}</span>
          </div>
          <div style="background:#1e1008;border-radius:3px;height:7px;overflow:hidden;
            border:1px solid ${C.brassVD}">
            <div style="height:100%;width:${barW}px;max-width:100%;
              background:linear-gradient(90deg,${C.blue},${barColor});
              border-radius:3px;transition:width .1s"></div>
          </div>
          <div style="text-align:right;font-size:9px;color:${barColor};margin-top:2px">${pct}%</div>
        </div>`
    })() : ''

    // Last event flash
    const msgHtml = this._lastMsg
      ? `<div style="margin-top:6px;padding:4px 6px;
           background:${this._lastMsgColor}22;
           border-radius:4px;border-left:3px solid ${this._lastMsgColor};
           color:${this._lastMsgColor};font-size:10px;font-weight:bold">
           ${this._lastMsg}
         </div>`
      : ''

    this._el.innerHTML = `
      <div style="color:${C.brassL};font-weight:bold;letter-spacing:2px;
        font-size:9px;margin-bottom:8px;text-align:center;
        border-bottom:1px solid ${C.brassD};padding-bottom:5px">
        TABLEAU DE BORD
      </div>
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <span style="color:${C.dim};font-size:9px">PASSAGES</span>
        <span style="font-size:20px;font-weight:bold;color:${C.green}">${this._stops}</span>
      </div>
      ${this._stations.length ? `
        <div style="margin-top:8px;border-top:1px solid ${C.brassVD};padding-top:6px">
          <div style="color:${C.dim};font-size:9px;margin-bottom:3px;letter-spacing:1px">GARES</div>
          ${stationRows}
        </div>` : ''}
      ${approachHtml}
      ${msgHtml}
    `
  }
}
