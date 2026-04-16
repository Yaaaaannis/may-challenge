import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

export class Engine {
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  readonly controls: OrbitControls

  private _onTick:        ((dt: number) => void) | null = null
  private _onPostRender:  ((renderer: THREE.WebGLRenderer, scene: THREE.Scene) => void) | null = null
  private _lastTime = 0
  private _rafId = 0
  private _composer:   EffectComposer
  private _renderPass: RenderPass
  private _bloom:      UnrealBloomPass

  constructor() {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    document.body.appendChild(this.renderer.domElement)

    // Scene
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x87ceeb)
    this.scene.fog = new THREE.Fog(0x87ceeb, 20, 60)

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      200,
    )
    this.camera.position.set(0, 8, 14)

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.maxPolarAngle = Math.PI / 2.1
    this.controls.minDistance = 4
    this.controls.maxDistance = 40

    // ── Post-processing ───────────────────────────────────────────────────────
    this._composer = new EffectComposer(this.renderer)
    this._renderPass = new RenderPass(this.scene, this.camera)
    this._composer.addPass(this._renderPass)

    this._bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.1,    // strength
      0.55,   // radius
      0.76,   // threshold — only very bright emissives bloom
    )
    this._composer.addPass(this._bloom)
    this._composer.addPass(new OutputPass())

    window.addEventListener('resize', this._onResize)
  }

  /** Adjust bloom dynamically (e.g. brighter at night). */
  setBloom(strength: number, threshold = 0.76) {
    this._bloom.strength  = strength
    this._bloom.threshold = threshold
  }
  setBloomRadius(v: number)   { this._bloom.radius = v }
  setExposure(v: number)      { this.renderer.toneMappingExposure = v }

  /** Register the per-frame callback (dt in seconds). */
  setTickCallback(fn: (dt: number) => void) {
    this._onTick = fn
  }

  /** Register a callback called after the main composer render — for PiP/overlay renders. */
  setPostRenderCallback(fn: (renderer: THREE.WebGLRenderer, scene: THREE.Scene) => void) {
    this._onPostRender = fn
  }

  /** Remplace la caméra utilisée par le composer. Passer null pour revenir à la caméra principale. */
  setActiveCamera(cam: THREE.PerspectiveCamera | null) {
    this._renderPass.camera = cam ?? this.camera
  }

  /** Remet la caméra principale à sa position de départ. */
  resetCamera() {
    this.camera.position.set(0, 8, 14)
    this.controls.target.set(0, 0, 0)
    this.controls.update()
  }

  start() {
    this._rafId = requestAnimationFrame(this._loop)
  }

  stop() {
    cancelAnimationFrame(this._rafId)
  }

  private _loop = (now: number) => {
    this._rafId = requestAnimationFrame(this._loop)
    const dt = Math.min((now - this._lastTime) / 1000, 0.05) // cap à 50 ms
    this._lastTime = now

    this.controls.update()
    this._onTick?.(dt)
    this._composer.render()
    this._onPostRender?.(this.renderer, this.scene)
  }

  /** Déplace la caméra + target (pan relatif à la direction horizontale de vue). */
  panCamera(forward: number, right: number, dt: number) {
    if (forward === 0 && right === 0) return
    const CAM_SPEED = 9

    // Direction horizontale vers la cible
    const fwdDir = new THREE.Vector3()
    fwdDir.subVectors(this.controls.target, this.camera.position)
    fwdDir.y = 0
    fwdDir.normalize()

    // Perpendiculaire droite
    const rightDir = new THREE.Vector3()
    rightDir.crossVectors(fwdDir, new THREE.Vector3(0, 1, 0))

    const delta = new THREE.Vector3()
    delta.addScaledVector(fwdDir, forward * CAM_SPEED * dt)
    delta.addScaledVector(rightDir, right * CAM_SPEED * dt)

    this.camera.position.add(delta)
    this.controls.target.add(delta)
  }

  private _onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this._composer.setSize(window.innerWidth, window.innerHeight)
  }

  dispose() {
    this.stop()
    window.removeEventListener('resize', this._onResize)
    this.controls.dispose()
    this.renderer.dispose()
  }
}
