import * as THREE from 'three'
import { CIRCUITS, TrackCircuit, CurveFn } from './curves.js'
import { buildTrack, cloneGroupMaterials, setGroupOpacity, disposeGroup } from './TrackBuilder.js'
import { SwitchData, Segment } from './TrackEditor.js'
import { TwoSwitchPreset, createTwoSwitchPreset } from './presets.js'
import type { CircuitPayload } from '../supabase/types.js'

// ── Internal types ────────────────────────────────────────────────────────────

interface SwitchEntry {
  groupA:       THREE.Group
  groupB:       THREE.Group
  active:       'A' | 'B'
  indicator:    THREE.Mesh
  indicatorMat: THREE.MeshStandardMaterial
  forkPos:      { x: number; y: number; z: number }
}

interface MultiMode {
  /** Groups that are always at full opacity (shared prefix / shared arcs). */
  sharedGroups: THREE.Group[]
  /** Per-switch data. */
  switches: SwitchEntry[]
  /** Given current switch states, return the active CurveFn. */
  resolveFn: (states: ('A' | 'B')[]) => CurveFn
}

// ── TrackManager ──────────────────────────────────────────────────────────────

export class TrackManager {
  private scene:         THREE.Scene
  private _circuitIndex  = 0
  private _customFn:     CurveFn | null = null
  private _currentGroup: THREE.Group | null = null

  // Multi-switch state (replaces old _switchData / _switchActive / _switchIndicator)
  private _multi: MultiMode | null = null
  private _activeCurveFn: CurveFn | null = null   // cached resolved fn

  /** Serialisable representation of the current circuit — ready for Supabase. */
  private _payload: CircuitPayload = { kind: 'preset', index: 0 }

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  // ── Getters ───────────────────────────────────────────────────────────────

  get circuitIndex() { return this._circuitIndex }
  get circuit(): TrackCircuit { return CIRCUITS[this._circuitIndex] }
  /** Current circuit as a JSON-serialisable payload. */
  get currentPayload(): CircuitPayload { return this._payload }

  /** Show or hide all current track geometry (e.g. while the editor is open). */
  setVisible(visible: boolean) {
    if (this._currentGroup) this._currentGroup.visible = visible
    if (this._multi) {
      for (const g of this._multi.sharedGroups) g.visible = visible
      for (const sw of this._multi.switches) {
        sw.groupA.visible  = visible
        sw.groupB.visible  = visible
        sw.indicator.visible = visible
      }
    }
  }

  get curveFn(): CurveFn {
    if (this._activeCurveFn) return this._activeCurveFn
    return this._customFn ?? this.circuit.fn
  }

  get hasSwitch()       { return this._multi !== null }
  get switchIndicators(): THREE.Mesh[] {
    return this._multi?.switches.map(s => s.indicator) ?? []
  }

  /** @deprecated use switchIndicators */
  get switchIndicator(): THREE.Mesh | null {
    return this._multi?.switches[0]?.indicator ?? null
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  init() {
    this._buildSingleTrack(this._circuitIndex)
  }

  // ── Circuit switching ─────────────────────────────────────────────────────

  setCircuit(index: number) {
    if (index < 0 || index >= CIRCUITS.length) return
    this._customFn      = null
    this._circuitIndex  = index
    this._activeCurveFn = null
    this._payload       = { kind: 'preset', index }
    this._clearMulti()
    this._buildSingleTrack(index)
  }

  setCustomTrack(fn: CurveFn, segments: Segment[] = []) {
    this._customFn      = fn
    this._activeCurveFn = null
    this._payload       = { kind: 'simple', segments }
    this._clearMulti()
    this._buildFromFn(fn)
  }

  // ── Single-switch custom track ────────────────────────────────────────────

  setCustomTrackWithSwitch(fnA: CurveFn, switchData: SwitchData) {
    this._customFn = fnA
    this._clearMulti()

    // Build both full-loop groups (shared prefix is duplicated but that's fine)
    const { group: groupA } = buildTrack(fnA)
    const { group: groupB } = buildTrack(switchData.fnB)

    cloneGroupMaterials(groupA)
    cloneGroupMaterials(groupB)
    setGroupOpacity(groupA, 1.0)
    setGroupOpacity(groupB, 0.25)

    this.scene.add(groupA, groupB)
    this._currentGroup = null  // multi-mode manages its own groups

    const indicator    = this._makeIndicator(switchData.forkPos, true)
    const indicatorMat = (indicator.material as THREE.MeshStandardMaterial)

    const entry: SwitchEntry = {
      groupA, groupB,
      active: 'A',
      indicator, indicatorMat,
      forkPos: switchData.forkPos,
    }

    this._multi = {
      sharedGroups: [],
      switches: [entry],
      resolveFn: ([s0]) => s0 === 'A' ? fnA : switchData.fnB,
    }
    this._activeCurveFn = fnA
    this._payload = {
      kind: 'switch',
      prefix:  switchData.prefix  ?? [],
      pathA:   switchData.pathA   ?? [],
      pathB:   switchData.pathB   ?? [],
      forkPos: switchData.forkPos,
    }
  }

  // ── Two-switch preset ─────────────────────────────────────────────────────

  setPresetTwoSwitch() {
    this._customFn = null
    this._clearMulti()

    const preset = createTwoSwitchPreset()

    this.scene.add(
      preset.topGroup, preset.botGroup,
      preset.leftAGroup, preset.leftBGroup,
      preset.rightAGroup, preset.rightBGroup,
    )
    this._currentGroup = null

    const sw0 = this._buildSwitchEntry(
      preset.leftAGroup, preset.leftBGroup, preset.sw0ForkPos,
    )
    const sw1 = this._buildSwitchEntry(
      preset.rightAGroup, preset.rightBGroup, preset.sw1ForkPos,
    )

    const fnMap: Record<string, CurveFn> = {
      AA: preset.fnAA, AB: preset.fnAB,
      BA: preset.fnBA, BB: preset.fnBB,
    }

    this._multi = {
      sharedGroups: [preset.topGroup, preset.botGroup],
      switches: [sw0, sw1],
      resolveFn: ([s0, s1]) => fnMap[`${s0}${s1}`],
    }
    this._activeCurveFn = preset.fnAA
    this._payload = { kind: 'preset', index: -1 }  // two-switch preset has no index
  }

  // ── Toggle a switch ───────────────────────────────────────────────────────

  /** Toggle switch at index. Returns the new active CurveFn, or null. */
  toggleSwitch(index = 0): CurveFn | null {
    if (!this._multi) return null
    const sw = this._multi.switches[index]
    if (!sw) return null

    sw.active = sw.active === 'A' ? 'B' : 'A'

    setGroupOpacity(sw.groupA, sw.active === 'A' ? 1.0 : 0.25)
    setGroupOpacity(sw.groupB, sw.active === 'B' ? 1.0 : 0.25)

    sw.indicatorMat.color.set(sw.active === 'A' ? 0x06d6a0 : 0xf4a261)
    sw.indicatorMat.emissive.set(sw.active === 'A' ? 0x03a87a : 0xcc5500)

    const states = this._multi.switches.map(s => s.active)
    this._activeCurveFn = this._multi.resolveFn(states)
    return this._activeCurveFn
  }

  // ── Dispose ───────────────────────────────────────────────────────────────

  dispose() {
    this._clearSingleGroup()
    this._clearMulti()
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _buildSingleTrack(index: number) {
    this._buildFromFn(CIRCUITS[index].fn)
  }

  private _buildFromFn(fn: CurveFn) {
    this._clearSingleGroup()
    const { group } = buildTrack(fn)
    this.scene.add(group)
    this._currentGroup = group
  }

  private _clearSingleGroup() {
    if (this._currentGroup) {
      this.scene.remove(this._currentGroup)
      this._currentGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) (obj as THREE.Mesh).geometry.dispose()
      })
      this._currentGroup = null
    }
  }

  private _clearMulti() {
    if (!this._multi) return

    for (const sw of this._multi.switches) {
      this.scene.remove(sw.groupA, sw.groupB)
      disposeGroup(sw.groupA)
      disposeGroup(sw.groupB)
      this.scene.remove(sw.indicator)
      sw.indicator.geometry.dispose()
      sw.indicatorMat.dispose()
    }
    for (const g of this._multi.sharedGroups) {
      this.scene.remove(g)
      disposeGroup(g)
    }
    this._multi = null
    this._activeCurveFn = null
  }

  private _makeIndicator(
    forkPos: { x: number; y: number; z: number },
    active: boolean,
  ): THREE.Mesh {
    const geo = new THREE.SphereGeometry(0.22, 12, 12)
    const mat = new THREE.MeshStandardMaterial({
      color:             active ? 0x06d6a0 : 0xf4a261,
      emissive:          active ? 0x03a87a : 0xcc5500,
      emissiveIntensity: 0.5,
      roughness: 0.3,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(forkPos.x, (forkPos.y ?? 0) + 0.6, forkPos.z)
    this.scene.add(mesh)
    return mesh
  }

  private _buildSwitchEntry(
    groupA: THREE.Group,
    groupB: THREE.Group,
    forkPos: { x: number; y: number; z: number },
  ): SwitchEntry {
    const indicator    = this._makeIndicator(forkPos, true)
    const indicatorMat = indicator.material as THREE.MeshStandardMaterial
    return { groupA, groupB, active: 'A', indicator, indicatorMat, forkPos }
  }
}
