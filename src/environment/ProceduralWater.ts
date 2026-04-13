import * as THREE from 'three'

// ── GLSL shaders ──────────────────────────────────────────────────────────────

const vertexShader = /* glsl */`
  uniform float uTime;
  uniform float uSpeed;
  uniform float uAmplitude;
  varying vec2  vUv;
  varying float vWave;
  varying vec3  vViewNormal;

  void main() {
    vUv = uv;

    vec3 p = position;
    float t = uTime * uSpeed;

    // Multi-octave wave displacement
    float w = sin(p.x * 0.9  + t * 1.6) * 0.065 * uAmplitude
            + sin(p.z * 0.65 + t * 1.1) * 0.045 * uAmplitude
            + cos(p.x * 0.45 + p.z * 0.55 + t * 0.85) * 0.030 * uAmplitude
            + sin(p.x * 1.8  + p.z * 1.2  + t * 2.2) * 0.012 * uAmplitude;
    p.y += w;
    vWave = w;

    // Analytical normal from wave derivatives
    float dx = cos(p.x * 0.9  + t * 1.6) * 0.059 * uAmplitude
             + cos(p.x * 0.45 + p.z * 0.55 + t * 0.85) * 0.014 * uAmplitude
             + cos(p.x * 1.8  + p.z * 1.2  + t * 2.2) * 0.022 * uAmplitude;
    float dz = cos(p.z * 0.65 + t * 1.1) * 0.029 * uAmplitude
             + cos(p.x * 0.45 + p.z * 0.55 + t * 0.85) * 0.017 * uAmplitude
             + cos(p.x * 1.8  + p.z * 1.2  + t * 2.2) * 0.014 * uAmplitude;

    vec3 worldNormal = normalize(vec3(-dx, 1.0, -dz));
    vViewNormal = normalize((modelViewMatrix * vec4(worldNormal, 0.0)).xyz);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

const fragmentShader = /* glsl */`
  uniform vec3  uDeep;
  uniform vec3  uShallow;
  uniform vec3  uFoam;
  uniform float uTime;

  varying vec2  vUv;
  varying float vWave;
  varying vec3  vViewNormal;

  void main() {
    // Depth gradient via UV distance from centre
    float d = length(vUv - 0.5) * 2.0;
    vec3  col = mix(uDeep, uShallow, d * 0.55);

    // Foam on wave crests
    float foam = smoothstep(0.065, 0.10, vWave);
    col = mix(col, uFoam, foam * 0.6);

    // Fresnel — looking at the water at a glancing angle gets lighter
    float fresnel = pow(1.0 - abs(vViewNormal.z), 3.5);
    col = mix(col, vec3(0.75, 0.90, 1.0), fresnel * 0.35);

    // Animated sparkle glints
    float sparkle = sin(vUv.x * 22.0 + uTime * 4.0) * sin(vUv.y * 18.0 + uTime * 3.2);
    sparkle = max(0.0, sparkle - 0.85) * 6.0;    // only top peaks sparkle
    col += vec3(sparkle * 0.22);

    gl_FragColor = vec4(col, 0.90);
  }
`

// ── ProceduralWater ───────────────────────────────────────────────────────────

export class ProceduralWater {
  readonly mesh: THREE.Mesh
  private _mat:  THREE.ShaderMaterial
  private _time  = 0

  constructor(width = 70, depth = 70, segments = 96) {
    const geo = new THREE.PlaneGeometry(width, depth, segments, segments)
    geo.rotateX(-Math.PI / 2)

    this._mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime:      { value: 0 },
        uSpeed:     { value: 1.0 },
        uAmplitude: { value: 1.0 },
        uDeep:      { value: new THREE.Color(0x0d4a66) },
        uShallow:   { value: new THREE.Color(0x2a8aaa) },
        uFoam:      { value: new THREE.Color(0xb8dde8) },
      },
      transparent: true,
      depthWrite:  false,
      side:        THREE.FrontSide,
    })

    this.mesh = new THREE.Mesh(geo, this._mat)
    this.mesh.receiveShadow = true
  }

  update(dt: number) {
    this._time += dt
    this._mat.uniforms['uTime'].value = this._time
  }

  setWaveParams(speed: number, amplitude: number) {
    this._mat.uniforms['uSpeed'].value     = speed
    this._mat.uniforms['uAmplitude'].value = amplitude
  }

  setColors(deep: number, shallow: number, foam: number) {
    this._mat.uniforms['uDeep'].value.setHex(deep)
    this._mat.uniforms['uShallow'].value.setHex(shallow)
    this._mat.uniforms['uFoam'].value.setHex(foam)
  }

  dispose() {
    this.mesh.geometry.dispose()
    this._mat.dispose()
  }
}
