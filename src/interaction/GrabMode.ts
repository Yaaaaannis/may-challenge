import * as THREE from 'three'
import { Wagon } from '../train/Wagon.js'
import { TrainController } from '../train/TrainController.js'
import { Derail } from '../physics/Derail.js'
import { CurveFn, curvePoint, findNearestT } from '../track/curves.js'

const GRAB_HEIGHT    = 1.4    // hauteur de levée au-dessus de la position normale
const GRAB_LERP      = 0.18   // lissage du drag
const SNAP_THRESHOLD = 2.0    // distance max (u) pour clipping rail
const WAGON_Y        = 0.32
const VEL_HISTORY    = 8      // nb de frames pour calcul de vélocité
const THROW_SCALE    = 4.0    // amplification de la vélocité au lancer
const WAGON_COLORS   = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c]

interface PosEntry { pos: THREE.Vector3; time: number }

export class GrabMode {
  active = false

  private scene:      THREE.Scene
  private camera:     THREE.Camera
  private renderer:   THREE.WebGLRenderer
  private train:      TrainController
  private derail:     Derail
  private getTrackFn: () => CurveFn

  // État du grab courant
  private grabbed:      { group: THREE.Group; wagon: Wagon | null } | null = null
  private grabHeight    = GRAB_HEIGHT
  private grabPlane     = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private grabTarget    = new THREE.Vector3()   // position cible lissée
  private posHistory:   PosEntry[] = []
  private colorIdx      = 0

  // Visuels
  private ghostMesh:  THREE.Mesh | null = null
  private shadowBlob: THREE.Mesh | null = null

  // Hover
  private hovered: THREE.Group | null = null

  private pointer   = new THREE.Vector2()
  private raycaster = new THREE.Raycaster()

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    train: TrainController,
    derail: Derail,
    getTrackFn: () => CurveFn,
  ) {
    this.scene      = scene
    this.camera     = camera
    this.renderer   = renderer
    this.train      = train
    this.derail     = derail
    this.getTrackFn = getTrackFn

    this._buildGhost()
    this._buildShadowBlob()

    renderer.domElement.addEventListener('mousemove',  this._onMouseMove)
    renderer.domElement.addEventListener('mousedown',  this._onMouseDown)
    renderer.domElement.addEventListener('mouseup',    this._onMouseUp)
    renderer.domElement.addEventListener('wheel',      this._onWheel, { passive: true })
  }

  toggle() {
    this.active = !this.active
    if (!this.active && this.grabbed) this._release()
    if (!this.active) {
      this._clearGhost()
      this._clearHoverGlow()
    }
    return this.active
  }

  update(dt: number) {
    if (!this.active) return

    // ── Hover glow ─────────────────────────────────────────────────────────
    if (!this.grabbed) this._updateHover()

    // ── Drag ───────────────────────────────────────────────────────────────
    if (!this.grabbed) return

    const { group } = this.grabbed

    // Projection souris → plan horizontal à grabHeight
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hit = new THREE.Vector3()
    this.raycaster.ray.intersectPlane(this.grabPlane, hit)

    // Lerp vers cible
    this.grabTarget.lerp(hit, GRAB_LERP)
    group.position.set(this.grabTarget.x, this.grabHeight, this.grabTarget.z)

    // Historique positions
    this.posHistory.push({ pos: group.position.clone(), time: performance.now() })
    if (this.posHistory.length > VEL_HISTORY) this.posHistory.shift()

    // Ghost snap point
    const fn = this.getTrackFn()
    const nearest = findNearestT(fn, group.position, WAGON_Y)
    if (nearest.dist < SNAP_THRESHOLD) {
      if (this.ghostMesh) {
        this.ghostMesh.visible = true
        this.ghostMesh.position.copy(nearest.point)
      }
    } else {
      if (this.ghostMesh) this.ghostMesh.visible = false
    }

    // Shadow blob sous le wagon
    if (this.shadowBlob) {
      this.shadowBlob.visible = true
      this.shadowBlob.position.set(group.position.x, 0.01, group.position.z)
      const scale = Math.max(0.3, 1 - (group.position.y - WAGON_Y) / (GRAB_HEIGHT * 2))
      this.shadowBlob.scale.setScalar(scale)
    }
  }

  // ── Events ────────────────────────────────────────────────────────────────

  private _onMouseMove = (e: MouseEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width)  * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
  }

  private _onMouseDown = (e: MouseEvent) => {
    if (!this.active || e.button !== 0) return
    const hit = this._pickVehicle()
    if (!hit) return

    e.preventDefault()
    this.grabbed = hit

    // Si en physique : stopper la simulation, reprendre contrôle manuel
    if (this.derail.hasBody(hit.group)) {
      this.derail.removeBody(hit.group)
    } else {
      // Retirer du rail
      this.train.removeFromRail(hit.wagon)
    }

    // Hauteur de levée
    const worldPos = new THREE.Vector3()
    hit.group.getWorldPosition(worldPos)
    this.grabHeight = worldPos.y + GRAB_HEIGHT

    // Plan horizontal à la hauteur du grab
    this.grabPlane.constant = -this.grabHeight

    this.grabTarget.copy(hit.group.position)
    this.posHistory = []
    this.colorIdx   = WAGON_COLORS.indexOf(
      hit.wagon ? (hit.wagon as Wagon & { getColor(): number }).getColor?.() ?? 0 : 0,
    )

    this.renderer.domElement.style.cursor = 'grabbing'
    this._clearHoverGlow()
  }

  private _onMouseUp = (e: MouseEvent) => {
    if (!this.active || e.button !== 0 || !this.grabbed) return
    this._release()
  }

  private _onWheel = (e: WheelEvent) => {
    if (!this.active || !this.grabbed?.wagon) return
    const dir  = e.deltaY > 0 ? 1 : -1
    this.colorIdx = ((this.colorIdx + dir) % WAGON_COLORS.length + WAGON_COLORS.length) % WAGON_COLORS.length
    this.grabbed.wagon.setColor(WAGON_COLORS[this.colorIdx])
  }

  // ── Release logic ────────────────────────────────────────────────────────

  private _release() {
    if (!this.grabbed) return
    const { group, wagon } = this.grabbed

    const fn      = this.getTrackFn()
    const nearest = findNearestT(fn, group.position, WAGON_Y)

    this._clearGhost()
    if (this.shadowBlob) this.shadowBlob.visible = false

    if (nearest.dist < SNAP_THRESHOLD) {
      // ── SNAP : remettre sur le rail ──────────────────────────────────────
      group.position.copy(nearest.point)
      if (wagon === null) {
        this.train.rerailLoco(nearest.t)
      } else {
        // Re-attacher le group à la scène si besoin (il y est déjà après derail)
        this.train.rerailWagon(wagon, nearest.t)
      }
    } else {
      // ── THROW : lancer en physique ───────────────────────────────────────
      const vel = this._computeVelocity()
      const halfExtents = wagon === null
        ? new THREE.Vector3(0.95, 0.40, 0.35)
        : new THREE.Vector3(0.65, 0.32, 0.31)

      this.derail.derailMesh(group, vel, this.scene, 0, halfExtents)
      // force=0 car on fournit déjà une vélocité calculée
    }

    this.grabbed = null
    this.renderer.domElement.style.cursor = this.active ? 'grab' : ''
  }

  private _computeVelocity(): THREE.Vector3 {
    if (this.posHistory.length < 2) return new THREE.Vector3(0, 1, 0)
    const recent = this.posHistory.slice(-4)
    const first  = recent[0]
    const last   = recent[recent.length - 1]
    const dt     = (last.time - first.time) / 1000
    if (dt < 0.001) return new THREE.Vector3(0, 1, 0)
    return last.pos.clone().sub(first.pos).divideScalar(dt).multiplyScalar(THROW_SCALE)
  }

  // ── Hover ─────────────────────────────────────────────────────────────────

  private _updateHover() {
    const hit = this._pickVehicle()
    const newGroup = hit?.group ?? null

    if (newGroup !== this.hovered) {
      this._clearHoverGlow()
      this.hovered = newGroup
      if (newGroup) this._applyHoverGlow(newGroup, true)
    }

    this.renderer.domElement.style.cursor = newGroup ? 'grab' : ''
  }

  private _applyHoverGlow(group: THREE.Group, on: boolean) {
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.userData.isBody) {
        const mat = obj.material as THREE.MeshStandardMaterial
        mat.emissive.setHex(on ? 0x1a6fff : 0x000000)
        mat.emissiveIntensity = on ? 0.35 : 0
      }
    })
  }

  private _clearHoverGlow() {
    if (this.hovered) {
      this._applyHoverGlow(this.hovered, false)
      this.hovered = null
    }
  }

  // ── Pick ──────────────────────────────────────────────────────────────────

  private _pickVehicle(): { group: THREE.Group; wagon: Wagon | null } | null {
    this.raycaster.setFromCamera(this.pointer, this.camera)

    const grabbables = this.train.getGrabbables()
    const meshes: THREE.Mesh[] = []
    for (const v of grabbables) {
      v.group.traverse((obj) => { if (obj instanceof THREE.Mesh) meshes.push(obj) })
    }

    const hits = this.raycaster.intersectObjects(meshes, false)
    if (!hits.length) return null

    // Remonter au group parent connu
    let obj: THREE.Object3D | null = hits[0].object
    while (obj) {
      const match = grabbables.find(v => v.group === obj)
      if (match) return match
      obj = obj.parent
    }
    return null
  }

  // ── Visuels helpers ───────────────────────────────────────────────────────

  private _buildGhost() {
    const geo = new THREE.BoxGeometry(1.30, 0.64, 0.62)
    const mat = new THREE.MeshStandardMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    })
    this.ghostMesh = new THREE.Mesh(geo, mat)
    this.ghostMesh.visible = false
    this.scene.add(this.ghostMesh)
  }

  private _buildShadowBlob() {
    const geo = new THREE.CircleGeometry(0.6, 24)
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    })
    this.shadowBlob = new THREE.Mesh(geo, mat)
    this.shadowBlob.rotation.x = -Math.PI / 2
    this.shadowBlob.visible = false
    this.scene.add(this.shadowBlob)
  }

  private _clearGhost() {
    if (this.ghostMesh) this.ghostMesh.visible = false
  }

  // ── Dispose ───────────────────────────────────────────────────────────────

  dispose() {
    this.renderer.domElement.removeEventListener('mousemove', this._onMouseMove)
    this.renderer.domElement.removeEventListener('mousedown', this._onMouseDown)
    this.renderer.domElement.removeEventListener('mouseup',   this._onMouseUp)
    this.renderer.domElement.removeEventListener('wheel',     this._onWheel)

    this.ghostMesh?.geometry.dispose()
    ;(this.ghostMesh?.material as THREE.Material)?.dispose()
    if (this.ghostMesh) this.scene.remove(this.ghostMesh)

    this.shadowBlob?.geometry.dispose()
    ;(this.shadowBlob?.material as THREE.Material)?.dispose()
    if (this.shadowBlob) this.scene.remove(this.shadowBlob)
  }
}
