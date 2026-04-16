import * as THREE from 'three'

export class TrainCam {
  readonly camera: THREE.PerspectiveCamera

  constructor() {
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 200)
    window.addEventListener('resize', this._onResize)
  }

  private _onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
  }

  /** Met à jour la position de la caméra derrière/au-dessus de la loco. */
  update(locoGroup: THREE.Group) {
    const pos = new THREE.Vector3()
    const fwd = new THREE.Vector3()
    locoGroup.getWorldPosition(pos)
    locoGroup.getWorldDirection(fwd)

    const up = new THREE.Vector3(0, 1, 0)

    this.camera.position.copy(pos)
      .addScaledVector(fwd, -4.5)
      .addScaledVector(up,   2.2)

    const target = pos.clone().addScaledVector(fwd, 0.5).addScaledVector(up, 1.0)
    this.camera.lookAt(target)
  }

  dispose() {
    window.removeEventListener('resize', this._onResize)
  }
}
