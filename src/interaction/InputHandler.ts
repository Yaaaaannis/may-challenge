export interface InputCallbacks {
  onSpeedUp: () => void
  onSpeedDown: () => void
  onWagonAdd: () => void
  onWagonRemove: () => void
  onWhistle: () => void
  onNightToggle: () => void
  onFistToggle: () => void
  onGrabToggle: () => void
  onPauseToggle: () => void
  onReset: () => void
  onCircuit: (i: number) => void
}

export class InputHandler {
  private _held = new Set<string>()

  constructor(private callbacks: InputCallbacks) {
    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup',   this._onKeyUp)
  }

  // ── Touches maintenues (caméra) ───────────────────────────────────────────

  /** Retourne { fwd, right } normalisés sur [-1, 0, 1]. */
  get cameraInput(): { fwd: number; right: number } {
    const fwd   = (this._held.has('z') || this._held.has('w') || this._held.has('ArrowUp')   ? 1 : 0)
                - (this._held.has('s') || this._held.has('ArrowDown') ? 1 : 0)
    const right = (this._held.has('d') || this._held.has('ArrowRight') ? 1 : 0)
                - (this._held.has('q') || this._held.has('a') || this._held.has('ArrowLeft') ? 1 : 0)
    return { fwd, right }
  }

  // ── Événements clavier ────────────────────────────────────────────────────

  private _onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return

    // Touches maintenues (mouvements caméra)
    const cam = ['z', 'w', 'q', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
    if (cam.includes(e.key)) {
      this._held.add(e.key)
      e.preventDefault()
      return
    }

    switch (e.key) {
      case '+':           this.callbacks.onWagonAdd();     break
      case '-':           this.callbacks.onWagonRemove();  break
      case ' ':           e.preventDefault(); this.callbacks.onWhistle();     break
      case 'n': case 'N': this.callbacks.onNightToggle();  break
      case 'h': case 'H': this.callbacks.onFistToggle();   break
      case 'g': case 'G': this.callbacks.onGrabToggle();   break
      case 'p': case 'P': this.callbacks.onPauseToggle();  break
      case 'r': case 'R': this.callbacks.onReset();        break
      case '1':           this.callbacks.onCircuit(0);     break
      case '2':           this.callbacks.onCircuit(1);     break
      case '3':           this.callbacks.onCircuit(2);     break
    }
  }

  private _onKeyUp = (e: KeyboardEvent) => {
    this._held.delete(e.key)
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup',   this._onKeyUp)
  }
}
