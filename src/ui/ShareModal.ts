import { shareCircuit } from '../supabase/api.js'
import type { CircuitPayload } from '../supabase/types.js'
import { injectBoardStyles } from './BrowseModal.js'

// ── Brutalist palette ─────────────────────────────────────────────────────────
const C = {
  bg:     '#000000',
  amber:  '#ffcc44',
  orange: '#ff8800',
  white:  '#e8e8e0',
  dim:    '#666666',
  dimmer: '#333333',
  green:  '#33cc55',
  red:    '#ff3333',
}

const FLIP_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.:-'
function rndChar() { return FLIP_CHARS[Math.floor(Math.random() * FLIP_CHARS.length)] }

export class ShareModal {
  private _el:      HTMLElement
  private _overlay: HTMLElement
  private _flipIv   = 0

  onClose?: () => void

  constructor() {
    injectBoardStyles()

    this._overlay = document.createElement('div')
    Object.assign(this._overlay.style, {
      position:       'fixed', inset: '0',
      background:     'rgba(0,0,0,0.93)',
      zIndex:         '500',
      display:        'none',
      alignItems:     'center',
      justifyContent: 'center',
    })

    this._el = document.createElement('div')
    this._el.className = 'b-modal'
    Object.assign(this._el.style, {
      background:   C.bg,
      border:       `2px solid ${C.amber}`,
      borderRadius: '0',
      width:        '420px',
      maxWidth:     '96vw',
      fontFamily:   "'Courier New', monospace",
      color:        C.white,
      boxShadow:    `8px 8px 0 0 ${C.amber}`,
      overflow:     'hidden',
    })

    this._overlay.appendChild(this._el)
    document.body.appendChild(this._overlay)
    this._overlay.addEventListener('click', e => { if (e.target === this._overlay) this.close() })
  }

  // ── Public ──────────────────────────────────────────────────────────────────

  open(payload: CircuitPayload, previewDataUrl: string | null) {
    this._overlay.style.display = 'flex'
    this._el.classList.remove('b-modal')
    void this._el.offsetWidth
    this._el.classList.add('b-modal')
    this._render(payload, previewDataUrl)
    this._animateTitle()
  }

  close() {
    this._overlay.style.display = 'none'
    this._stopFlip()
    this.onClose?.()
  }

  dispose() {
    this._stopFlip()
    this._overlay.remove()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  private _render(payload: CircuitPayload, previewDataUrl: string | null) {
    const previewHtml = previewDataUrl
      ? `<img src="${previewDataUrl}"
           style="width:100%;display:block;
             border-bottom:2px solid ${C.dimmer};
             filter:grayscale(15%) contrast(1.05) brightness(0.8);
             max-height:160px;object-fit:cover">`
      : `<div style="width:100%;height:60px;background:#080808;
           border-bottom:2px solid ${C.dimmer};
           display:flex;align-items:center;justify-content:center;gap:10px">
           <span style="font-size:18px;opacity:0.1">🚂</span>
           <span style="font-size:8px;color:${C.dimmer};letter-spacing:4px">AUCUNE PREVIEW</span>
         </div>`

    this._el.innerHTML = `
      <!-- Amber header bar -->
      <div style="background:${C.amber};padding:10px 20px;
        display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:10px;font-weight:900;color:#000">►</span>
          <span id="sh-title" style="font-size:10px;font-weight:900;
            letter-spacing:4px;color:#000">PARTAGER CE CIRCUIT</span>
        </div>
        <button id="sh-close"
          style="background:#000;border:none;color:${C.amber};
            font-size:18px;font-weight:900;cursor:pointer;
            width:26px;height:26px;display:flex;align-items:center;justify-content:center;
            transition:background .1s"
          onmouseover="this.style.background='#333'"
          onmouseout="this.style.background='#000'">×</button>
      </div>

      <!-- Preview -->
      ${previewHtml}

      <!-- Form -->
      <div style="padding:20px;border-bottom:2px solid ${C.dimmer}">
        <!-- Name field -->
        <div style="margin-bottom:14px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
            <span style="color:${C.amber};font-size:9px;font-weight:900">▸</span>
            <label style="font-size:8px;color:${C.dim};letter-spacing:3px">NOM DU CIRCUIT</label>
          </div>
          <input id="sh-name" class="b-input" maxlength="60"
            placeholder="MON CIRCUIT…" style="font-weight:700;font-size:12px">
        </div>

        <!-- Creator field -->
        <div style="margin-bottom:14px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
            <span style="color:${C.dim};font-size:9px;font-weight:900">▸</span>
            <label style="font-size:8px;color:${C.dim};letter-spacing:3px">PSEUDO CRÉATEUR</label>
          </div>
          <input id="sh-creator" class="b-input" maxlength="40" placeholder="ANONYME">
        </div>

        <!-- Description field -->
        <div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
            <span style="color:${C.dim};font-size:9px;font-weight:900">▸</span>
            <label style="font-size:8px;color:${C.dim};letter-spacing:3px">DESCRIPTION</label>
            <span style="font-size:7px;color:#2a2a2a;letter-spacing:2px">(OPTIONNEL)</span>
          </div>
          <textarea id="sh-desc" class="b-input" maxlength="200" rows="2"
            placeholder="UN CIRCUIT AVEC DES VIRAGES…"
            style="resize:vertical"></textarea>
        </div>
      </div>

      <!-- Status + Actions -->
      <div style="padding:14px 20px;background:#080808">
        <div id="sh-status" style="font-size:10px;font-weight:900;min-height:18px;
          margin-bottom:12px;letter-spacing:2px"></div>
        <div style="display:flex;gap:8px">
          <button id="sh-cancel" class="b-btn-s">ANNULER</button>
          <button id="sh-submit" class="b-btn-p" style="flex:1">PARTAGER →</button>
        </div>
      </div>
    `

    this._el.querySelector('#sh-close')!.addEventListener('click', () => this.close())
    this._el.querySelector('#sh-cancel')!.addEventListener('click', () => this.close())
    this._el.querySelector('#sh-submit')!.addEventListener('click', () =>
      this._submit(payload, previewDataUrl))
  }

  // ── Title flip on open ────────────────────────────────────────────────────

  private _animateTitle() {
    this._stopFlip()
    const titleEl = this._el.querySelector('#sh-title') as HTMLElement | null
    if (!titleEl) return

    const FINAL = 'PARTAGER CE CIRCUIT'
    let step = 0
    this._flipIv = window.setInterval(() => {
      step++
      titleEl.textContent = Array.from(FINAL).map((ch, i) => {
        if (ch === ' ') return ' '
        return step > i * 1.4 ? ch : rndChar()
      }).join('')
      if (step >= FINAL.length * 1.4 + 4) {
        titleEl.textContent = FINAL
        this._stopFlip()
      }
    }, 50)
  }

  private _stopFlip() {
    if (this._flipIv) { clearInterval(this._flipIv); this._flipIv = 0 }
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  private async _submit(payload: CircuitPayload, previewDataUrl: string | null) {
    const name    = (this._el.querySelector('#sh-name')    as HTMLInputElement).value.trim()
    const creator = (this._el.querySelector('#sh-creator') as HTMLInputElement).value.trim() || 'Anonyme'
    const desc    = (this._el.querySelector('#sh-desc')    as HTMLTextAreaElement).value.trim()
    const status  = this._el.querySelector('#sh-status')  as HTMLElement
    const btn     = this._el.querySelector('#sh-submit')  as HTMLButtonElement

    if (!name) {
      status.style.color = C.red
      status.textContent = '✕ DONNE UN NOM AU CIRCUIT'
      const nameInput = this._el.querySelector('#sh-name') as HTMLInputElement
      nameInput.style.borderColor = C.red
      nameInput.focus()
      return
    }

    btn.disabled = true
    status.textContent = ''

    // Flip animation on button text during upload
    const DOTS = ['.', '..', '...']
    let d = 0
    const dotIv = window.setInterval(() => {
      btn.textContent = `ENVOI${DOTS[d++ % 3]}`
    }, 280)

    try {
      await shareCircuit({ name, creator, description: desc, payload, previewDataUrl })
      clearInterval(dotIv)
      status.style.color = C.green
      status.textContent = '✓ CIRCUIT PARTAGÉ — BON VOYAGE !'
      btn.style.background = C.green
      btn.style.borderColor = C.green
      btn.textContent = '✓ PARTAGÉ !'
      setTimeout(() => this.close(), 1600)
    } catch (err: any) {
      clearInterval(dotIv)
      status.style.color = C.red
      status.textContent = `✕ ERREUR : ${err.message ?? err}`
      btn.disabled = false
      btn.textContent = 'PARTAGER →'
    }
  }
}
