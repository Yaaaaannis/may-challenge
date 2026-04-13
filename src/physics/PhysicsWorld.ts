import type RAPIER_TYPE from '@dimforge/rapier3d-compat'

type Rapier = typeof RAPIER_TYPE

export class PhysicsWorld {
  private rapier!: Rapier
  world!: RAPIER_TYPE.World
  private ready = false

  async init() {
    const RAPIER = await import('@dimforge/rapier3d-compat')
    await RAPIER.init()
    this.rapier = RAPIER

    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })

    // Sol statique
    const groundDesc = RAPIER.RigidBodyDesc.fixed()
    const ground     = this.world.createRigidBody(groundDesc)
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(50, 0.05, 50), ground)

    this.ready = true
  }

  get isReady() { return this.ready }

  /** Avance la simulation d'un pas. */
  step() {
    if (!this.ready) return
    this.world.step()
  }

  get rapierLib() { return this.rapier }

  dispose() {
    if (this.ready) this.world.free()
  }
}
