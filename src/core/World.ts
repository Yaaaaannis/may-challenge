import * as THREE from 'three'
import { Engine } from './Engine.js'
import { TrackManager } from '../track/TrackManager.js'
import { TrainController } from '../train/TrainController.js'
import { DayNight } from '../environment/DayNight.js'
import { LampPosts } from '../environment/LampPosts.js'
import { SignalManager } from '../environment/SignalManager.js'
import { PhysicsWorld } from '../physics/PhysicsWorld.js'
import { Derail } from '../physics/Derail.js'
import { FistMode, FistTarget } from '../interaction/FistMode.js'
import { GrabMode } from '../interaction/GrabMode.js'
import { Panel } from '../ui/Panel.js'
import { BiomeManager, BiomeId } from '../environment/BiomeManager.js'
import { InputHandler } from '../interaction/InputHandler.js'
import { findNearestT, curveTangent, CurveFn } from '../track/curves.js'
import { TrackEditor, Segment, SwitchData } from '../track/TrackEditor.js'
import { WeatherManager, WeatherType } from '../environment/WeatherManager.js'
import { SmokeSystem } from '../environment/SmokeSystem.js'
import { TunnelManager } from '../environment/TunnelManager.js'
import { BridgeManager } from '../environment/BridgeManager.js'
import { SeasonManager, SeasonId } from '../environment/SeasonManager.js'
import { SkyManager } from '../environment/SkyManager.js'
import { TerrainManager } from '../environment/TerrainManager.js'
import { DebugConsole } from '../ui/DebugConsole.js'
import { Minimap } from '../ui/Minimap.js'
import { SpeedGauge } from '../ui/SpeedGauge.js'
import { StationManager } from '../environment/StationManager.js'
import { ScoreBoard } from '../ui/ScoreBoard.js'

const SPEED_STEP = 0.15
const SPEED_MIN  = 0.05
const SPEED_MAX  = 3.0

export class World {
  private engine:  Engine
  private track:   TrackManager
  private train:   TrainController
  private dayNight!: DayNight
  private lamps!:    LampPosts
  private signals!:  SignalManager
  private physics:   PhysicsWorld
  private derail!:   Derail
  private fist!:     FistMode
  private grab!:     GrabMode
  private panel!:    Panel
  private input!:    InputHandler

  private ambient!: THREE.AmbientLight
  private sun!:     THREE.DirectionalLight
  private biome!:   BiomeManager
  private groundMat!: THREE.MeshStandardMaterial
  private weather!:  WeatherManager
  private smoke!:    SmokeSystem
  private tunnel!:   TunnelManager
  private bridge!:   BridgeManager
  private season!:   SeasonManager
  private sky!:      SkyManager
  private terrain!:  TerrainManager
  private debug!:      DebugConsole
  private minimap!:    Minimap
  private speedGauge!: SpeedGauge
  private stations!:   StationManager
  private scoreboard!: ScoreBoard

  // Derail risk metrics — updated every tick by _checkCentrifugalDerail
  private _derailRisk    = 0
  private _safeSpeedFrac = 1.0
  private _locoPos      = new THREE.Vector3()
  private _bridgeActive = false
  // Pending terrain rebuild params (accumulated before rebuild button is pressed)
  private _dbgTerrainMaxH  = 3.2
  private _dbgTerrainFlatR = 9.5
  private _dbgTerrainHillR = 18.0
  private editor:   TrackEditor | null = null

  // Switch raycasting
  private _switchRaycaster = new THREE.Raycaster()
  private _switchMouseNDC  = new THREE.Vector2(-9, -9)

  paused = false

  constructor(engine: Engine) {
    this.engine  = engine
    this.track   = new TrackManager(engine.scene)
    this.train   = new TrainController(engine.scene)
    this.physics = new PhysicsWorld()
  }

  async init(glbUrl: string) {
    this._buildEnvironment()

    this.track.init()
    this.lamps.build(this.track.curveFn)
    this.signals = new SignalManager(this.engine.scene)
    this.signals.build(this.track.curveFn)

    this.biome = new BiomeManager(this.engine.scene, this.groundMat, this.ambient, this.sun)
    this.biome.setBiome('prairie', false)

    this.weather = new WeatherManager(this.engine.scene)
    this.smoke   = new SmokeSystem(this.engine.scene)
    this.tunnel  = new TunnelManager(this.engine.scene)
    this.bridge  = new BridgeManager(this.engine.scene)
    this.season  = new SeasonManager(this.engine.scene)

    await this.train.loadLocomotive(glbUrl)
    this.train.setWagonCount(2)
    this.train.rebuildWagonOffsets(this.track.curveFn)

    // Physique async — les modes interaction sont init une fois Rapier prêt
    this.physics.init().then(() => {
      this.derail = new Derail(this.physics)
      this._initInteraction()
    })

    this.minimap  = new Minimap()
    this.minimap.buildTrack(this.track.curveFn)

    this.speedGauge = new SpeedGauge()
    this.speedGauge.onSpeedChange = (v) => {
      this.train.speed = v
      this.panel.setSpeed(v)
    }

    this.stations  = new StationManager(this.engine.scene)
    this.scoreboard = new ScoreBoard()
    this._buildStations(this.track.curveFn)


    this._buildUI()
    this._buildDebugConsole()
    this._buildInput()
    this._initSwitchInteraction()

    this.engine.setTickCallback((dt) => this._tick(dt))
  }

  // ── Construction ──────────────────────────────────────────────────────────

  private _buildEnvironment() {
    // ── Terrain (replaces flat ground) ────────────────────────────────────────
    this.groundMat = new THREE.MeshStandardMaterial({ color: 0x7caa5c, roughness: 1 })
    this.terrain   = new TerrainManager(this.groundMat)
    this.engine.scene.add(this.terrain.mesh)

    // ── Lights ────────────────────────────────────────────────────────────────
    this.ambient = new THREE.AmbientLight(0xffffff, 0.5)
    this.sun     = new THREE.DirectionalLight(0xffffff, 1.2)
    this.sun.position.set(10, 22, 10)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.setScalar(2048)
    this.sun.shadow.camera.near   = 0.5
    this.sun.shadow.camera.far    = 60
    this.sun.shadow.camera.left   = -18
    this.sun.shadow.camera.right  = 18
    this.sun.shadow.camera.top    = 18
    this.sun.shadow.camera.bottom = -18
    // sun.target must be in the scene for shadow-follow to work
    this.engine.scene.add(this.ambient, this.sun, this.sun.target)

    // ── Sky (Rayleigh scattering) ──────────────────────────────────────────────
    this.sky = new SkyManager(this.engine.scene)

    this.dayNight = new DayNight(this.engine.scene)
    this.lamps    = new LampPosts(this.engine.scene)
  }

  private _initInteraction() {
    this.fist = new FistMode(
      this.engine.scene,
      this.engine.camera,
      this.engine.renderer,
      this.derail,
      () => this.train.getGrabbables(),
      (target: FistTarget) => this.train.removeFromRail(target.wagon),
    )

    this.grab = new GrabMode(
      this.engine.scene,
      this.engine.camera,
      this.engine.renderer,
      this.train,
      this.derail,
      () => this.track.curveFn,
    )
  }

  private _initSwitchInteraction() {
    this.engine.renderer.domElement.addEventListener('mousemove', (e) => {
      const rect = this.engine.renderer.domElement.getBoundingClientRect()
      this._switchMouseNDC.x =  (e.clientX - rect.left) / rect.width  * 2 - 1
      this._switchMouseNDC.y = -(e.clientY - rect.top)  / rect.height * 2 + 1
    })

    this.engine.renderer.domElement.addEventListener('click', () => {
      if (!this.track.hasSwitch) return
      if (this.editor) return

      const indicators = this.track.switchIndicators
      if (indicators.length === 0) return

      this._switchRaycaster.setFromCamera(this._switchMouseNDC, this.engine.camera)
      const hits = this._switchRaycaster.intersectObjects(indicators)
      if (hits.length > 0) {
        const hitMesh = hits[0].object as THREE.Mesh
        const index   = indicators.indexOf(hitMesh)
        const newFn   = this.track.toggleSwitch(index)
        if (newFn) {
          this.train.remapToFn(newFn)
          this.lamps.build(newFn)
          this.lamps.setNightMode(this.dayNight.isNight)
          this.signals.build(newFn)
          this.signals.setNightMode(this.dayNight.isNight)
        }
      }
    })
  }

  private _buildUI() {
    this.panel = new Panel({
      onSpeedChange:  (v) => { this.train.speed = v; this.speedGauge?.setLeverSpeed(v) },
      onWagonAdd:     () => { this.train.addWagon();    this.panel.setWagonCount(this.train.wagonsCount) },
      onWagonRemove:  () => { this.train.removeWagon(); this.panel.setWagonCount(this.train.wagonsCount) },
      onCircuit:      (i) => this._switchCircuit(i),
      onBuilderMode:  () => this._activateBuilder(),
      onPreset:       () => this._loadTwoSwitchPreset(),
      onWhistle:      () => this._whistle(),
      onNightToggle:  () => this._toggleNight(),
      onReset:        () => this._reset(),
      onFistToggle:   () => this._toggleFist(),
      onGrabToggle:   () => this._toggleGrab(),
      onPauseToggle:  () => this._togglePause(),
      onBiome:        (id: string) => this._switchBiome(id as BiomeId),
      onWeather:      (type: string) => this._setWeather(type as WeatherType),
      onSeason:       (id: string)   => this._setSeason(id as SeasonId),
      onTunnel:       (active: boolean) => this._toggleTunnel(active),
      onBridge:       (active: boolean) => this._toggleBridge(active),
    })
  }

  private _buildInput() {
    this.input = new InputHandler({
      onSpeedUp:     () => this._changeSpeed(+SPEED_STEP),
      onSpeedDown:   () => this._changeSpeed(-SPEED_STEP),
      onWagonAdd:    () => { this.train.addWagon();    this.panel.setWagonCount(this.train.wagonsCount) },
      onWagonRemove: () => { this.train.removeWagon(); this.panel.setWagonCount(this.train.wagonsCount) },
      onWhistle:     () => this._whistle(),
      onNightToggle: () => this._toggleNight(),
      onFistToggle:  () => this._toggleFist(),
      onGrabToggle:  () => this._toggleGrab(),
      onPauseToggle: () => this._togglePause(),
      onReset:       () => this._reset(),
      onCircuit:     (i) => { this._switchCircuit(i); this.panel.setActiveCircuit(i) },
    })
  }

  // ── Tick ──────────────────────────────────────────────────────────────────

  private _tick(dt: number) {
    // Mouvement caméra (WASD / ZQSD / Flèches)
    const ci = this.input.cameraInput
    this.engine.panCamera(ci.fwd, ci.right, dt)

    if (!this.paused) {
      this.physics.step()
      this.derail?.update()
      this.signals.update(dt)
      const signalBrake    = this.signals.getSpeedFactor(this.train.t)
      const stationBrake   = this.stations.brakeFactor
      const emergencyBrake = this.speedGauge.braking ? 0.0 : 1.0
      this.train.update(this.track.curveFn, dt, Math.min(signalBrake, stationBrake) * emergencyBrake)
      this.weather.update(dt)
      this.train.locomotive.group.getWorldPosition(this._locoPos)
      this.smoke.update(dt, this._locoPos, this.train.speed)
      if (this._bridgeActive) this.bridge.update(dt)

      // ── Shadow camera follows the train ──────────────────────────────────
      const tp = this._locoPos
      this.sun.position.set(tp.x + 12, 22, tp.z + 8)
      this.sun.target.position.set(tp.x, 0, tp.z)
      this.sun.target.updateMatrixWorld()

      this.minimap.update(
        this.train.getVehicleData(),
        this.signals.getSignalStates(),
      )

      this._checkRailCollisions()
      this._checkCentrifugalDerail()
      this.stations.update(this.train.t, this.train.speed, dt)
      this.scoreboard.tick(dt)
      const approach = this.stations.getNextApproach(this.train.t)
      this.scoreboard.setApproach(approach?.name ?? '', approach?.proximity ?? 0)
      this.speedGauge.update(this.train.speed, this._derailRisk, this._safeSpeedFrac)
    }

    // Grab et Fist tournent même en pause (pour pouvoir attraper / reposer)
    this.fist?.update(dt)
    this.grab?.update(dt)

    // Hover des ghosts dans l'éditeur
    this.editor?.update()

    // Switch indicator hover cursor
    if (this.track.hasSwitch && !this.editor) {
      const indicators = this.track.switchIndicators
      if (indicators.length > 0) {
        this._switchRaycaster.setFromCamera(this._switchMouseNDC, this.engine.camera)
        const hits = this._switchRaycaster.intersectObjects(indicators)
        if (hits.length > 0) {
          document.body.style.cursor = 'pointer'
        } else if (document.body.style.cursor === 'pointer') {
          document.body.style.cursor = 'default'
        }
      }
    }
  }

  // ── Collision rail ────────────────────────────────────────────────────────

  private _checkRailCollisions() {
    if (!this.derail || this.derail.count === 0) return

    const derailedPositions = this.derail.getDerailedPositions()
    const fn = this.track.curveFn

    const onRail = this.train.getGrabbables().filter(
      v => !this.derail.hasBody(v.group),
    )

    if (!onRail.length) return

    const COLLISION_R = 1.1

    const toKnock: Array<{
      group: THREE.Group
      wagon: ReturnType<TrainController['getGrabbables']>[number]['wagon']
      knockDir: THREE.Vector3
    }> = []

    const vPos = new THREE.Vector3()

    for (const vehicle of onRail) {
      vehicle.group.getWorldPosition(vPos)

      for (const { mesh, pos } of derailedPositions) {
        const dist = vPos.distanceTo(pos)
        if (dist < COLLISION_R) {
          const nearest  = findNearestT(fn, vPos, 0.32)
          const tangent  = curveTangent(fn, nearest.t)

          const push = tangent.clone().multiplyScalar(this.train.speed * 2.5)
          push.y += 0.8
          this.derail.applyImpulse(mesh, push)

          toKnock.push({ group: vehicle.group, wagon: vehicle.wagon, knockDir: tangent.clone() })
          break
        }
      }
    }

    for (const { group, wagon, knockDir } of toKnock) {
      this.train.removeFromRail(wagon)

      const vel = knockDir.multiplyScalar(this.train.speed * 3.0)
      vel.y += 1.8

      const halfExtents = wagon === null
        ? new THREE.Vector3(0.95, 0.40, 0.35)
        : new THREE.Vector3(0.65, 0.32, 0.31)

      this.derail.derailMesh(group, vel, this.engine.scene, 1.2, halfExtents)
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  private _switchCircuit(i: number) {
    this.track.setCircuit(i)
    this.lamps.build(this.track.curveFn, i === 3 ? 1 : 8)
    this.lamps.setNightMode(this.dayNight.isNight)
    this.signals.build(this.track.curveFn)
    this.signals.setNightMode(this.dayNight.isNight)
    this.minimap.buildTrack(this.track.curveFn)
    // Grand Serpentin needs a wider flat zone so the track sits above terrain
    if (i === 3) {
      this.terrain.rebuild(1.8, 26, 34)
    } else {
      this.terrain.rebuild(this._dbgTerrainMaxH, this._dbgTerrainFlatR, this._dbgTerrainHillR)
    }
    this.train.rebuildWagonOffsets(this.track.curveFn)
    this.train.reset()
    this._buildStations(this.track.curveFn)
  }

  private _loadTwoSwitchPreset() {
    if (this.fist?.active)  this._toggleFist()
    if (this.grab?.active)  this._toggleGrab()
    if (this.editor) {
      this.editor.cancel()
    }
    this.track.setPresetTwoSwitch()
    this.lamps.build(this.track.curveFn)
    this.lamps.setNightMode(this.dayNight.isNight)
    this.signals.build(this.track.curveFn, 6)
    this.signals.setNightMode(this.dayNight.isNight)
    this.minimap.buildTrack(this.track.curveFn)
    this.train.rebuildWagonOffsets(this.track.curveFn)
    this.train.reset()
    this._buildStations(this.track.curveFn)
    this.panel.setPresetActive(true)
  }

  private _switchBiome(id: BiomeId) {
    this.biome.setBiome(id, this.dayNight.isNight)
    this.sky.setBiome(id)
  }

  private _toggleNight() {
    const night = this.dayNight.toggle()
    this.lamps.setNightMode(night)
    this.train.setNightMode(night)
    this.signals.setNightMode(night)
    this.biome.setNightMode(night)
    this.weather.setNightMode(night)
    this.stations.setNightMode(night)
    this.sky.setNight(night)
    // Bloom brighter at night — signals and lamps glow more
    this.engine.setBloom(night ? 0.3 : 0.1, night ? 0.68 : 0.76)
  }

  private _toggleFist() {
    if (!this.fist) return
    if (this.grab?.active) this._toggleGrab()
    const active = this.fist.toggle()
    this.panel.setFistActive(active)
    this.engine.controls.enabled = !active
  }

  private _toggleGrab() {
    if (!this.grab) return
    if (this.fist?.active) {
      this.fist.toggle()
      this.panel.setFistActive(false)
      this.engine.controls.enabled = true
    }
    const active = this.grab.toggle()
    this.panel.setGrabActive(active)
    this.engine.controls.enabled = !active
  }

  private _togglePause() {
    this.paused = !this.paused
    this.panel.setPaused(this.paused)
  }

  private _changeSpeed(delta: number) {
    const next = Math.max(SPEED_MIN, Math.min(SPEED_MAX, this.train.speed + delta))
    this.train.speed = next
    this.panel.setSpeed(next)
    this.speedGauge?.setLeverSpeed(next)
  }

  private _whistle() {
    console.log('📯 Tchouuuu!')
  }

  private _reset() {
    this.train.reset()
    this.derail?.clear(this.engine.scene)
    if (this.fist?.active)  this._toggleFist()
    if (this.grab?.active)  this._toggleGrab()
    if (this.paused)        this._togglePause()
  }

  private _activateBuilder() {
    // Désactive les modes interaction incompatibles
    if (this.fist?.active)  this._toggleFist()
    if (this.grab?.active)  this._toggleGrab()

    // Détruit un éventuel éditeur précédent
    this.editor?.dispose()

    // Cache la piste et les signaux pendant l'édition
    this.track.setVisible(false)
    this.signals.setVisible(false)

    this.editor = new TrackEditor(this.engine.scene)

    this.editor.onComplete = (fn: CurveFn, _segs: Segment[], switchData?: SwitchData, signalTs: number[] = []) => {
      this._deactivateEditorCanvas()
      this.editor!.dispose()
      this.editor = null

      if (switchData) {
        this.track.setCustomTrackWithSwitch(fn, switchData)
      } else {
        this.track.setCustomTrack(fn)
      }

      this.track.setVisible(true)
      this.lamps.build(this.track.curveFn)
      this.lamps.setNightMode(this.dayNight.isNight)

      // Only place signals where the user explicitly put them
      if (signalTs.length > 0) {
        this.signals.build(this.track.curveFn, signalTs)
        this.signals.setVisible(true)
        this.signals.setNightMode(this.dayNight.isNight)
      } else {
        this.signals.clear()
      }

      this.minimap.buildTrack(this.track.curveFn)
      this.train.rebuildWagonOffsets(this.track.curveFn)
      this.train.reset()
      this._buildStations(this.track.curveFn)
      this.panel.setBuilderActive(false)
    }

    this.editor.onCancel = () => {
      this._deactivateEditorCanvas()
      this.editor!.dispose()
      this.editor = null
      this.track.setVisible(true)
      this.signals.setVisible(true)
      this.panel.setBuilderActive(false)
      this.panel.setActiveCircuit(this.track.circuitIndex)
    }

    // Active caméra + canvas pour les ghosts
    this.editor.activate(this.engine.camera, this.engine.renderer.domElement)
  }

  private _deactivateEditorCanvas() {
    document.body.style.cursor = 'default'
  }

  // ── Debug console ─────────────────────────────────────────────────────────

  private _buildDebugConsole() {
    this.debug = new DebugConsole({
      // Post-process
      onBloomStrength:  v => { this._bloomStrength  = v; this.engine.setBloom(v, this._bloomThreshold) },
      onBloomThreshold: v => { this._bloomThreshold = v; this.engine.setBloom(this._bloomStrength, v)  },
      onBloomRadius:    v => this.engine.setBloomRadius(v),
      onExposure:       v => this.engine.setExposure(v),
      // Sky
      onSkyTurbidity:   v => { this._skyT   = v; this.sky.setFullParams(v, this._skyR, this._skyMie, this._skyMieG) },
      onSkyRayleigh:    v => { this._skyR   = v; this.sky.setFullParams(this._skyT, v, this._skyMie, this._skyMieG) },
      onSkyMie:         v => { this._skyMie  = v; this.sky.setFullParams(this._skyT, this._skyR, v, this._skyMieG) },
      onSkyMieG:        v => { this._skyMieG = v; this.sky.setFullParams(this._skyT, this._skyR, this._skyMie, v) },
      onSunElevation:   v => this.sky.setSunElevation(v),
      // Water (passed through BridgeManager)
      onWaveSpeed:      v => this.bridge.setWaveSpeed(v),
      onWaveAmplitude:  v => this.bridge.setWaveAmplitude(v),
      onWaterDeep:      v => this.bridge.setWaterDeep(v),
      onWaterShallow:   v => this.bridge.setWaterShallow(v),
      onWaterFoam:      v => this.bridge.setWaterFoam(v),
      // Terrain
      onTerrainMaxH:    v => { this._dbgTerrainMaxH  = v },
      onTerrainFlatR:   v => { this._dbgTerrainFlatR = v },
      onTerrainHillR:   v => { this._dbgTerrainHillR = v },
      onTerrainRebuild: () => this.terrain.rebuild(this._dbgTerrainMaxH, this._dbgTerrainFlatR, this._dbgTerrainHillR),
      // Fog
      onFogNear: v => { if (this.engine.scene.fog instanceof THREE.Fog) this.engine.scene.fog.near = v },
      onFogFar:  v => { if (this.engine.scene.fog instanceof THREE.Fog) this.engine.scene.fog.far  = v },
      // Smoke
      onSmokeRate: v => this.smoke.setEmissionRate(v),
      onSmokeRise: v => this.smoke.setRiseSpeed(v),
      onSmokeSize: v => this.smoke.setPuffSize(v),
      // Rain
      onRainSpeed:   v => this.weather.setFallSpeed(v),
      onRainOpacity: v => this.weather.setOpacity(v),
    })
  }

  // Cached params for delta-style debug updates
  private _bloomStrength  = 0.1
  private _bloomThreshold = 0.76
  private _skyT    = 2.5
  private _skyR    = 3.0
  private _skyMie  = 0.003
  private _skyMieG = 0.86

  private _setWeather(type: WeatherType) {
    this.weather.setWeather(type)
    this.weather.setNightMode(this.dayNight.isNight)
  }

  private _setSeason(id: SeasonId) {
    this.season.setSeason(id)
  }

  private _toggleTunnel(active: boolean) {
    if (active) {
      this.tunnel.build(this.track.curveFn, 0.22)
      this.tunnel.setNightMode(this.dayNight.isNight)
    } else {
      this.tunnel.clear()
    }
  }

  private _toggleBridge(active: boolean) {
    this._bridgeActive = active
    if (active) {
      this.bridge.build(this.track.curveFn, 0.52, 0.72)
    } else {
      this.bridge.clear()
    }
  }

  // ── Stations ─────────────────────────────────────────────────────────────

  private _buildStations(fn: CurveFn) {
    this.stations.build(fn)
    this.stations.onArrival = (evt) => {
      this.scoreboard.arrival(evt.name)
    }
    this.scoreboard.setStations(this.stations.names)
    this.stations.setNightMode(this.dayNight.isNight)
  }

  // ── Centrifugal derailment ────────────────────────────────────────────────

  private _checkCentrifugalDerail() {
    if (!this.derail) return
    const table = this.train.arcTable
    if (!table) return

    const fn = this.track.curveFn

    // World-space speed (units/s).  train.speed is in t/s; one full t = total arc.
    const worldSpeed = this.train.speed * table.total / (2 * Math.PI)

    // Base lateral-accel threshold (world units/s²) before wagon-mass penalty.
    // Tuned so default speed (≈0.8) on the small circle (r≈4.5) is comfortable;
    // ~1.4× default speed triggers the first derailment.
    const BASE_THRESHOLD = 8.0
    // Each wagon adds inertia → lowers the effective threshold
    const massMultiplier = 1 + this.train.wagonsCount * 0.10

    const _up = new THREE.Vector3(0, 1, 0)
    const _tmp = new THREE.Vector3()

    // Metrics for SpeedGauge (reset each tick)
    let maxRisk = 0
    let minSafeSpeedT = SPEED_MAX

    for (const { group, wagon, t } of this.train.getVehicleTs()) {
      // ── Curvature at this vehicle's position ──────────────────────────────
      const DT = 0.005
      const tA = curveTangent(fn, t)
      const tB = curveTangent(fn, t + DT)
      const curveAngle = tA.angleTo(tB) / DT     // rad per unit-t
      // Convert to rad per world-unit → κ = curveAngle / total
      const kappa = curveAngle / table.total

      // Loco is heavier — harder to derail
      const threshold = BASE_THRESHOLD / massMultiplier * (wagon === null ? 1.4 : 1.0)

      // ── Gauge metrics ─────────────────────────────────────────────────────
      if (kappa > 0.0001) {
        const risk = (worldSpeed * worldSpeed * kappa) / threshold
        if (risk > maxRisk) maxRisk = risk

        const safeWorldSpeed = Math.sqrt(threshold / kappa)
        const safeTSpeed     = safeWorldSpeed * 2 * Math.PI / table.total
        if (safeTSpeed < minSafeSpeedT) minSafeSpeedT = safeTSpeed
      }

      if (this.derail.hasBody(group)) continue

      // ── Lateral acceleration  a = v² · κ ─────────────────────────────────
      const lateralAccel = worldSpeed * worldSpeed * kappa

      if (lateralAccel <= threshold) continue

      // ── Eject! ────────────────────────────────────────────────────────────
      this.train.removeFromRail(wagon)

      // True outward direction: curve turns toward (tB−tA), centrifugal = opposite
      _tmp.copy(tB).sub(tA)
      _tmp.y = 0
      if (_tmp.length() < 0.001) _tmp.set(tA.z, 0, -tA.x)  // fallback on straights
      _tmp.normalize().negate()   // outward

      const ejection = Math.min(Math.sqrt(lateralAccel) * 0.5, 5.0)
      const vel = tA.clone()
        .multiplyScalar(worldSpeed * 0.25)          // forward bleed
        .addScaledVector(_tmp, ejection * 2.2)       // centrifugal launch
        .addScaledVector(_up,  ejection * 0.45)      // small vertical kick

      const half = wagon === null
        ? new THREE.Vector3(0.95, 0.40, 0.35)
        : new THREE.Vector3(0.65, 0.32, 0.31)

      this.derail.derailMesh(group, vel, this.engine.scene, ejection, half)
    }

    this._derailRisk    = maxRisk
    this._safeSpeedFrac = Math.min(minSafeSpeedT / SPEED_MAX, 1.0)
  }

  // ── Dispose ───────────────────────────────────────────────────────────────

  dispose() {
    this.editor?.dispose()
    this.track.dispose()
    this.train.dispose()
    this.dayNight.dispose()
    this.lamps.dispose()
    this.signals.dispose()
    this.physics.dispose()
    this.fist?.dispose()
    this.grab?.dispose()
    this.panel.dispose()
    this.input.dispose()
    this.biome.dispose()
    this.weather.dispose()
    this.smoke.dispose()
    this.tunnel.dispose()
    this.bridge.dispose()
    this.season.dispose()
    this.sky.dispose()
    this.terrain.dispose()
    this.debug.dispose()
    this.minimap.dispose()
    this.speedGauge.dispose()
    this.stations.dispose()
    this.scoreboard.dispose()
  }
}
