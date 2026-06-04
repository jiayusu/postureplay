/**
 * GPU 粒子烟雾平流 — 数千粒子沿流体速度场漂移
 *
 * 使用数据纹理存储粒子状态（RG=pos, BA=vel），每帧 GPU compute 更新位置。
 * 渲染用 THREE.Points + 自定义 ShaderMaterial（顶点着色器直接从纹理读位置）。
 * 零 CPU 回读，全 GPU 管线。
 */
import * as THREE from 'three'
import { PARTICLE_SMOKE_ADVECT_FRAG } from './shaders_ext'

export interface ParticleAdvectionConfig {
  particleCount: number     // 1024/2048/4096
  drag: number              // 0.95~0.999
  lifetime: number          // 粒子寿命(秒) 超出即重生
  pointSize: number         // 渲染点大小
  opacity: number           // 0~1
}

const DEFAULT_CONFIG: ParticleAdvectionConfig = {
  particleCount: 2048,
  drag: 0.98,
  lifetime: 5,
  pointSize: 6,
  opacity: 0.6,
}

export class GPUParticleAdvection {
  private renderer: THREE.WebGLRenderer
  private config: ParticleAdvectionConfig

  private quad: THREE.Mesh
  private camera: THREE.OrthographicCamera
  private scene: THREE.Scene

  // 粒子状态 RT (ping-pong)
  private stateRT1: THREE.WebGLRenderTarget
  private stateRT2: THREE.WebGLRenderTarget

  // Compute 材质
  private advectMat: THREE.ShaderMaterial

  // 渲染用 Points
  private points: THREE.Points
  private pointsMat: THREE.ShaderMaterial
  private texSize: number

  // 内部时间
  private elapsed: number = 0

  constructor(renderer: THREE.WebGLRenderer, config: Partial<ParticleAdvectionConfig> = {}) {
    this.renderer = renderer
    this.config = { ...DEFAULT_CONFIG, ...config }

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1)
    this.scene = new THREE.Scene()
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial())

    // 数据纹理尺寸 = sqrt(particleCount) 向上取 2 的幂
    const pc = this.config.particleCount
    this.texSize = Math.pow(2, Math.ceil(Math.log2(Math.ceil(Math.sqrt(pc)))))

    const rtOpts: THREE.RenderTargetOptions = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
    }

    this.stateRT1 = new THREE.WebGLRenderTarget(this.texSize, this.texSize, rtOpts)
    this.stateRT2 = new THREE.WebGLRenderTarget(this.texSize, this.texSize, rtOpts)

    // ── Advection compute shader ──
    this.advectMat = new THREE.ShaderMaterial({
      uniforms: {
        tState: { value: null },
        tVelocity: { value: null },
        uDt: { value: 0.016 },
        uDrag: { value: this.config.drag },
        uLifetime: { value: this.config.lifetime },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: PARTICLE_SMOKE_ADVECT_FRAG,
      depthTest: false, depthWrite: false,
    })

    // ── Init particle state ──
    this.initParticleState()

    // ── Points 渲染 ──
    const geo = new THREE.BufferGeometry()
    const idxArr = new Float32Array(pc * 3)
    for (let i = 0; i < pc; i++) {
      idxArr[i * 3] = i        // x = particle index
      idxArr[i * 3 + 1] = 0
      idxArr[i * 3 + 2] = 0
    }
    geo.setAttribute('position', new THREE.BufferAttribute(idxArr, 3))

    this.pointsMat = new THREE.ShaderMaterial({
      uniforms: {
        tParticles: { value: this.stateRT1.texture },
        uTexSize: { value: this.texSize },
        uPointSize: { value: this.config.pointSize },
        uOpacity: { value: this.config.opacity },
        uColor1: { value: new THREE.Color('#ffaa33') },
        uColor2: { value: new THREE.Color('#4488ff') },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        uniform sampler2D tParticles;
        uniform float uTexSize;
        uniform float uPointSize;
        varying float vAge;
        varying vec2 vPpos;

        void main() {
          // position.x = 粒子索引（由 BufferGeometry 提供）
          float idx = position.x;
          float u = mod(idx, uTexSize) / uTexSize;
          float v = floor(idx / uTexSize) / uTexSize;
          vec2 uv = vec2(u + 0.5 / uTexSize, v + 0.5 / uTexSize);
          vec4 particle = texture2D(tParticles, uv);
          vec2 ppos = particle.xy * 2.0 - 1.0;
          gl_Position = vec4(ppos, 0.0, 1.0);
          gl_PointSize = uPointSize;
          vAge = particle.b;
          vPpos = particle.xy;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform float uOpacity;
        uniform float uTime;
        varying float vAge;
        varying vec2 vPpos;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float glow = exp(-d * d * 4.0) * (1.0 - smoothstep(0.0, 1.0, d));
          float ageNorm = clamp(vAge / 5.0, 0.0, 1.0);
          vec3 color = mix(uColor1, uColor2, ageNorm);
          float flicker = 0.7 + 0.3 * hash(vPpos * uTime);
          float alpha = glow * uOpacity * flicker;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(color * alpha, alpha);
        }`,
      depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending,
      transparent: true,
    })

    this.points = new THREE.Points(geo, this.pointsMat)
  }

  // ────────────────────────────
  // 公开接口
  // ────────────────────────────

  /** 执行一帧：平流 + 可选渲染 */
  step(dt: number, velocityTexture: THREE.Texture): void {
    this.elapsed += dt
    const r = this.renderer

    // Compute: state1 → state2
    this.advectMat.uniforms.tState.value = this.stateRT1.texture
    this.advectMat.uniforms.tVelocity.value = velocityTexture
    this.advectMat.uniforms.uDt.value = dt
    this.quad.material = this.advectMat
    r.setRenderTarget(this.stateRT2)
    r.render(this.scene, this.camera)
    r.setRenderTarget(null)

    // ping-pong
    ;[this.stateRT1, this.stateRT2] = [this.stateRT2, this.stateRT1]

    // 更新 Points 着色器引用
    this.pointsMat.uniforms.tParticles.value = this.stateRT1.texture
    this.pointsMat.uniforms.uTime.value = this.elapsed
  }

  /** 直接渲染粒子到当前目标 */
  renderTo(renderer: THREE.WebGLRenderer): void {
    renderer.render(this.points, this.camera)
  }

  /** 渲染粒子到 RT（用作纹理） */
  renderToRT(target: THREE.WebGLRenderTarget): THREE.Texture {
    const r = this.renderer
    r.setRenderTarget(target)
    r.clear()
    r.render(this.points, this.camera)
    r.setRenderTarget(null)
    return target.texture
  }

  dispose(): void {
    this.stateRT1.dispose()
    this.stateRT2.dispose()
    this.advectMat.dispose()
    this.pointsMat.dispose()
    this.points.geometry.dispose()
    this.quad.geometry.dispose()
    ;(this.quad.material as THREE.Material).dispose()
  }

  // ────────────────────────────
  // 内部
  // ────────────────────────────

  private initParticleState(): void {
    const res = this.texSize
    const floatData = new Float32Array(res * res * 4)

    for (let i = 0; i < this.config.particleCount; i++) {
      const angle = Math.random() * Math.PI * 2
      const r = Math.random() * 0.3 + 0.1
      const x = 0.5 + Math.cos(angle) * r
      const y = 0.5 + Math.sin(angle) * r * 0.6

      const vx = (Math.random() - 0.5) * 0.02
      const vy = (Math.random() - 0.5) * 0.02

      const offset = i * 4
      floatData[offset] = x
      floatData[offset + 1] = y
      floatData[offset + 2] = vx
      floatData[offset + 3] = vy
    }

    const tex = new THREE.DataTexture(floatData, res, res, THREE.RGBAFormat, THREE.FloatType)
    tex.minFilter = THREE.NearestFilter
    tex.magFilter = THREE.NearestFilter
    tex.needsUpdate = true

    // 复制到 stateRT1
    this.quad.material = new THREE.MeshBasicMaterial({ map: tex, depthTest: false, depthWrite: false })
    this.renderer.setRenderTarget(this.stateRT1)
    this.renderer.render(this.scene, this.camera)
    this.renderer.setRenderTarget(null)
    ;(this.quad.material as THREE.Material).dispose()
    tex.dispose()
  }
}
