/**
 * N-Body 灵气星云 — 万有引力粒子环绕系统
 *
 * Taichi N-body Galaxy demo 的 GLSL 等价实现。
 * 粒子绕体态关键点（脊柱/掌心/额头）做轨道运动，
 * 形成环绕体态的"灵气星云"。
 *
 * 用法：
 *   GPU ping-pong 更新粒子位置（引力场+轨道力学）
 *   渲染为发光点晕叠加到场景
 */
import * as THREE from 'three'
import { NBODY_FIELD_FRAG, NBODY_RENDER_FRAG } from './shaders'

export interface NBodySource {
  x: number             // 归一化 0~1
  y: number
  mass: number          // 引力质量 0.1~5
  color: THREE.Color    // 粒子颜色
}

export interface NBodyConfig {
  particleCount: number    // 粒子数 (1024/2048/4096)
  gravity: number          // 万有引力常数
  softening: number        // 软化半径 (防止奇点)
  damping: number          // 速度阻尼
  randomForce: number      // 随机扰动力
}

const DEFAULT_CONFIG: NBodyConfig = {
  particleCount: 2048,
  gravity: 0.008,
  softening: 2.0,
  damping: 0.998,
  randomForce: 0.0002,
}

export class NBodyField {
  private renderer: THREE.WebGLRenderer
  private config: NBodyConfig

  private quad: THREE.Mesh
  private camera: THREE.OrthographicCamera
  private scene: THREE.Scene

  // FF-RT: RG = position.xy, BA = velocity.xy
  private stateRT1: THREE.WebGLRenderTarget
  private stateRT2: THREE.WebGLRenderTarget

  // 力场 RT (ping-pong)
  private forceRT: THREE.WebGLRenderTarget

  // 着色器材质
  private fieldMat: THREE.ShaderMaterial
  private renderMat: THREE.ShaderMaterial

  private nSources: number = 0

  constructor(renderer: THREE.WebGLRenderer, config: Partial<NBodyConfig> = {}) {
    this.renderer = renderer
    this.config = { ...DEFAULT_CONFIG, ...config }

    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1)
    this.scene = new THREE.Scene()
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial())
    this.scene.add(this.quad)

    const pc = this.config.particleCount
    const texSize = Math.ceil(Math.sqrt(pc))
    // 粒子数必须是 2 的幂 → 方便纹理寻址
    const res = Math.pow(2, Math.ceil(Math.log2(texSize)))

    const rtOpts: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
    }
    this.stateRT1 = new THREE.WebGLRenderTarget(res, res, rtOpts)
    this.stateRT2 = new THREE.WebGLRenderTarget(res, res, rtOpts)
    this.forceRT = new THREE.WebGLRenderTarget(res, res, rtOpts)

    // 初始化粒子
    this.initializeParticles()

    this.fieldMat = new THREE.ShaderMaterial({
      uniforms: {
        uSources: { value: new Array(5).fill(new THREE.Vector3(0, 0, 0)) },
        uSourceCount: { value: 0 },
        uGravity: { value: this.config.gravity },
        uSoftening: { value: this.config.softening },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: NBODY_FIELD_FRAG,
      depthTest: false, depthWrite: false,
    })

    this.renderMat = new THREE.ShaderMaterial({
      uniforms: {
        tParticles: { value: this.stateRT1.texture },
        uTexelSize: { value: new THREE.Vector2(1 / res, 1 / res) },
        uPointSize: { value: 200.0 },
        uTime: { value: 0 },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: NBODY_RENDER_FRAG,
      depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending,
      transparent: true,
    })
  }

  // ────────────────────────────
  // 公开接口
  // ────────────────────────────

  /**
   * 设置引力源（体态关键点）
   * 脊柱 5 节点 + 掌心 + 额头 = 最多 7 个源
   */
  setSources(sources: NBodySource[]): void {
    this.nSources = Math.min(sources.length, 5)
    this.fieldMat.uniforms.uSourceCount.value = this.nSources

    const arr = this.fieldMat.uniforms.uSources.value as THREE.Vector3[]
    for (let i = 0; i < 5; i++) {
      if (i < this.nSources) {
        arr[i].set(sources[i].x, sources[i].y, sources[i].mass)
      } else {
        arr[i].set(0, 0, 0)
      }
    }
  }

  /** 获取渲染纹理（叠加用） */
  getRenderTexture(): THREE.Texture {
    return this.stateRT1.texture
  }

  // ────────────────────────────
  // 模拟步进
  // ────────────────────────────

  step(dt: number): void {
    const r = this.renderer
    const { forceRT } = this

    // 1. 计算力场 → forceRT
    this.renderFullscreen(r, forceRT, this.fieldMat)

    // 2. 更新粒子状态（position += velocity*dt + force*dt², velocity += force*dt）
    // 直接在 state 纹理上做一次自定义更新 — 这里用一个临时全屏 pass
    // 简化：用 compute-like pass 手动更新
    this.updateParticles(dt)

    // 3. 阻尼 + 随机力
    this.applyDamping()
  }

  /**
   * 渲染粒子星云到目标
   */
  renderNebula(target: THREE.WebGLRenderTarget | null = null): void {
    const res = this.stateRT1.width || 64
    this.renderMat.uniforms.tParticles.value = this.stateRT1.texture
    this.renderMat.uniforms.uTexelSize.value.set(1 / res, 1 / res)
    this.renderFullscreen(this.renderer, target, this.renderMat)
  }

  // ────────────────────────────
  // 内部
  // ────────────────────────────

  private initializeParticles(): void {
    const res = this.stateRT1.width
    const size = res * res
    const floatData = new Float32Array(size * 4)

    for (let i = 0; i < this.config.particleCount; i++) {
      // 随机初始位置（环绕体态中央）
      const angle = Math.random() * Math.PI * 2
      const radius = 0.05 + Math.random() * 0.35
      const x = 0.5 + Math.cos(angle) * radius
      const y = 0.5 + Math.sin(angle) * radius

      // 初始轨道速度（切向）
      const orbitalSpeed = 0.005 * (1.0 - radius)
      const vx = -Math.sin(angle) * orbitalSpeed
      const vy = Math.cos(angle) * orbitalSpeed

      const offset = i * 4
      floatData[offset] = x
      floatData[offset + 1] = y
      floatData[offset + 2] = vx
      floatData[offset + 3] = vy
    }

    const dataTex = new THREE.DataTexture(floatData, res, res, THREE.RGBAFormat, THREE.FloatType)
    dataTex.needsUpdate = true

    // 把 dataTex 的内容复制到 stateRT1
    const r = this.renderer
    const mat = new THREE.MeshBasicMaterial({ map: dataTex, depthTest: false, depthWrite: false })
    this.quad.material = mat
    r.setRenderTarget(this.stateRT1)
    r.render(this.scene, this.camera)
    r.setRenderTarget(null)
    mat.dispose()
    dataTex.dispose()
  }

  private updateParticles(dt: number): void {
    // 使用简单的 GPU pass: pos += force * dt² + vel * dt; vel += force * dt
    // 这里我们用一个自定义的 compute shader（在 JS 中做太慢）
    // 替代方案：通过额外的 compute pass
    const r = this.renderer
    const { stateRT1, stateRT2, forceRT } = this
    const drift = this.config.randomForce

    // 用简单的点积 pass 来做更新 — 写一个轻量 passthrough
    const updateMat = new THREE.ShaderMaterial({
      uniforms: {
        tState: { value: stateRT1.texture },
        tForce: { value: forceRT.texture },
        uDt: { value: dt },
        uDamping: { value: this.config.damping },
        uDrift: { value: drift },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tState;
        uniform sampler2D tForce;
        uniform float uDt;
        uniform float uDamping;
        uniform float uDrift;
        varying vec2 vUv;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        void main() {
          vec4 state = texture2D(tState, vUv);
          vec2 pos = state.xy;
          vec2 vel = state.zw;
          vec2 force = texture2D(tForce, vUv).xy;

          // 随机扰动
          float rx = hash(vUv * 1024.0 + uDt) - 0.5;
          float ry = hash(vUv * 2048.0 + uDt + 0.5) - 0.5;
          vec2 drift = vec2(rx, ry) * uDrift;

          vel = (vel + force * uDt + drift) * uDamping;
          pos = pos + vel * uDt;
          pos = clamp(pos, vec2(0.001), vec2(0.999));

          gl_FragColor = vec4(pos, vel);
        }`,
      depthTest: false, depthWrite: false,
    })

    this.renderFullscreen(r, stateRT2, updateMat)
    ;[this.stateRT1, this.stateRT2] = [this.stateRT2, this.stateRT1]
    updateMat.dispose()
  }

  private applyDamping(): void {
    // 阻尼已在 updateParticles 中应用
  }

  private renderFullscreen(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null, material: THREE.ShaderMaterial): void {
    this.quad.material = material
    renderer.setRenderTarget(target)
    renderer.render(this.scene, this.camera)
    if (target) renderer.setRenderTarget(null)
  }

  dispose(): void {
    this.stateRT1.dispose()
    this.stateRT2.dispose()
    this.forceRT.dispose()
    this.fieldMat.dispose()
    this.renderMat.dispose()
    this.quad.geometry.dispose()
    ;(this.quad.material as THREE.Material).dispose()
  }
}
