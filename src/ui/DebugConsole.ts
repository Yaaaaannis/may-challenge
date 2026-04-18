// ── DebugConsole ──────────────────────────────────────────────────────────────
// Panneau de debug en haut à gauche pour régler tous les paramètres visuels.

export interface DebugCallbacks {
  // Lumière
  onAmbientIntensity: (v: number) => void
  // Sky
  onSkyTurbidity:    (v: number) => void
  onSkyRayleigh:     (v: number) => void
  onSkyMie:          (v: number) => void
  onSkyMieG:         (v: number) => void
  onSunElevation:    (v: number) => void
  // Water
  onWaveSpeed:       (v: number) => void
  onWaveAmplitude:   (v: number) => void
  onWaterDeep:       (hex: number) => void
  onWaterShallow:    (hex: number) => void
  onWaterFoam:       (hex: number) => void
  // Smoke
  onSmokeRate:       (v: number) => void
  onSmokeRise:       (v: number) => void
  onSmokeSize:       (v: number) => void
  // Rain
  onRainSpeed:       (v: number) => void
  onRainOpacity:     (v: number) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexInputToNumber(s: string): number {
  return parseInt(s.replace('#', ''), 16)
}

function numberToHexInput(n: number): string {
  return '#' + n.toString(16).padStart(6, '0')
}

// ── DebugConsole class ────────────────────────────────────────────────────────

export class DebugConsole {
  private _el:   HTMLElement
  private _body: HTMLElement
  private _open  = true

  constructor(private cb: DebugCallbacks) {
    this._injectStyles()
    this._el   = this._buildPanel()
    this._body = this._el.querySelector('.dbg-body')!
    this._buildSections()
    document.body.appendChild(this._el)
  }

  dispose() { this._el.remove() }

  // ── Build ─────────────────────────────────────────────────────────────────

  private _buildPanel(): HTMLElement {
    const el = document.createElement('div')
    el.className = 'dbg-panel'
    el.innerHTML = `
      <div class="dbg-titlebar">
        <span class="dbg-title">⚙ Debug</span>
        <button class="dbg-toggle" title="Réduire">−</button>
      </div>
      <div class="dbg-body"></div>
    `
    el.querySelector('.dbg-toggle')!.addEventListener('click', () => {
      this._open = !this._open
      const body = el.querySelector('.dbg-body') as HTMLElement
      const btn  = el.querySelector('.dbg-toggle') as HTMLButtonElement
      body.style.display = this._open ? '' : 'none'
      btn.textContent    = this._open ? '−' : '+'
    })
    return el
  }

  private _buildSections() {
    // ── Lumière ──────────────────────────────────────────────────────────────
    const light = this._section('💡 Lumière', '#fbbf24', false)
    this._slider(light, 'Ambiant',  0, 3, 0.05, 1.2, v => this.cb.onAmbientIntensity(v))

    // ── Ciel ─────────────────────────────────────────────────────────────────
    const sky = this._section('☁️ Ciel (Rayleigh)', '#38bdf8', true)
    this._slider(sky, 'Turbidité',    0,   22,  0.1,   2.5,  v => this.cb.onSkyTurbidity(v))
    this._slider(sky, 'Rayleigh',     0,   4,   0.05,  3.0,  v => this.cb.onSkyRayleigh(v))
    this._slider(sky, 'Mie coeff',    0,   0.1, 0.001, 0.003,v => this.cb.onSkyMie(v))
    this._slider(sky, 'Mie G',        0,   1,   0.01,  0.86, v => this.cb.onSkyMieG(v))
    this._slider(sky, 'Soleil élév.', 0,   1,   0.01,  0.55, v => this.cb.onSunElevation(v))

    // ── Eau ──────────────────────────────────────────────────────────────────
    const water = this._section('💧 Eau', '#0ea5e9', true)
    this._slider(water, 'Vitesse vagues',   0.1, 4, 0.05, 1.0, v => this.cb.onWaveSpeed(v))
    this._slider(water, 'Amplitude vagues', 0.1, 3, 0.05, 1.0, v => this.cb.onWaveAmplitude(v))
    this._color(water,  'Profond',  0x0d4a66, v => this.cb.onWaterDeep(v))
    this._color(water,  'Surface',  0x2a8aaa, v => this.cb.onWaterShallow(v))
    this._color(water,  'Écume',    0xb8dde8, v => this.cb.onWaterFoam(v))

    // ── Fumée ────────────────────────────────────────────────────────────────
    const smoke = this._section('💨 Fumée', '#a8a29e', true)
    this._slider(smoke, 'Émission', 0,   4,   0.05, 1.0, v => this.cb.onSmokeRate(v))
    this._slider(smoke, 'Montée',   0.2, 3,   0.05, 1.0, v => this.cb.onSmokeRise(v))
    this._slider(smoke, 'Taille',   0.2, 3,   0.05, 1.0, v => this.cb.onSmokeSize(v))

    // ── Météo ────────────────────────────────────────────────────────────────
    const rain = this._section('🌧 Pluie', '#60a5fa', true)
    this._slider(rain, 'Vitesse chute', 5,  50, 0.5,  22,  v => this.cb.onRainSpeed(v))
    this._slider(rain, 'Opacité',       0,  1,  0.01, 0.5, v => this.cb.onRainOpacity(v))
  }

  // ── Section helpers ───────────────────────────────────────────────────────

  private _section(title: string, accent: string, collapsed = false): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'dbg-section'

    const hdr = document.createElement('div')
    hdr.className = 'dbg-section-hdr'
    hdr.style.borderLeftColor = accent
    hdr.innerHTML = `<span class="dbg-caret">${collapsed ? '▸' : '▾'}</span> ${title}`

    const body = document.createElement('div')
    body.className = 'dbg-section-body'
    body.style.display = collapsed ? 'none' : ''

    hdr.addEventListener('click', () => {
      const open = body.style.display !== 'none'
      body.style.display = open ? 'none' : ''
      hdr.querySelector('.dbg-caret')!.textContent = open ? '▸' : '▾'
    })

    wrap.appendChild(hdr)
    wrap.appendChild(body)
    this._body.appendChild(wrap)
    return body
  }

  private _slider(
    parent: HTMLElement, label: string,
    min: number, max: number, step: number, init: number,
    onChange: (v: number) => void,
  ) {
    const row = document.createElement('div')
    row.className = 'dbg-row'

    const lbl = document.createElement('label')
    lbl.className = 'dbg-lbl'
    lbl.textContent = label

    const input = document.createElement('input')
    input.type  = 'range'
    input.className = 'dbg-slider'
    input.min   = String(min)
    input.max   = String(max)
    input.step  = String(step)
    input.value = String(init)

    const val = document.createElement('span')
    val.className = 'dbg-val'
    val.textContent = String(init)

    input.addEventListener('input', () => {
      const v = parseFloat(input.value)
      val.textContent = v.toFixed(step < 0.01 ? 3 : step < 0.1 ? 2 : 1)
      onChange(v)
    })

    row.appendChild(lbl)
    row.appendChild(input)
    row.appendChild(val)
    parent.appendChild(row)
  }

  private _color(parent: HTMLElement, label: string, init: number, onChange: (hex: number) => void) {
    const row = document.createElement('div')
    row.className = 'dbg-row'

    const lbl = document.createElement('label')
    lbl.className = 'dbg-lbl'
    lbl.textContent = label

    const input = document.createElement('input')
    input.type  = 'color'
    input.className = 'dbg-color'
    input.value = numberToHexInput(init)

    input.addEventListener('input', () => onChange(hexInputToNumber(input.value)))

    row.appendChild(lbl)
    row.appendChild(input)
    parent.appendChild(row)
  }

  private _button(parent: HTMLElement, label: string, onClick: () => void) {
    const btn = document.createElement('button')
    btn.className = 'dbg-btn'
    btn.textContent = label
    btn.addEventListener('click', onClick)
    parent.appendChild(btn)
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  private _injectStyles() {
    if (document.getElementById('dbg-styles')) return
    const style = document.createElement('style')
    style.id = 'dbg-styles'
    style.textContent = `
      .dbg-panel {
        position: fixed;
        top: 12px;
        left: 12px;
        width: 262px;
        max-height: calc(100vh - 24px);
        overflow-y: auto;
        overflow-x: hidden;
        background: rgba(14, 14, 18, 0.92);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 10px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
        font-size: 11px;
        color: #e0e0e0;
        z-index: 9999;
        user-select: none;
      }
      .dbg-panel::-webkit-scrollbar { width: 3px; }
      .dbg-panel::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }

      .dbg-titlebar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 7px 10px;
        background: rgba(255,255,255,0.04);
        border-bottom: 1px solid rgba(255,255,255,0.08);
        border-radius: 10px 10px 0 0;
      }
      .dbg-title {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 1px;
        text-transform: uppercase;
        color: #a8a8b8;
      }
      .dbg-toggle {
        background: none;
        border: 1px solid rgba(255,255,255,0.15);
        color: #a8a8b8;
        border-radius: 4px;
        width: 20px; height: 20px;
        cursor: pointer;
        font-size: 13px;
        line-height: 1;
        display: flex; align-items: center; justify-content: center;
        transition: background .1s;
      }
      .dbg-toggle:hover { background: rgba(255,255,255,0.08); }

      .dbg-body { padding-bottom: 6px; }

      .dbg-section { border-bottom: 1px solid rgba(255,255,255,0.06); }

      .dbg-section-hdr {
        padding: 6px 10px;
        cursor: pointer;
        font-size: 10.5px;
        font-weight: 700;
        letter-spacing: .5px;
        color: #c0c0d0;
        border-left: 3px solid #555;
        transition: background .1s;
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .dbg-section-hdr:hover { background: rgba(255,255,255,0.04); }
      .dbg-caret { font-size: 9px; color: #888; }

      .dbg-section-body { padding: 4px 8px 6px; }

      .dbg-row {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 3px 0;
      }

      .dbg-lbl {
        width: 90px;
        flex-shrink: 0;
        font-size: 10px;
        color: #9090a0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .dbg-slider {
        -webkit-appearance: none;
        flex: 1;
        height: 3px;
        background: rgba(255,255,255,0.12);
        border-radius: 2px;
        outline: none;
        cursor: pointer;
      }
      .dbg-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 10px; height: 10px;
        border-radius: 50%;
        background: #a78bfa;
        border: none;
        cursor: pointer;
        transition: transform .1s;
      }
      .dbg-slider::-webkit-slider-thumb:hover { transform: scale(1.4); }

      .dbg-val {
        width: 36px;
        text-align: right;
        font-size: 10px;
        color: #a78bfa;
        flex-shrink: 0;
      }

      .dbg-color {
        -webkit-appearance: none;
        width: 28px; height: 18px;
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 4px;
        padding: 0;
        cursor: pointer;
        background: none;
        flex-shrink: 0;
      }
      .dbg-color::-webkit-color-swatch-wrapper { padding: 0; }
      .dbg-color::-webkit-color-swatch { border: none; border-radius: 3px; }

      .dbg-btn {
        width: 100%;
        margin-top: 4px;
        padding: 5px 0;
        background: rgba(167,139,250,0.15);
        border: 1px solid rgba(167,139,250,0.35);
        border-radius: 5px;
        color: #a78bfa;
        font-family: inherit;
        font-size: 10.5px;
        font-weight: 700;
        cursor: pointer;
        letter-spacing: .5px;
        transition: background .1s;
      }
      .dbg-btn:hover { background: rgba(167,139,250,0.25); }
    `
    document.head.appendChild(style)
  }
}
