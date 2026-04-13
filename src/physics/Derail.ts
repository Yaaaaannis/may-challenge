import * as THREE from 'three'
import { PhysicsWorld } from './PhysicsWorld.js'
import type RAPIER_TYPE from '@dimforge/rapier3d-compat'

interface DerailedEntry {
  body: RAPIER_TYPE.RigidBody
}

export class Derail {
  private entries = new Map<THREE.Object3D, DerailedEntry>()
  private physics: PhysicsWorld

  constructor(physics: PhysicsWorld) {
    this.physics = physics
  }

  /**
   * Detach a group from its parent, copy world transform, and hand it to Rapier.
   * halfExtents: half-sizes of the approximate AABB collider.
   */
  derailMesh(
    mesh: THREE.Object3D,
    velocity: THREE.Vector3,
    scene: THREE.Scene,
    force = 2.5,
    halfExtents = new THREE.Vector3(0.65, 0.32, 0.31),
  ) {
    if (!this.physics.isReady) return
    if (this.entries.has(mesh)) return  // déjà en physique

    const RAPIER = this.physics.rapierLib

    // Capture world transform avant de détacher
    const pos  = new THREE.Vector3()
    const quat = new THREE.Quaternion()
    mesh.getWorldPosition(pos)
    mesh.getWorldQuaternion(quat)

    mesh.parent?.remove(mesh)
    mesh.position.copy(pos)
    mesh.quaternion.copy(quat)
    scene.add(mesh)

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
      .setLinvel(velocity.x, velocity.y, velocity.z)

    const body = this.physics.world.createRigidBody(bodyDesc)

    this.physics.world.createCollider(
      RAPIER.ColliderDesc
        .cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
        .setRestitution(0.3)
        .setFriction(0.8),
      body,
    )

    // Impulsion latérale + torque aléatoire
    body.applyImpulse({
      x: (Math.random() - 0.5) * force,
      y: force * 0.4,
      z: (Math.random() - 0.5) * force,
    }, true)
    body.applyTorqueImpulse({
      x: (Math.random() - 0.5) * force * 0.5,
      y: (Math.random() - 0.5) * force * 0.5,
      z: (Math.random() - 0.5) * force * 0.5,
    }, true)

    this.entries.set(mesh, { body })
  }

  /** Remove a single physics body (e.g. before re-railing). Mesh stays in scene. */
  removeBody(mesh: THREE.Object3D) {
    const entry = this.entries.get(mesh)
    if (!entry) return
    this.physics.world.removeRigidBody(entry.body)
    this.entries.delete(mesh)
  }

  /** Current linear velocity of a physics body (for throw-on-release). */
  getLinvel(mesh: THREE.Object3D): THREE.Vector3 | null {
    const entry = this.entries.get(mesh)
    if (!entry) return null
    const v = entry.body.linvel()
    return new THREE.Vector3(v.x, v.y, v.z)
  }

  hasBody(mesh: THREE.Object3D) { return this.entries.has(mesh) }

  /** Current positions of all derailed bodies (pour détection de collision). */
  getDerailedPositions(): { mesh: THREE.Object3D; pos: THREE.Vector3 }[] {
    const result: { mesh: THREE.Object3D; pos: THREE.Vector3 }[] = []
    for (const [mesh] of this.entries) {
      const pos = new THREE.Vector3()
      mesh.getWorldPosition(pos)
      result.push({ mesh, pos })
    }
    return result
  }

  /** Applique une impulsion à un corps déraillé (ex: poussé par le train). */
  applyImpulse(mesh: THREE.Object3D, impulse: THREE.Vector3) {
    const entry = this.entries.get(mesh)
    if (!entry) return
    entry.body.applyImpulse({ x: impulse.x, y: impulse.y, z: impulse.z }, true)
  }

  /** Sync all meshes to their Rapier body each frame. */
  update() {
    if (!this.physics.isReady) return
    for (const [mesh, { body }] of this.entries) {
      const t = body.translation()
      const r = body.rotation()
      mesh.position.set(t.x, t.y, t.z)
      mesh.quaternion.set(r.x, r.y, r.z, r.w)
    }
  }

  /** Remove all physics bodies and their meshes from the scene. */
  clear(scene: THREE.Scene) {
    for (const [mesh, { body }] of this.entries) {
      scene.remove(mesh)
      this.physics.world.removeRigidBody(body)
    }
    this.entries.clear()
  }

  get count() { return this.entries.size }
}
