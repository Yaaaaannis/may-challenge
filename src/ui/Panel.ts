import { CIRCUITS } from '../track/curves.js'

export interface PanelCallbacks {
  onSpeedChange: (v: number) => void
  onWagonAdd: () => void
  onWagonRemove: () => void
  onCircuit: (i: number) => void
  onWhistle: () => void
  onNightToggle: () => void
  onReset: () => void
  onFistToggle: () => void
  onPauseToggle: () => void
  onGrabToggle: () => void
  onBuilderMode: () => void
  onPreset: () => void
  onBiome: (id: string) => void
  onWeather:  (type: string) => void
  onSeason:   (id: string) => void
  onTunnel:   (active: boolean) => void
  onBridge:   (active: boolean) => void
}

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  red:    '#e63946',
  orange: '#f4a261',
  yellow: '#ffd166',
  green:  '#06d6a0',
  blue:   '#4cc9f0',
  indigo: '#4361ee',
  panel:  '#fffef8',
  border: '#e8ddd0',
  track:  '#c8bdb0',
  text:   '#2d2320',
  muted:  '#8a7a72',
}

// ── SVG icons ─────────────────────────────────────────────────────────────────
const ICONS = {
  loco: `<svg width="22" height="14" viewBox="0 0 22 14" fill="none">
    <rect x="1" y="4" width="14" height="8" rx="2" fill="currentColor"/>
    <rect x="15" y="6" width="5" height="6" rx="1.5" fill="currentColor"/>
    <rect x="3" y="1" width="5" height="4" rx="1" fill="currentColor"/>
    <circle cx="4"  cy="13" r="1.8" fill="currentColor"/>
    <circle cx="10" cy="13" r="1.8" fill="currentColor"/>
    <circle cx="17" cy="13" r="1.8" fill="currentColor"/>
  </svg>`,

  whistle: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M2 8 Q5 4 8 8 Q11 12 14 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
    <path d="M5 5 Q7 2 9 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none" opacity=".6"/>
  </svg>`,

  moon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M12 9A6 6 0 0 1 5 3a6 6 0 1 0 7 6z" fill="currentColor"/>
  </svg>`,

  reset: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M13 8A5 5 0 1 1 8 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
    <polyline points="8,1 8,4 11,4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
  </svg>`,

  pause: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="3.5" y="3" width="3.5" height="10" rx="1.5" fill="currentColor"/>
    <rect x="9"   y="3" width="3.5" height="10" rx="1.5" fill="currentColor"/>
  </svg>`,

  play: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <polygon points="4,2 14,8 4,14" fill="currentColor"/>
  </svg>`,

  fist: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="3" y="7"  width="10" height="7" rx="2"   fill="currentColor"/>
    <rect x="4" y="4"  width="2"  height="4" rx="1"   fill="currentColor"/>
    <rect x="7" y="3"  width="2"  height="4" rx="1"   fill="currentColor"/>
    <rect x="10" y="4" width="2"  height="3" rx="1"   fill="currentColor"/>
  </svg>`,

  grab: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="3"  y="7" width="2" height="7" rx="1"   fill="currentColor"/>
    <rect x="6"  y="5" width="2" height="9" rx="1"   fill="currentColor"/>
    <rect x="9"  y="6" width="2" height="8" rx="1"   fill="currentColor"/>
    <rect x="12" y="7" width="2" height="7" rx="1"   fill="currentColor"/>
    <path d="M3 7 Q3 4 5 4 Q7 4 7 6" stroke="currentColor" stroke-width="1" fill="none"/>
  </svg>`,

  circle: `<svg width="14" height="10" viewBox="0 0 14 10" fill="none">
    <ellipse cx="7" cy="5" rx="6" ry="4" stroke="currentColor" stroke-width="2" fill="none"/>
  </svg>`,

  oval: `<svg width="14" height="10" viewBox="0 0 14 10" fill="none">
    <ellipse cx="7" cy="5" rx="6" ry="3" stroke="currentColor" stroke-width="2" fill="none"/>
  </svg>`,

  eight: `<svg width="14" height="10" viewBox="0 0 14 10" fill="none">
    <path d="M7 5 C4 1 1 3 3 5 C5 7 9 7 11 5 C13 3 10 1 7 5 C4 9 1 7 3 5 C5 3 9 3 11 5 C13 7 10 9 7 5"
      stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  </svg>`,

  grand: `<svg width="14" height="10" viewBox="0 0 14 10" fill="none">
    <path d="M1 5 C1 1 5 1 7 3 C9 5 9 9 12 9 C14 9 14 7 13 6 C12 5 10 5 9 5 C8 5 6 5 5 4 C4 3 4 1 7 1 C10 1 13 3 13 5"
      stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
}

const CIRCUIT_ICONS  = [ICONS.circle, ICONS.oval, ICONS.eight, ICONS.grand]
const CIRCUIT_COLORS = [C.red, C.green, C.indigo, '#f59e0b']

export class Panel {
  private el:          HTMLElement
  private speedSlider: HTMLInputElement
  private wagonCount:  HTMLSpanElement
  private fistBtn:     HTMLButtonElement
  private grabBtn:     HTMLButtonElement
  private pauseBtn:    HTMLButtonElement
  private circuitBtns: HTMLButtonElement[] = []
  private builderBtn!:  HTMLButtonElement
  private presetBtn!:   HTMLButtonElement
  private biomeBtns: HTMLButtonElement[] = []
  private weatherBtns: HTMLButtonElement[] = []
  private seasonBtns:  HTMLButtonElement[] = []
  private tunnelBtn!:  HTMLButtonElement
  private bridgeBtn!:  HTMLButtonElement
  private _collapsed = false

  constructor(private callbacks: PanelCallbacks) {
    this._injectStyles()
    this.el          = this._build()
    this.speedSlider = this.el.querySelector('[data-speed]')!
    this.wagonCount  = this.el.querySelector('[data-wagon-count]')!
    this.fistBtn     = this.el.querySelector('[data-fist]')!
    this.grabBtn     = this.el.querySelector('[data-grab]')!
    this.pauseBtn    = this.el.querySelector('[data-pause]')!
    this.circuitBtns = Array.from(this.el.querySelectorAll('[data-circuit]'))
    this.builderBtn  = this.el.querySelector('[data-builder]')!
    this.presetBtn   = this.el.querySelector('[data-preset]')!
    this.biomeBtns = Array.from(this.el.querySelectorAll('[data-biome]'))
    this.weatherBtns = Array.from(this.el.querySelectorAll('[data-weather]'))
    this.seasonBtns  = Array.from(this.el.querySelectorAll('[data-season]'))
    this.tunnelBtn   = this.el.querySelector('[data-tunnel]')!
    this.bridgeBtn   = this.el.querySelector('[data-bridge]')!
    this._bindEvents()
    document.body.appendChild(this.el)
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  private _build(): HTMLElement {
    const el = document.createElement('div')
    el.className = 'tp-panel'
    el.innerHTML = `
      <header class="tp-header">
        <span class="tp-loco-icon">${ICONS.loco}</span>
        <span class="tp-title">Petit Train</span>
        <button class="tp-collapse-btn" data-collapse title="Réduire / Agrandir">
          <svg class="tp-chevron" width="14" height="14" viewBox="0 0 14 14" fill="none">
            <polyline points="2,4 7,10 12,4" stroke="currentColor" stroke-width="2.2"
              stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </header>
      <div class="tp-body">

      <section class="tp-section">
        <div class="tp-label">Vitesse</div>
        <div class="tp-slider-wrap">
          <input data-speed type="range" min="0.05" max="3" step="0.05" value="0.8" class="tp-slider">
        </div>
      </section>

      <div class="tp-divider"></div>

      <section class="tp-section">
        <div class="tp-label">Wagons</div>
        <div class="tp-wagon-row">
          <button class="tp-count-btn" data-wagon-remove>−</button>
          <span data-wagon-count class="tp-count">2</span>
          <button class="tp-count-btn" data-wagon-add>+</button>
        </div>
      </section>

      <div class="tp-divider"></div>

      <section class="tp-section">
        <div class="tp-row tp-row-3">
          <button class="tp-icon-btn" data-whistle  style="--c:${C.orange}" title="Sifflet (Espace)">
            ${ICONS.whistle}<span>Sifflet</span>
          </button>
          <button class="tp-icon-btn" data-night    style="--c:${C.indigo}" title="Nuit (N)">
            ${ICONS.moon}<span>Nuit</span>
          </button>
          <button class="tp-icon-btn" data-reset    style="--c:${C.green}"  title="Reset (R)">
            ${ICONS.reset}<span>Reset</span>
          </button>
        </div>
      </section>

      <div class="tp-divider"></div>

      <section class="tp-section tp-modes">
        <button class="tp-mode-btn" data-pause style="--c:${C.yellow};--ct:#2d2320" title="Pause (P)">
          <span data-pause-icon>${ICONS.pause}</span>
          <span data-pause-label>Pause</span>
        </button>
        <button class="tp-mode-btn" data-fist  style="--c:${C.red}"    title="Mode Poing (H)">
          ${ICONS.fist}<span>Mode Poing</span>
        </button>
        <button class="tp-mode-btn" data-grab  style="--c:${C.blue}"   title="Mode Grab (G)">
          ${ICONS.grab}<span>Mode Grab</span>
        </button>
      </section>

      <div class="tp-divider"></div>

      <section class="tp-section">
        <div class="tp-label">Circuit</div>
        <div class="tp-circuit-grid">
          ${CIRCUITS.map((c, i) => `
            <button class="tp-circuit-btn" data-circuit="${i}"
              style="--c:${CIRCUIT_COLORS[i]}" title="${c.name}">
              ${CIRCUIT_ICONS[i]}
              <span>${c.name}</span>
            </button>
          `).join('')}
        </div>
        <div style="margin-top:6px;display:flex;flex-direction:column;gap:5px">
          <button class="tp-mode-btn" data-preset style="--c:#9b5de5;--ct:#fff" title="Circuit de test avec 2 aiguillages">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2 L8 7 L3 10 M8 7 L13 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              <circle cx="3"  cy="12" r="2" fill="currentColor"/>
              <circle cx="13" cy="12" r="2" fill="currentColor"/>
            </svg>
            <span>2 Aiguillages</span>
          </button>
          <button class="tp-mode-btn" data-builder style="--c:#e8a838;--ct:#2d2320" title="Construire son propre circuit">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 12 L5 9 L11 3 Q12.5 1.5 14 3 Q15.5 4.5 14 6 L8 12 L5 13 Z"
                stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="none"/>
              <line x1="10" y1="4" x2="12" y2="6" stroke="currentColor" stroke-width="1.5"/>
            </svg>
            <span>Créer son circuit</span>
          </button>
        </div>
      </section>

      <div class="tp-divider"></div>

      <section class="tp-section">
        <div class="tp-label">Biome</div>
        <div class="tp-row" style="flex-wrap:wrap;gap:4px">
          <button class="tp-biome-btn" data-biome="prairie" style="--c:#4a9a30">🌿</button>
          <button class="tp-biome-btn" data-biome="desert"  style="--c:#d4a030">🏜️</button>
          <button class="tp-biome-btn" data-biome="foret"   style="--c:#1a5a20">🌲</button>
          <button class="tp-biome-btn" data-biome="toundra" style="--c:#66bbdd">❄️</button>
          <button class="tp-biome-btn" data-biome="volcan"  style="--c:#dd4400">🌋</button>
        </div>
      </section>

      <div class="tp-divider"></div>

      <section class="tp-section">
        <div class="tp-label">Météo</div>
        <div class="tp-row" style="flex-wrap:wrap;gap:4px">
          <button class="tp-biome-btn active" data-weather="clear"  style="--c:#87ceeb" title="Beau temps">☀️</button>
          <button class="tp-biome-btn"        data-weather="rain"   style="--c:#4488cc" title="Pluie">🌧️</button>
          <button class="tp-biome-btn"        data-weather="storm"  style="--c:#334477" title="Orage">⛈️</button>
        </div>
      </section>

      <div class="tp-divider"></div>

      <section class="tp-section">
        <div class="tp-label">Saison</div>
        <div class="tp-row" style="flex-wrap:wrap;gap:4px">
          <button class="tp-biome-btn active" data-season="summer" style="--c:#f4a261" title="Été">🌞</button>
          <button class="tp-biome-btn"        data-season="spring" style="--c:#ff88aa" title="Printemps">🌸</button>
          <button class="tp-biome-btn"        data-season="autumn" style="--c:#cc6611" title="Automne">🍂</button>
          <button class="tp-biome-btn"        data-season="winter" style="--c:#99ccee" title="Hiver">🌨️</button>
        </div>
      </section>

      <div class="tp-divider"></div>

      <section class="tp-section">
        <div class="tp-label">Décors</div>
        <div class="tp-row" style="gap:5px">
          <button class="tp-mode-btn" data-tunnel style="--c:#7a6855;--ct:#fff" title="Tunnel dans la montagne">
            <span>🏔️</span><span>Tunnel</span>
          </button>
          <button class="tp-mode-btn" data-bridge style="--c:#1a6080;--ct:#fff" title="Pont avec rivière">
            <span>🌉</span><span>Pont</span>
          </button>
        </div>
      </section>

      <div class="tp-kbd-hint">
        ← → vitesse &nbsp;·&nbsp; +/− wagons
      </div>
      </div>
    `
    return el
  }

  // ── Events ────────────────────────────────────────────────────────────────

  private _bindEvents() {
    const q = (sel: string) => this.el.querySelector(sel)

    ;(q('[data-speed]') as HTMLInputElement).addEventListener('input', (e) => {
      this.callbacks.onSpeedChange(parseFloat((e.target as HTMLInputElement).value))
    })

    q('[data-wagon-add]')!.addEventListener('click', () => this.callbacks.onWagonAdd())
    q('[data-wagon-remove]')!.addEventListener('click', () => this.callbacks.onWagonRemove())
    q('[data-whistle]')!.addEventListener('click', () => this.callbacks.onWhistle())
    q('[data-night]')!.addEventListener('click', () => this.callbacks.onNightToggle())
    q('[data-reset]')!.addEventListener('click', () => this.callbacks.onReset())
    q('[data-pause]')!.addEventListener('click', () => this.callbacks.onPauseToggle())
    q('[data-fist]')!.addEventListener('click', () => this.callbacks.onFistToggle())
    q('[data-grab]')!.addEventListener('click', () => this.callbacks.onGrabToggle())
    q('[data-preset]')!.addEventListener('click', () => {
      this.setPresetActive(true)
      this.callbacks.onPreset()
    })

    q('[data-builder]')!.addEventListener('click', () => {
      this.setBuilderActive(true)
      this.callbacks.onBuilderMode()
    })

    this.el.querySelectorAll('[data-circuit]').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        this.setActiveCircuit(i)
        this.callbacks.onCircuit(i)
      })
    })

    this.el.querySelectorAll('[data-biome]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.biome!
        this.biomeBtns.forEach(b => b.classList.remove('active'))
        ;(btn as HTMLButtonElement).classList.add('active')
        this.callbacks.onBiome(id)
      })
    })
    this.el.querySelectorAll('[data-weather]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = (btn as HTMLElement).dataset.weather!
        this.weatherBtns.forEach(b => b.classList.remove('active'))
        ;(btn as HTMLButtonElement).classList.add('active')
        this.callbacks.onWeather(type)
      })
    })

    this.el.querySelectorAll('[data-season]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.season!
        this.seasonBtns.forEach(b => b.classList.remove('active'))
        ;(btn as HTMLButtonElement).classList.add('active')
        this.callbacks.onSeason(id)
      })
    })

    q('[data-tunnel]')!.addEventListener('click', () => {
      const active = this.tunnelBtn.classList.toggle('active')
      this.callbacks.onTunnel(active)
    })

    q('[data-bridge]')!.addEventListener('click', () => {
      const active = this.bridgeBtn.classList.toggle('active')
      this.callbacks.onBridge(active)
    })

    // Collapse toggle
    q('[data-collapse]')!.addEventListener('click', () => {
      this._collapsed = !this._collapsed
      this.el.classList.toggle('collapsed', this._collapsed)
    })

    // Activate prairie by default
    const prairiBtn = this.el.querySelector('[data-biome="prairie"]') as HTMLButtonElement
    prairiBtn?.classList.add('active')

    this.setActiveCircuit(0)
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  private _injectStyles() {
    if (document.getElementById('tp-styles')) return
    const style = document.createElement('style')
    style.id = 'tp-styles'
    style.textContent = `
      .tp-panel {
        position: fixed;
        top: 50%;
        right: 16px;
        transform: translateY(-50%);
        width: 176px;
        background: ${C.panel};
        border: 2.5px solid ${C.border};
        border-radius: 20px;
        box-shadow: 0 8px 32px rgba(0,0,0,.18), 0 2px 8px rgba(0,0,0,.10);
        font-family: 'Nunito', system-ui, sans-serif;
        font-size: 13px;
        color: ${C.text};
        user-select: none;
        z-index: 100;
        overflow: hidden;
        max-height: 95vh;
        overflow-y: auto;
        overflow-x: hidden;
      }

      .tp-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 10px 9px 14px;
        background: ${C.red};
        color: #fff;
        cursor: default;
      }
      .tp-loco-icon { display:flex; align-items:center; opacity:.95; }
      .tp-title {
        flex: 1;
        font-size: 15px;
        font-weight: 900;
        letter-spacing: .3px;
      }

      .tp-collapse-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 26px; height: 26px;
        border-radius: 8px;
        border: none;
        background: rgba(255,255,255,0.18);
        color: #fff;
        cursor: pointer;
        flex-shrink: 0;
        transition: background .12s;
        padding: 0;
      }
      .tp-collapse-btn:hover { background: rgba(255,255,255,0.32); }
      .tp-chevron {
        transition: transform .22s ease;
      }
      .tp-panel.collapsed .tp-chevron {
        transform: rotate(-90deg);
      }

      .tp-body {
        overflow: hidden;
        max-height: 2000px;
        transition: max-height .28s ease, opacity .22s ease;
        opacity: 1;
      }
      .tp-panel.collapsed .tp-body {
        max-height: 0;
        opacity: 0;
      }

      .tp-section { padding: 8px 12px; }
      .tp-modes   { display: flex; flex-direction: column; gap: 5px; }

      .tp-divider {
        height: 2px;
        background: ${C.border};
        margin: 0 10px;
        border-radius: 1px;
      }

      .tp-label {
        font-size: 10px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: .8px;
        color: ${C.muted};
        margin-bottom: 5px;
      }

      /* Slider */
      .tp-slider-wrap { padding: 2px 0; }
      .tp-slider {
        -webkit-appearance: none;
        width: 100%;
        height: 6px;
        border-radius: 3px;
        background: ${C.track};
        outline: none;
        cursor: pointer;
      }
      .tp-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 18px; height: 18px;
        border-radius: 50%;
        background: ${C.red};
        border: 2.5px solid #fff;
        box-shadow: 0 1px 4px rgba(0,0,0,.25);
        cursor: pointer;
        transition: transform .1s;
      }
      .tp-slider::-webkit-slider-thumb:hover { transform: scale(1.15); }

      /* Wagon counter */
      .tp-wagon-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .tp-count-btn {
        width: 26px; height: 26px;
        border-radius: 8px;
        border: 2px solid ${C.border};
        background: #fff;
        color: ${C.text};
        font-size: 16px;
        font-weight: 900;
        font-family: inherit;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        line-height: 1;
        transition: background .1s, border-color .1s;
      }
      .tp-count-btn:hover {
        background: ${C.yellow};
        border-color: ${C.yellow};
      }
      .tp-count {
        flex: 1;
        text-align: center;
        font-size: 17px;
        font-weight: 900;
        color: ${C.text};
      }

      /* Row helpers */
      .tp-row { display: flex; gap: 5px; }
      .tp-row-3 > * { flex: 1; }

      /* Circuit grid — 2 columns, auto-rows */
      .tp-circuit-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 5px;
      }

      /* Small icon buttons (whistle/night/reset) */
      .tp-icon-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
        padding: 7px 4px 5px;
        border-radius: 12px;
        border: 2px solid color-mix(in srgb, var(--c) 40%, transparent);
        background: color-mix(in srgb, var(--c) 12%, transparent);
        color: var(--c);
        font-family: inherit;
        font-size: 9.5px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: .4px;
        cursor: pointer;
        transition: background .12s, transform .1s;
      }
      .tp-icon-btn span { margin-top: 1px; }
      .tp-icon-btn:hover {
        background: color-mix(in srgb, var(--c) 22%, transparent);
        transform: translateY(-1px);
      }
      .tp-icon-btn:active { transform: translateY(0); }

      /* Full-width mode buttons */
      .tp-mode-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 8px 10px;
        border-radius: 12px;
        border: 2px solid color-mix(in srgb, var(--c) 35%, transparent);
        background: color-mix(in srgb, var(--c) 10%, transparent);
        color: var(--ct, var(--c));
        font-family: inherit;
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
        transition: background .12s, border-color .15s, transform .1s;
        text-align: left;
      }
      .tp-mode-btn:hover {
        background: color-mix(in srgb, var(--c) 20%, transparent);
        transform: translateX(1px);
      }
      .tp-mode-btn.active {
        background: var(--c);
        border-color: var(--c);
        color: var(--ct, #fff);
        box-shadow: 0 2px 10px color-mix(in srgb, var(--c) 50%, transparent);
      }
      .tp-mode-btn svg { flex-shrink: 0; }

      /* Circuit buttons */
      .tp-circuit-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 7px 4px 5px;
        border-radius: 12px;
        border: 2px solid color-mix(in srgb, var(--c) 35%, transparent);
        background: color-mix(in srgb, var(--c) 10%, transparent);
        color: var(--c);
        font-family: inherit;
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: .3px;
        cursor: pointer;
        transition: background .12s, transform .1s;
      }
      .tp-circuit-btn span { margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
      .tp-circuit-btn:hover { background: color-mix(in srgb, var(--c) 20%, transparent); }
      .tp-circuit-btn.active {
        background: var(--c);
        border-color: var(--c);
        color: #fff;
      }

      .tp-biome-btn {
        width: 34px; height: 34px;
        border-radius: 10px;
        border: 2px solid color-mix(in srgb, var(--c) 40%, transparent);
        background: color-mix(in srgb, var(--c) 12%, transparent);
        font-size: 16px;
        cursor: pointer;
        transition: background .12s, transform .1s;
        display: flex; align-items: center; justify-content: center;
      }
      .tp-biome-btn:hover { background: color-mix(in srgb, var(--c) 25%, transparent); transform: scale(1.08); }
      .tp-biome-btn.active {
        background: var(--c); border-color: var(--c);
        box-shadow: 0 2px 8px color-mix(in srgb, var(--c) 50%, transparent);
        transform: scale(1.05);
      }

      /* Keyboard hint */
      .tp-kbd-hint {
        text-align: center;
        font-size: 9.5px;
        font-weight: 700;
        color: ${C.muted};
        padding: 6px 8px 9px;
        letter-spacing: .2px;
      }

      .tp-panel::-webkit-scrollbar { width: 4px; }
      .tp-panel::-webkit-scrollbar-track { background: transparent; }
      .tp-panel::-webkit-scrollbar-thumb { background: ${C.track}; border-radius: 2px; }
    `
    document.head.appendChild(style)
  }

  // ── Public API ────────────────────────────────────────────────────────────

  setWagonCount(n: number) {
    this.wagonCount.textContent = String(n)
  }

  setSpeed(v: number) {
    this.speedSlider.value = String(v)
  }

  setActiveCircuit(i: number) {
    this.circuitBtns.forEach((b, idx) => {
      b.classList.toggle('active', idx === i)
    })
    this.builderBtn.classList.remove('active')
    this.presetBtn.classList.remove('active')
  }

  setBuilderActive(active: boolean) {
    this.builderBtn.classList.toggle('active', active)
    if (active) {
      this.circuitBtns.forEach(b => b.classList.remove('active'))
      this.presetBtn.classList.remove('active')
    }
  }

  setPresetActive(active: boolean) {
    this.presetBtn.classList.toggle('active', active)
    if (active) {
      this.circuitBtns.forEach(b => b.classList.remove('active'))
      this.builderBtn.classList.remove('active')
    }
  }

  setFistActive(active: boolean) {
    this.fistBtn.classList.toggle('active', active)
  }

  setGrabActive(active: boolean) {
    this.grabBtn.classList.toggle('active', active)
  }

  setPaused(paused: boolean) {
    this.pauseBtn.classList.toggle('active', paused)
    const iconEl  = this.pauseBtn.querySelector('[data-pause-icon]')!
    const labelEl = this.pauseBtn.querySelector('[data-pause-label]')!
    iconEl.innerHTML  = paused ? ICONS.play  : ICONS.pause
    labelEl.textContent = paused ? 'Reprendre' : 'Pause'
  }

  dispose() {
    this.el.remove()
  }
}
