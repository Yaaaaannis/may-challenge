import * as THREE from 'three'
import { Derail } from '../physics/Derail.js'
import { Wagon } from '../train/Wagon.js'

const TRAIN_Y       = 0.36
const PUNCH_PLANE_Y = TRAIN_Y + 0.5
const PUNCH_DURATION = 0.55
const PUNCH_RANGE    = 1.6
const LOCO_FORCE     = 3.5
const WAGON_FORCE    = 2.5

export interface FistTarget {
  group: THREE.Group
  wagon: Wagon | null   // null = loco
}

export class FistMode {
  active = false

  private scene:    THREE.Scene
  private camera:   THREE.Camera
  private renderer: THREE.WebGLRenderer
  private derail:   Derail
  private getTargets: () => FistTarget[]
  private onDerail:   (target: FistTarget) => void

  private fistGroup = new THREE.Group()
  private fistMesh:  THREE.Mesh

  private punching  = false
  private punchTime = 0
  private punchBase = new THREE.Vector3()
  private punchHit  = false

  private punchPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -PUNCH_PLANE_Y)
  private pointer    = new THREE.Vector2()
  private worldPos   = new THREE.Vector3()
  private raycaster  = new THREE.Raycaster()

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    derail: Derail,
    getTargets: () => FistTarget[],
    onDerail: (target: FistTarget) => void,
  ) {
    this.scene      = scene
    this.camera     = camera
    this.renderer   = renderer
    this.derail     = derail
    this.getTargets = getTargets
    this.onDerail   = onDerail

    const geo = new THREE.SphereGeometry(0.22, 10, 10)
    const mat = new THREE.MeshStandardMaterial({ color: 0xf5cba7, roughness: 0.8 })
    this.fistMesh = new THREE.Mesh(geo, mat)
    this.fistMesh.castShadow = true
    this.fistGroup.add(this.fistMesh)
    this.fistGroup.visible = false
    scene.add(this.fistGroup)

    renderer.domElement.addEventListener('mousemove', this._onMouseMove)
    renderer.domElement.addEventListener('click', this._onClick)
  }

  toggle() {
    this.active = !this.active
    this.fistGroup.visible = this.active
    this.renderer.domElement.style.cursor = this.active ? 'crosshair' : ''
    return this.active
  }

  update(dt: number) {
    if (!this.active) return

    this.raycaster.setFromCamera(this.pointer, this.camera)
    this.raycaster.ray.intersectPlane(this.punchPlane, this.worldPos)

    if (this.punching) {
      this.punchTime += dt
      const progress = Math.min(this.punchTime / PUNCH_DURATION, 1)
      const yOffset  = -Math.sin(progress * Math.PI) * 0.9

      this.fistGroup.position.set(
        this.punchBase.x,
        PUNCH_PLANE_Y + yOffset,
        this.punchBase.z,
      )

      if (!this.punchHit && progress >= 0.48) {
        this.punchHit = true
        this._checkImpact()
      }

      if (progress >= 1) this.punching = false
    } else {
      this.fistGroup.position.set(this.worldPos.x, PUNCH_PLANE_Y, this.worldPos.z)
    }
  }

  private _checkImpact() {
    const fistPos = this.fistGroup.position
    for (const target of this.getTargets()) {
      // Sauter les groupes déjà déraillés
      if (this.derail.hasBody(target.group)) continue

      const objPos = new THREE.Vector3()
      target.group.getWorldPosition(objPos)

      if (fistPos.distanceTo(objPos) < PUNCH_RANGE) {
        // Notifier le contrôleur avant de détacher le groupe
        this.onDerail(target)

        const vel = new THREE.Vector3(
          (Math.random() - 0.5) * 3,
          2.0,
          (Math.random() - 0.5) * 3,
        )
        const halfExtents = target.wagon === null
          ? new THREE.Vector3(0.95, 0.40, 0.35)   // loco
          : new THREE.Vector3(0.65, 0.32, 0.31)   // wagon

        this.derail.derailMesh(
          target.group,
          vel,
          this.scene,
          target.wagon === null ? LOCO_FORCE : WAGON_FORCE,
          halfExtents,
        )
      }
    }
  }

  private _onMouseMove = (e: MouseEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
  }

  private _onClick = () => {
    if (!this.active || this.punching) return
    this.punching  = true
    this.punchTime = 0
    this.punchHit  = false
    this.punchBase.copy(this.worldPos)
  }

  dispose() {
    this.renderer.domElement.removeEventListener('mousemove', this._onMouseMove)
    this.renderer.domElement.removeEventListener('click', this._onClick)
    this.fistMesh.geometry.dispose()
    ;(this.fistMesh.material as THREE.Material).dispose()
    this.scene.remove(this.fistGroup)
  }
}
