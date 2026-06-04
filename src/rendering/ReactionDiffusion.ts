/**
 * GPU Reaction-Diffusion — Gray-Scott 图灵斑纹模型
 *
 * Taichi Gallery 中最震撼的 demo 之一：有机生物图案随时间演化。
 * 本项目用法：
 *   - 脸部：斑纹从颧骨向外扩散 → 面相"气色"
 *   - 手掌：低能量区域生长斑纹 → 脏腑"病灶"
 *   - 脊柱：分数驱动参数 → 健康=珊瑚纹 / 堵塞=条纹纹
 *
 * 2 个 ping-pong RT (U/V 浓度场) + 1 个 fragment shader
 */
import * as THREE from 'three'
import { REACTION_DIFFUSION_FRAG, REACTION_DIFFUSION_VIZ_FRAG } from './shaders'

export interface RDConfig {
  resolution: number        // 纹理分辨率 (256/512)
  feed: number              // 0.02~0.06 — 越小斑纹越细
  kill: number              // 0.04~0.07 — 越大斑纹越散
  du: number                // U 扩散率
  dv: number                // V 扩散率
  speed: number             // 每帧迭代次数
}

export interface RDSeed {
  x: number                 // 归一化 0~1
  y: number
  radius: number            // 种子半径
  uAmount: number           // U 注入量
  vAmount: number           // V 注入量
}

const DEFAULT_CONFIG: RDConfig = {
  resolution: 256,
  feed: 0.037,
  kill: 0.062,
  du: 0.2,
  dv: 0.1,
  speed: 3,
}

/**
 * 预设参数 → 不同视觉风格
 */
export const RD_PRESETS = {
  /** 珊瑚纹 — 健康/活力 */
  coral: { feed: 0.054, kill: 0.062, du: 0.15, dv: 0.08 },
  /** 细胞纹 — 中等/平衡 */
  cells: { feed: 0.035, kill: 0.065, du: 0.25, dv: 0.12 },
  /** 条纹 — 紧张/堵塞 */
  stripes: { feed: 0.022, kill: 0.055, du: 0.18, dv: 0.06 },
  /** 迷宫 — 衰老/低能 */
  maze: { feed: 0.028, kill: 0.058, du: 0.22, dv: 0.09 },
  /** 斑点 — 兴奋/高能 */
  spots: { feed: 0.042, kill: 0.058, du: 0.20, dv: 0.10 },
} as const

export class ReactionDiffusion {
  private renderer: THREE.WebGLRenderer
  private config: RDConfig

  private quad: THREE.Mesh
  private camera: THREE.OrthographicCamera
  private scene: THREE.Scene

  private chemRT1: THREE.WebGLRenderTarget
  private chemRT2: THREE.WebGLRenderTarget

  // 可视化 RT（颜色映射后的输出）
  private vizRT: THREE.WebGLRenderTarget

  private rdMat: THREE.ShaderMaterial
  private vizMat: THREE.ShaderMaterial

  // 种子注入用 canvas
  private seedCanvas: HTMLCanvasElement
  private seedCtx: CanvasRenderingContext2D
  private seedTexture: THREE.CanvasTexture

  private _preset: keyof typeof RD_PRESETS = 'coral'

  constructor(renderer: THREE.WebGLRenderer, config: Partial<RDConfig> = {}) {
    this.renderer = renderer
    this.config = { ...DEFAULT_CONFIG, ...config }
    const res = this.config.resolution

    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1)
    this.scene = new THREE.Scene()
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial())
    this.scene.add(this.quad)
    this.quad.position.set(0.5, 0.5, 0)

    const rtOpts: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    }
    this.chemRT1 = new THREE.WebGLRenderTarget(res, res, rtOpts)
    this.chemRT2 = new THREE.WebGLRenderTarget(res, res, rtOpts)
    this.vizRT = new THREE.WebGLRenderTarget(res, res, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, type: THREE.HalfFloatType,
    })

    const texelSize = 1 / res
    this.rdMat = new THREE.ShaderMaterial({
      uniforms: {
        tChemicals: { value: null },
        uTexelSize: { value: new THREE.Vector2(texelSize, texelSize) },
        uFeed: { value: this.config.feed },
        uKill: { value: this.config.kill },
        uDu: { value: this.config.du },
        uDv: { value: this.config.dv },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: REACTION_DIFFUSION_FRAG,
      depthTest: false, depthWrite: false,
    })

    this.vizMat = new THREE.ShaderMaterial({
      uniforms: {
        tChemicals: { value: null },
        uColor1: { value: new THREE.Color('#ff6600') },  // 高U色 = 暖橙
        uColor2: { value: new THREE.Color('#33ccff') },  // 高V色 = 青蓝
        uBgColor: { value: new THREE.Color('#0a0a1a') },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: REACTION_DIFFUSION_VIZ_FRAG,
      depthTest: false, depthWrite: false,
      blending: THREE.NormalBlending,
      transparent: true,
    })

    // 种子画布
    this.seedCanvas = document.createElement('canvas')
    this.seedCanvas.width = res
    this.seedCanvas.height = res
    this.seedCtx = this.seedCanvas.getContext('2d')!
    this.seedTexture = new THREE.CanvasTexture(this.seedCanvas)
    this.seedTexture.minFilter = THREE.LinearFilter
    this.seedTexture.magFilter = THREE.LinearFilter

    // 初始化化学场
    this.initializeWithNoise()
  }

  // ────────────────────────────
  // 公开接口
  // ────────────────────────────

  /**
   * 切换预设风格
   * @param preset 风格名
   */
  setPreset(preset: keyof typeof RD_PRESETS): void {
    this._preset = preset
    const p = RD_PRESETS[preset]
    Object.assign(this.config, p)
    this.rdMat.uniforms.uFeed.value = p.feed
    this.rdMat.uniforms.uKill.value = p.kill
    this.rdMat.uniforms.uDu.value = p.du
    this.rdMat.uniforms.uDv.value = p.dv
  }

  get preset(): keyof typeof RD_PRESETS {
    return this._preset
  }

  /**
   * 基于体态分数自动选预设
   * 健康 → 珊瑚纹; 中 → 细胞纹; 低 → 条纹/迷宫
   */
  autoPreset(score: number): void {
    if (score >= 75) this.setPreset('coral')
    else if (score >= 50) this.setPreset('cells')
    else if (score >= 30) this.setPreset('stripes')
    else this.setPreset('maze')
  }

  /**
   * 在位置添加种子（注入 U/V 化学物质）
   */
  addSeed(seed: RDSeed): void {
    const ctx = this.seedCtx
    const res = this.config.resolution
    const px = seed.x * res
    const py = seed.y * res
    const r = seed.radius * res

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'

    // U 通道（红色）— 激活剂
    const uGrad = ctx.createRadialGradient(px, py, 0, px, py, r)
    uGrad.addColorStop(0, `rgba(${Math.round(seed.uAmount * 255)}, 0, 0, 0.9)`)
    uGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = uGrad
    ctx.fillRect(px - r, py - r, r * 2, r * 2)

    // V 通道（绿色）— 抑制剂
    const vGrad = ctx.createRadialGradient(px, py, 0, px, py, r * 1.2)
    vGrad.addColorStop(0, `rgba(0, ${Math.round(seed.vAmount * 255)}, 0, 0.4)`)
    vGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = vGrad
    ctx.fillRect(px - r, py - r, r * 2, r * 2)

    ctx.restore()
    this.seedTexture.needsUpdate = true
  }

  /** 批量添加种子 */
  addSeeds(seeds: RDSeed[]): void {
    seeds.forEach(s => this.addSeed(s))
  }

  /** 获取可视化纹理（颜色映射后的输出） */
  getVisualizationTexture(): THREE.Texture {
    return this.vizRT.texture
  }

  /** 可视化颜色配置 */
  setVizColors(uColor: THREE.Color, vColor: THREE.Color, bgColor: THREE.Color): void {
    this.vizMat.uniforms.uColor1.value = uColor
    this.vizMat.uniforms.uColor2.value = vColor
    this.vizMat.uniforms.uBgColor.value = bgColor
  }

  // ────────────────────────────
  // 模拟步进
  // ────────────────────────────

  /** 执行 n 步 Gray-Scott 迭代 */
  step(): void {
    const r = this.renderer
    const { chemRT1, chemRT2 } = this

    // 叠加种子注入
    this.blendSeeds()

    for (let i = 0; i < this.config.speed; i++) {
      this.rdMat.uniforms.tChemicals.value = chemRT1.texture
      this.renderFullscreen(r, chemRT2, this.rdMat)
      ;[this.chemRT1, this.chemRT2] = [this.chemRT2, this.chemRT1]
    }

    // 渲染可视化到 vizRT
    this.renderViz(this.vizRT)

    this.seedCtx.clearRect(0, 0, this.config.resolution, this.config.resolution)
  }

  /**
   * 渲染可视化到屏幕或 RT
   */
  renderViz(target: THREE.WebGLRenderTarget | null = null): void {
    this.vizMat.uniforms.tChemicals.value = this.chemRT1.texture
    this.renderFullscreen(this.renderer, target, this.vizMat)
  }

  // ────────────────────────────
  // 内部
  // ────────────────────────────

  private initializeWithNoise(): void {
    const ctx = this.seedCtx
    const res = this.config.resolution
    // 随机种子 → U 通道全覆盖（轻微噪声），V 通道中心注入
    ctx.clearRect(0, 0, res, res)

    // 随机 U 背景
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * res
      const y = Math.random() * res
      const r = Math.random() * 20 + 5
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
      grad.addColorStop(0, `rgba(${Math.round(255 * (0.3 + Math.random() * 0.2))}, 0, 0, 0.6)`)
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = grad
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
    }

    // 中心 V 注入
    const vGrad = ctx.createRadialGradient(res / 2, res / 2, 0, res / 2, res / 2, res * 0.4)
    vGrad.addColorStop(0, 'rgba(0, 64, 0, 0.8)')
    vGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = vGrad
    ctx.fillRect(0, 0, res, res)

    this.seedTexture.needsUpdate = true
  }

  private blendSeeds(): void {
    const r = this.renderer
    const oldRT = r.getRenderTarget()
    r.setRenderTarget(this.chemRT1)
    const mat = new THREE.MeshBasicMaterial({
      map: this.seedTexture,
      blending: THREE.AdditiveBlending,
      depthTest: false, depthWrite: false,
      transparent: true,
    })
    this.quad.material = mat
    r.render(this.scene, this.camera)
    mat.dispose()
    r.setRenderTarget(oldRT)
  }

  private renderFullscreen(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null, material: THREE.ShaderMaterial): void {
    this.quad.material = material
    renderer.setRenderTarget(target)
    renderer.render(this.scene, this.camera)
    if (target) renderer.setRenderTarget(null)
  }

  dispose(): void {
    this.chemRT1.dispose()
    this.chemRT2.dispose()
    this.vizRT.dispose()
    this.seedTexture.dispose()
    this.rdMat.dispose()
    this.vizMat.dispose()
    this.quad.geometry.dispose()
    ;(this.quad.material as THREE.Material).dispose()
  }
}
