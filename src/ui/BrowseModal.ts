import { listCircuits, submitRating, getMyRating } from '../supabase/api.js'
import type { CircuitRow } from '../supabase/types.js'
import type { CircuitPayload } from '../supabase/types.js'

// ── Brutalist palette ─────────────────────────────────────────────────────────
const C = {
  bg:     '#000000',
  card:   '#080808',
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

// ── Shared CSS ────────────────────────────────────────────────────────────────
export function injectBoardStyles() {
  if (document.getElementById('board-modal-css')) return
  const s = document.createElement('style')
  s.id = 'board-modal-css'
  s.textContent = `
    @keyframes bFlipIn {
      0%   { transform: perspective(500px) rotateX(-90deg); opacity: 0; }
      60%  { transform: perspective(500px) rotateX(6deg);   opacity: 1; }
      100% { transform: perspective(500px) rotateX(0);      opacity: 1; }
    }
    @keyframes bSnapIn {
      0%   { transform: translateY(-10px); opacity: 0; }
      100% { transform: translateY(0);     opacity: 1; }
    }

    .b-modal { animation: bSnapIn 0.14s cubic-bezier(0,0,0.2,1) both; }

    .b-card {
      animation: bFlipIn 0.28s ease-out both;
      background: #080808;
      border: 2px solid #333;
      border-top: 3px solid #ffcc44;
      cursor: pointer;
      overflow: hidden;
      transition: border-color .1s, box-shadow .1s, transform .1s;
    }
    .b-card:hover {
      border-color: #ffcc44 !important;
      border-top-color: #ff8800 !important;
      box-shadow: 4px 4px 0 #ffcc44 !important;
      transform: translate(-2px, -2px);
    }

    .b-btn-p {
      background: #ffcc44; color: #000;
      border: 2px solid #ffcc44; border-radius: 0;
      padding: 9px 20px;
      font-family: 'Courier New', monospace; font-size: 11px; font-weight: bold;
      cursor: pointer; letter-spacing: 2px;
      box-shadow: 3px 3px 0 #000;
      transition: transform .08s, box-shadow .08s;
    }
    .b-btn-p:hover:not(:disabled) { transform: translate(2px, 2px); box-shadow: 1px 1px 0 #000; }
    .b-btn-p:disabled { opacity: 0.35; cursor: not-allowed; box-shadow: none; }

    .b-btn-s {
      background: transparent; color: #e8e8e0;
      border: 2px solid #555; border-radius: 0;
      padding: 9px 20px;
      font-family: 'Courier New', monospace; font-size: 11px;
      cursor: pointer; letter-spacing: 2px;
      transition: border-color .08s, color .08s, box-shadow .08s, transform .08s;
    }
    .b-btn-s:hover:not(:disabled) {
      border-color: #ffcc44; color: #ffcc44;
      box-shadow: 3px 3px 0 #ffcc44;
      transform: translate(-2px, -2px);
    }
    .b-btn-s:disabled { opacity: 0.35; cursor: not-allowed; }

    .b-btn-g {
      background: transparent; color: #33cc55;
      border: 2px solid #33cc55; border-radius: 0;
      padding: 9px 20px;
      font-family: 'Courier New', monospace; font-size: 11px; font-weight: bold;
      cursor: pointer; letter-spacing: 2px;
      transition: background .08s, box-shadow .08s, transform .08s;
    }
    .b-btn-g:hover:not(:disabled) {
      background: rgba(51,204,85,0.08);
      box-shadow: 3px 3px 0 #33cc55;
      transform: translate(-2px, -2px);
    }
    .b-btn-g:disabled { opacity: 0.35; cursor: not-allowed; }

    .b-input {
      width: 100%; box-sizing: border-box;
      background: #000; border: 2px solid #333; border-radius: 0;
      color: #e8e8e0; font-family: 'Courier New', monospace; font-size: 11px;
      padding: 8px 10px; margin-top: 4px;
      transition: border-color .1s;
    }
    .b-input:focus { border-color: #ffcc44; outline: none; }
    .b-input::placeholder { color: #333; }

    .b-scrollbar::-webkit-scrollbar { width: 4px; }
    .b-scrollbar::-webkit-scrollbar-track { background: #000; border-left: 1px solid #222; }
    .b-scrollbar::-webkit-scrollbar-thumb { background: #444; }
    .b-scrollbar::-webkit-scrollbar-thumb:hover { background: #ffcc44; }

    .b-star { background: none; border: none; cursor: pointer; font-size: 22px; padding: 2px 3px; line-height: 1; transition: transform .08s; }
    .b-star:hover { transform: scale(1.3); }
  `
  document.head.appendChild(s)
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export class BrowseModal {
  private _el:      HTMLElement
  private _overlay: HTMLElement
  private _rows:    CircuitRow[] = []
  private _page     = 0
  private _loading  = false
  private _flipIv   = 0

  onLoad?: (payload: CircuitPayload) => void
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
      background:    C.bg,
      border:        `2px solid ${C.amber}`,
      borderRadius:  '0',
      width:         '680px',
      maxWidth:      '96vw',
      maxHeight:     '86vh',
      display:       'flex',
      flexDirection: 'column',
      fontFamily:    "'Courier New', monospace",
      color:         C.white,
      boxShadow:     `8px 8px 0 0 ${C.amber}`,
      overflow:      'hidden',
    })

    this._overlay.appendChild(this._el)
    document.body.appendChild(this._overlay)
    this._overlay.addEventListener('click', e => { if (e.target === this._overlay) this.close() })
  }

  // ── Public ──────────────────────────────────────────────────────────────────

  async open() {
    this._overlay.style.display = 'flex'
    this._el.classList.remove('b-modal')
    void this._el.offsetWidth
    this._el.classList.add('b-modal')
    this._page = 0
    this._rows = []
    this._renderShell()
    await this._fetchPage()
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

  // ── Shell ─────────────────────────────────────────────────────────────────

  private _renderShell() {
    this._el.innerHTML = `
      <!-- Amber header bar -->
      <div style="background:${C.amber};padding:10px 20px;
        display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:10px;font-weight:900;letter-spacing:1px;color:#000">►</span>
          <span style="font-size:10px;font-weight:900;letter-spacing:4px;color:#000">
            EXPLORER LES CIRCUITS</span>
          <span style="font-size:9px;color:rgba(0,0,0,0.5);letter-spacing:2px">
            — PAGE ${this._page + 1}</span>
        </div>
        <button id="br-close"
          style="background:#000;border:none;color:${C.amber};
            font-size:18px;font-weight:900;cursor:pointer;
            width:26px;height:26px;display:flex;align-items:center;justify-content:center;
            transition:background .1s"
          onmouseover="this.style.background='#333'"
          onmouseout="this.style.background='#000'">×</button>
      </div>

      <!-- Column headers (departure board) -->
      <div style="display:flex;padding:6px 20px;
        background:#111;border-bottom:2px solid ${C.dimmer};flex-shrink:0">
        <span style="flex:2;font-size:8px;color:${C.dim};letter-spacing:3px">DESTINATION</span>
        <span style="flex:1;font-size:8px;color:${C.dim};letter-spacing:3px;text-align:center">CONDUCTEUR</span>
        <span style="flex:1;font-size:8px;color:${C.dim};letter-spacing:3px;text-align:right">NOTE</span>
      </div>

      <!-- Grid -->
      <div id="br-grid" class="b-scrollbar"
        style="flex:1;overflow-y:auto;display:grid;
          grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:0;
          border-bottom:2px solid ${C.dimmer}">
      </div>

      <!-- Footer -->
      <div style="display:flex;justify-content:space-between;align-items:center;
        padding:12px 20px;background:#0a0a0a;border-top:2px solid ${C.dimmer};flex-shrink:0">
        <span id="br-count" style="font-size:8px;color:${C.dim};letter-spacing:2px">
          — CIRCUITS EN SERVICE</span>
        <div style="display:flex;gap:8px">
          <button id="br-prev" class="b-btn-s" disabled>← PRÉC.</button>
          <button id="br-next" class="b-btn-s">SUIV. →</button>
        </div>
      </div>
    `
    this._el.querySelector('#br-close')!.addEventListener('click', () => this.close())
    this._el.querySelector('#br-prev')!.addEventListener('click', () => this._prevPage())
    this._el.querySelector('#br-next')!.addEventListener('click', () => this._nextPage())
  }

  // ── Loading flip-flap ──────────────────────────────────────────────────────

  private _showLoading(grid: HTMLElement) {
    this._stopFlip()
    const TEXT = 'CHARGEMENT'
    grid.innerHTML = `
      <div style="grid-column:1/-1;display:flex;flex-direction:column;
        align-items:center;justify-content:center;padding:60px 0;gap:20px">
        <div style="display:flex;gap:2px" id="br-flip-cells">
          ${Array.from(TEXT).map(() => `
            <div style="width:26px;height:40px;background:#000;
              border:2px solid #333;border-top:2px solid #444;
              display:flex;align-items:center;justify-content:center;
              font-size:16px;font-weight:900;color:${C.dim};
              position:relative">
              <div style="position:absolute;bottom:0;left:0;right:0;height:1px;background:#222"></div>
              ·
            </div>
          `).join('')}
        </div>
        <div style="font-size:8px;color:${C.dimmer};letter-spacing:6px">EN TRANSIT</div>
      </div>
    `
    const cells = Array.from(grid.querySelectorAll('#br-flip-cells > div')) as HTMLElement[]
    const target = Array.from(TEXT)
    let step = 0
    this._flipIv = window.setInterval(() => {
      step++
      cells.forEach((cell, i) => {
        const inner = cell.firstChild as Text
        if (step > i * 2 + 1) {
          cell.childNodes[0].textContent = target[i]
          cell.style.color = C.amber
          cell.style.borderColor = C.amber
          cell.style.borderTopColor = C.orange
        } else {
          cell.childNodes[0].textContent = rndChar()
          cell.style.color = C.dim
          cell.style.borderColor = '#333'
          cell.style.borderTopColor = '#444'
        }
      })
      if (step >= TEXT.length * 2 + 6) { step = -4 }
    }, 70)
  }

  private _stopFlip() {
    if (this._flipIv) { clearInterval(this._flipIv); this._flipIv = 0 }
  }

  // ── Fetch ─────────────────────────────────────────────────────────────────

  private async _fetchPage() {
    if (this._loading) return
    this._loading = true
    const grid = this._el.querySelector('#br-grid') as HTMLElement
    this._showLoading(grid)

    try {
      const rows = await listCircuits(12, this._page * 12)
      this._rows = rows
      this._stopFlip()
      this._renderGrid()
      const count = this._el.querySelector('#br-count') as HTMLElement
      if (count) count.textContent = `${rows.length} CIRCUITS EN SERVICE`
    } catch (err: any) {
      this._stopFlip()
      grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:60px 20px;
          border:2px solid ${C.red};margin:20px;box-shadow:4px 4px 0 ${C.red}">
          <div style="font-size:12px;color:${C.red};letter-spacing:2px;font-weight:900;margin-bottom:8px">
            ✕ ERREUR DE TRANSIT</div>
          <div style="font-size:9px;color:${C.dim}">${esc(err.message ?? String(err))}</div>
        </div>`
    } finally {
      this._loading = false
      this._updatePagination()
    }
  }

  // ── Grid ──────────────────────────────────────────────────────────────────

  private _renderGrid() {
    const grid = this._el.querySelector('#br-grid') as HTMLElement
    if (this._rows.length === 0) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:60px 0">
          <div style="font-size:48px;opacity:0.06;margin-bottom:16px">🚂</div>
          <div style="font-size:9px;color:${C.dim};letter-spacing:4px">
            AUCUN CIRCUIT EN SERVICE</div>
        </div>`
      return
    }

    grid.innerHTML = this._rows.map((row, i) => `
      <div class="b-card" data-i="${i}"
        style="animation-delay:${i * 35}ms;border-right:0;border-bottom:0">
        ${row.preview_url
          ? `<div style="overflow:hidden;height:90px;background:#000">
               <img src="${row.preview_url}"
                 style="width:100%;height:100%;object-fit:cover;display:block;
                   filter:grayscale(15%) contrast(1.05) brightness(0.8)">
             </div>`
          : `<div style="height:90px;background:#000;
               display:flex;align-items:center;justify-content:center;
               border-bottom:1px solid #222">
               <span style="font-size:30px;opacity:0.08">🚂</span>
             </div>`
        }
        <div style="padding:10px 10px 10px">
          <!-- Status indicator + name -->
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
            <span style="color:${C.orange};font-size:9px;font-weight:900">►</span>
            <div style="font-size:12px;font-weight:900;color:${C.amber};letter-spacing:1px;
              white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${esc(row.name)}</div>
          </div>
          <!-- Creator -->
          <div style="font-size:8px;color:${C.dim};letter-spacing:2px;
            margin-left:15px;margin-bottom:6px;
            text-transform:uppercase">
            ${esc(row.creator)}</div>
          <!-- Divider -->
          <div style="height:1px;background:#1a1a1a;margin-bottom:7px"></div>
          <!-- Stars + count -->
          <div style="display:flex;align-items:center;justify-content:space-between">
            <span style="color:${C.amber};font-size:12px;letter-spacing:3px">
              ${starsDisplay(row.avgScore ?? 0)}</span>
            <span style="font-size:8px;color:${C.dimmer};letter-spacing:1px">
              ${row.ratingCount ?? 0}&nbsp;NOTE${(row.ratingCount ?? 0) !== 1 ? 'S' : ''}</span>
          </div>
          <!-- Date -->
          <div style="font-size:8px;color:#2a2a2a;margin-top:6px;letter-spacing:1px">
            ${new Date(row.created_at).toLocaleDateString('fr-FR').replace(/\//g, '.')}</div>
        </div>
      </div>
    `).join('')

    // Add right/bottom borders via JS to create unified grid
    grid.querySelectorAll('.b-card').forEach((card, i) => {
      const el = card as HTMLElement
      const cols = Math.floor(grid.offsetWidth / 192) || 3
      if ((i + 1) % cols !== 0) el.style.borderRight = `1px solid #222`
      el.style.borderBottom = `1px solid #222`

      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.i!)
        this._openDetail(this._rows[idx])
      })
    })
  }

  // ── Detail ────────────────────────────────────────────────────────────────

  private async _openDetail(row: CircuitRow) {
    const myRating = await getMyRating(row.id)
    const myScore  = myRating?.score ?? 0

    this._el.innerHTML = `
      <!-- Header bar -->
      <div style="background:${C.amber};padding:10px 20px;
        display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:10px;font-weight:900;letter-spacing:1px;color:#000">►</span>
          <span style="font-size:10px;font-weight:900;letter-spacing:4px;color:#000">
            DÉTAIL DU CIRCUIT</span>
        </div>
        <button id="br-close"
          style="background:#000;border:none;color:${C.amber};
            font-size:18px;font-weight:900;cursor:pointer;
            width:26px;height:26px;display:flex;align-items:center;justify-content:center;
            transition:background .1s"
          onmouseover="this.style.background='#333'"
          onmouseout="this.style.background='#000'">×</button>
      </div>

      <div class="b-scrollbar" style="flex:1;overflow-y:auto">
        <!-- Ticket block -->
        <div style="border-bottom:2px solid ${C.dimmer};padding:20px">
          <div style="display:flex;gap:16px;align-items:flex-start">
            ${row.preview_url
              ? `<img src="${row.preview_url}"
                   style="width:140px;height:94px;object-fit:cover;flex-shrink:0;
                     border:2px solid ${C.dimmer};
                     filter:grayscale(15%) contrast(1.05) brightness(0.85)">`
              : `<div style="width:140px;height:94px;flex-shrink:0;
                   border:2px solid ${C.dimmer};background:#000;
                   display:flex;align-items:center;justify-content:center">
                   <span style="font-size:30px;opacity:0.08">🚂</span>
                 </div>`
            }
            <div style="flex:1;min-width:0">
              <div style="font-size:8px;color:${C.dim};letter-spacing:3px;margin-bottom:4px">
                DESTINATION</div>
              <div style="font-size:18px;font-weight:900;color:${C.amber};letter-spacing:1px;
                margin-bottom:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                ${esc(row.name)}</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div>
                  <div style="font-size:8px;color:${C.dim};letter-spacing:3px">CONDUCTEUR</div>
                  <div style="font-size:11px;color:${C.white};font-weight:700;margin-top:3px">
                    ${esc(row.creator).toUpperCase()}</div>
                </div>
                ${row.description ? `
                <div>
                  <div style="font-size:8px;color:${C.dim};letter-spacing:3px">NOTE</div>
                  <div style="font-size:9px;color:#aaa;margin-top:3px;
                    white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                    ${esc(row.description)}</div>
                </div>` : ''}
              </div>
              <div style="margin-top:12px;display:flex;align-items:center;gap:8px">
                <span style="color:${C.amber};font-size:14px;letter-spacing:3px">
                  ${starsDisplay(row.avgScore ?? 0)}</span>
                <span style="font-size:8px;color:${C.dim}">
                  ${row.ratingCount ?? 0} NOTE${(row.ratingCount ?? 0) !== 1 ? 'S' : ''}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Rating block -->
        <div style="padding:20px">
          <div style="font-size:8px;color:${C.dim};letter-spacing:3px;margin-bottom:10px">
            TA NOTE</div>
          <div style="display:flex;gap:4px;margin-bottom:14px" id="det-stars">
            ${[1,2,3,4,5].map(n => `
              <button class="b-star det-star" data-v="${n}"
                style="opacity:${n <= myScore ? '1' : '0.2'};
                  color:${n <= myScore ? C.amber : C.dim}">★</button>
            `).join('')}
          </div>
          <textarea id="det-comment" rows="2" maxlength="200"
            placeholder="UN COMMENTAIRE… (OPTIONNEL)"
            class="b-input" style="resize:vertical">${myRating?.comment ?? ''}</textarea>
          <div id="det-status" style="font-size:10px;min-height:16px;margin-top:8px;
            letter-spacing:2px;font-weight:700"></div>
        </div>
      </div>

      <!-- Footer actions -->
      <div style="display:flex;gap:8px;padding:12px 20px;
        background:#0a0a0a;border-top:2px solid ${C.dimmer};flex-shrink:0">
        <button id="det-back" class="b-btn-s">← RETOUR</button>
        <button id="det-rate" class="b-btn-g">NOTER ★</button>
        <div style="flex:1"></div>
        <button id="det-load" class="b-btn-p">CHARGER →</button>
      </div>
    `

    this._el.querySelector('#br-close')!.addEventListener('click', () => this.close())
    this._el.querySelector('#det-back')!.addEventListener('click', () => {
      this._renderShell()
      this._renderGrid()
      this._updatePagination()
    })
    this._el.querySelector('#det-load')!.addEventListener('click', () => {
      this.onLoad?.(row.payload)
      this.close()
    })

    let selectedScore = myScore
    const starBtns = this._el.querySelectorAll('.det-star')
    const refreshStars = (n: number) => {
      starBtns.forEach(b => {
        const v = parseInt((b as HTMLElement).dataset.v!)
        ;(b as HTMLElement).style.opacity = v <= n ? '1' : '0.2'
        ;(b as HTMLElement).style.color   = v <= n ? C.amber : C.dim
      })
    }
    starBtns.forEach(b => {
      b.addEventListener('mouseenter', () => refreshStars(parseInt((b as HTMLElement).dataset.v!)))
      b.addEventListener('mouseleave', () => refreshStars(selectedScore))
      b.addEventListener('click',      () => { selectedScore = parseInt((b as HTMLElement).dataset.v!); refreshStars(selectedScore) })
    })
    refreshStars(selectedScore)

    this._el.querySelector('#det-rate')!.addEventListener('click', async () => {
      if (selectedScore === 0) return
      const comment = (this._el.querySelector('#det-comment') as HTMLTextAreaElement).value
      const status  = this._el.querySelector('#det-status') as HTMLElement
      const btn     = this._el.querySelector('#det-rate') as HTMLButtonElement
      btn.disabled = true; btn.textContent = 'ENVOI…'
      try {
        await submitRating(row.id, selectedScore, comment)
        status.style.color = C.green
        status.textContent = '✓ NOTE ENREGISTRÉE'
        btn.textContent = 'NOTÉ !'
      } catch (err: any) {
        status.style.color = C.red
        status.textContent = `✕ ${err.message ?? err}`
        btn.disabled = false; btn.textContent = 'NOTER ★'
      }
    })
  }

  // ── Pagination ────────────────────────────────────────────────────────────

  private _updatePagination() {
    const prev = this._el.querySelector('#br-prev') as HTMLButtonElement | null
    const next = this._el.querySelector('#br-next') as HTMLButtonElement | null
    if (prev) prev.disabled = this._page === 0
    if (next) next.disabled = this._rows.length < 12
  }

  private async _prevPage() { if (this._page === 0) return; this._page--; await this._fetchPage() }
  private async _nextPage() { this._page++; await this._fetchPage() }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function starsDisplay(avg: number): string {
  const full = Math.round(avg)
  return [1,2,3,4,5].map(i =>
    `<span style="opacity:${i <= full ? '1' : '0.18'}">${i <= full ? '★' : '☆'}</span>`
  ).join('')
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]!))
}
