/**
 * 2D GPU 流体模拟器 — Jos Stam "Stable Fluids" 方法
 *
 * 使用 6 个 ping-pong RenderTarget 在 GPU 上完成：
 *   平流 → 扩散 → 密度平流 → 散度 → Jacobi 压力 → 投影
 * 输入来自体态检测关键点坐标，输出全屏速度场 + 密度场。
 */
import * as THREE from 'three'
import {
  FLUID_ADVECT_VELOCITY_FRAG,
  FLUID_DIFFUSE_VELOCITY_FRAG,
  FLUID_ADVECT_DENSITY_FRAG,
  FLUID_DIVERGENCE_FRAG,
  FLUID_JACOBI_FRAG,
  FLUID_PROJECT_FRAG,
} from './shaders'

// ────────────────────────────────────────────
// 类型
// ────────────────────────────────────────────

/** 流体源：某个位置注入速度/密度 */
export interface FluidSource {
  x: number          // 归一化坐标 0~1
  y: number
  vx: number         // 速度分量
  vy: number
  color: [number, number, number] // 密度色
  radius: number     // 注入范围 0~1
}

export interface FluidConfig {
  resolution: number          // 模拟分辨率 (128/256/512)
  viscosity: number           // 粘性 0~1
  dissipation: number         // 速度耗散 0~1
  densityDissipation: number  // 密度耗散 0~1
  jacobiIterations: number    // Jacobi 迭代次数 (20~40)
  timeStep: number            // 模拟时间步长
}

const DEFAULT_CONFIG: FluidConfig = {
  resolution: 256,
  viscosity: 0.0001,
  dissipation: 0.995,
  densityDissipation: 0.997,
  jacobiIterations: 20,
  timeStep: 0.016,
}

// ────────────────────────────────────────────
// FluidSolver
// ────────────────────────────────────────────

export class FluidSolver {
  private renderer: THREE.WebGLRenderer
  private config: FluidConfig

  // 全屏四边形（屏幕空间着色用）
  private quad: THREE.Mesh
  private camera: THREE.OrthographicCamera
  private scene: THREE.Scene

  // 速度场 RT (2 个，ping-pong)
  private velocityRT1: THREE.WebGLRenderTarget
  private velocityRT2: THREE.WebGLRenderTarget

  // 密度场 RT
  private densityRT1: THREE.WebGLRenderTarget
  private densityRT2: THREE.WebGLRenderTarget

  // 压力/散度 RT
  private divergenceRT: THREE.WebGLRenderTarget
  private pressureRT1: THREE.WebGLRenderTarget
  private pressureRT2: THREE.WebGLRenderTarget

  // ShaderMaterials
  private advectVelocityMat: THREE.ShaderMaterial
  private diffuseVelocityMat: THREE.ShaderMaterial
  private advectDensityMat: THREE.ShaderMaterial
  private divergenceMat: THREE.ShaderMaterial
  private jacobiMat: THREE.ShaderMaterial
  private projectMat: THREE.ShaderMaterial

  // 注入用（在全屏 texture 上画一个圆）
  private sourceCanvas: HTMLCanvasElement
  private sourceCtx: CanvasRenderingContext2D
  private sourceTexture: THREE.CanvasTexture

  // 当前帧的速度和密度纹理
  private velocityTexture: THREE.Texture
  private densityTexture: THREE.Texture

  constructor(renderer: THREE.WebGLRenderer, config: Partial<FluidConfig> = {}) {
    this.renderer = renderer
    this.config = { ...DEFAULT_CONFIG, ...config }
    const res = this.config.resolution

    // ── 正交相机 + 场景 ──
    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1)
    this.scene = new THREE.Scene()

    const geo = new THREE.PlaneGeometry(1, 1)
    this.quad = new THREE.Mesh(geo, new THREE.MeshBasicMaterial())
    this.scene.add(this.quad)

    // ── RT 选项 ──
    const rtOpts = (type: THREE.TextureDataType = THREE.FloatType): THREE.RenderTargetOptions => ({
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type,
    })

    // 速度场 (RG = velocity.xy, 需要 float)
    this.velocityRT1 = new THREE.WebGLRenderTarget(res, res, rtOpts())
    this.velocityRT2 = new THREE.WebGLRenderTarget(res, res, rtOpts())

    // 密度场 (RGB = color, HalfFloat 可节省带宽)
    this.densityRT1 = new THREE.WebGLRenderTarget(res, res, rtOpts(THREE.HalfFloatType))
    this.densityRT2 = new THREE.WebGLRenderTarget(res, res, rtOpts(THREE.HalfFloatType))

    // 散度 / 压力 (单通道 float)
    this.divergenceRT = new THREE.WebGLRenderTarget(res, res, rtOpts())
    this.pressureRT1 = new THREE.WebGLRenderTarget(res, res, rtOpts())
    this.pressureRT2 = new THREE.WebGLRenderTarget(res, res, rtOpts())

    // ── 着色器材质 ──
    const makeMat = (frag: string, uniforms: Record<string, any>) =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: frag,
        depthTest: false,
        depthWrite: false,
      })

    const texelSize = 1 / res
    const viscosityAlpha = res * res / (this.config.viscosity * this.config.timeStep)
    const viscosityBeta = 1 / (4 + viscosityAlpha)

    this.advectVelocityMat = makeMat(FLUID_ADVECT_VELOCITY_FRAG, {
      tVelocity: { value: null },
      tSource: { value: null },
      uTexelSize: { value: new THREE.Vector2(texelSize, texelSize) },
      uTimeStep: { value: this.config.timeStep },
      uDissipation: { value: this.config.dissipation },
    })

    this.diffuseVelocityMat = makeMat(FLUID_DIFFUSE_VELOCITY_FRAG, {
      tSource: { value: null },
      uTexelSize: { value: new THREE.Vector2(texelSize, texelSize) },
      uAlpha: { value: viscosityAlpha },
      uBeta: { value: viscosityBeta },
    })

    this.advectDensityMat = makeMat(FLUID_ADVECT_DENSITY_FRAG, {
      tVelocity: { value: null },
      tDensity: { value: null },
      uTexelSize: { value: new THREE.Vector2(texelSize, texelSize) },
      uTimeStep: { value: this.config.timeStep },
      uDissipation: { value: this.config.densityDissipation },
    })

    this.divergenceMat = makeMat(FLUID_DIVERGENCE_FRAG, {
      tVelocity: { value: null },
      uTexelSize: { value: new THREE.Vector2(texelSize, texelSize) },
    })

    const jacobiAlpha = -res * res
    const jacobiBeta = 0.25
    this.jacobiMat = makeMat(FLUID_JACOBI_FRAG, {
      tPressure: { value: null },
      tDivergence: { value: null },
      uTexelSize: { value: new THREE.Vector2(texelSize, texelSize) },
      uAlpha: { value: jacobiAlpha },
      uBeta: { value: jacobiBeta },
    })

    this.projectMat = makeMat(FLUID_PROJECT_FRAG, {
      tVelocity: { value: null },
      tPressure: { value: null },
      uTexelSize: { value: new THREE.Vector2(texelSize, texelSize) },
    })

    // ── 注入画布 ──
    this.sourceCanvas = document.createElement('canvas')
    this.sourceCanvas.width = res
    this.sourceCanvas.height = res
    this.sourceCtx = this.sourceCanvas.getContext('2d')!
    this.sourceTexture = new THREE.CanvasTexture(this.sourceCanvas)
    this.sourceTexture.minFilter = THREE.LinearFilter
    this.sourceTexture.magFilter = THREE.LinearFilter

    // 初始化为空
    this.clear()

    this.velocityTexture = this.velocityRT1.texture
    this.densityTexture = this.densityRT1.texture
  }

  // ────────────────────────────────────────
  // 公开访问器
  // ────────────────────────────────────────

  /** 获取当前速度场纹理（供其他 shader/粒子系统采样） */
  getVelocityTexture(): THREE.Texture {
    return this.velocityTexture
  }

  /** 获取当前密度场纹理 */
  getDensityTexture(): THREE.Texture {
    return this.densityTexture
  }

  /** 获取模拟分辨率 */
  get resolution(): number {
    return this.config.resolution
  }

  // ────────────────────────────────────────
  // 源注入
  // ────────────────────────────────────────

  /**
   * 注入流体源（速度 + 密度）
   * 在源位置绘制一个半透明高斯圆到源纹理上，
   * 下一步 simulation step 时叠加到速度/密度场。
   */
  addSource(source: FluidSource): void {
    const ctx = this.sourceCtx
    const res = this.config.resolution
    const px = source.x * res
    const py = source.y * res
    const r = source.radius * res

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'

    // 速度 → 存到 R,G 通道
    const speed = Math.sqrt(source.vx * source.vx + source.vy * source.vy)
    const velOpacity = Math.min(1, speed * 50)
    const gradient = ctx.createRadialGradient(px, py, 0, px, py, r)
    gradient.addColorStop(0, `rgba(${Math.round((source.vx * 0.5 + 0.5) * 255)}, ${Math.round((source.vy * 0.5 + 0.5) * 255)}, 0, ${velOpacity})`)
    gradient.addColorStop(1, 'rgba(127, 127, 0, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(px - r, py - r, r * 2, r * 2)

    // 密度颜色 → 存到 RGB
    const [cr, cg, cb] = source.color
    const densityGradient = ctx.createRadialGradient(px, py, 0, px, py, r * 0.8)
    densityGradient.addColorStop(0, `rgba(${Math.round(cr * 255)}, ${Math.round(cg * 255)}, ${Math.round(cb * 255)}, 0.8)`)
    densityGradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = densityGradient
    ctx.fillRect(px - r, py - r, r * 2, r * 2)

    ctx.restore()
    this.sourceTexture.needsUpdate = true
  }

  /**
   * 批量注入源（用正交相机 + shader 方式）
   */
  addSources(sources: FluidSource[]): void {
    for (const src of sources) {
      this.addSource(src)
    }
  }

  // ────────────────────────────────────────
  // 模拟步进
  // ────────────────────────────────────────

  /**
   * 执行一帧流体模拟
   *   1. 叠加注入源
   *   2. 速度平流 (velocity1 → velocity2)
   *   3. 速度扩散 (velocity2 → velocity1)
   *   4. 密度平流 (density1 → density2)
   *   5. 散度计算 (velocity1 → divergence)
   *   6. Jacobi 迭代 (divergence → pressure ping-pong)
   *   7. 投影 (velocity1 + pressure → velocity2)
   */
  step(): void {
    const r = this.renderer
    const { velocityRT1, velocityRT2, densityRT1, densityRT2,
            divergenceRT, pressureRT1, pressureRT2 } = this

    // ── 0. 叠加注入源到速度/密度场 ──
    // (我们直接在速度场和密度场的 RT 上覆盖绘制)
    // 简单实现：先将 sourceTexture 叠加到 RT
    this.blendSourceToRT(velocityRT1, 'velocity')
    this.blendSourceToRT(densityRT1, 'density')

    // ── 1. 速度平流：velocity1 → velocity2 ──
    this.advectVelocityMat.uniforms.tVelocity.value = velocityRT1.texture
    this.advectVelocityMat.uniforms.tSource.value = velocityRT1.texture
    this.renderFullscreen(r, velocityRT2, this.advectVelocityMat)

    // ── 2. 速度扩散：velocity2 → velocity1 ──
    this.diffuseVelocityMat.uniforms.tSource.value = velocityRT2.texture
    this.renderFullscreen(r, velocityRT1, this.diffuseVelocityMat)

    // ── 3. 密度平流：density1 → density2 ──
    this.advectDensityMat.uniforms.tVelocity.value = velocityRT1.texture
    this.advectDensityMat.uniforms.tDensity.value = densityRT1.texture
    this.renderFullscreen(r, densityRT2, this.advectDensityMat)

    // ── 4. 散度：velocity1 → divergence ──
    this.divergenceMat.uniforms.tVelocity.value = velocityRT1.texture
    this.renderFullscreen(r, divergenceRT, this.divergenceMat)

    // ── 5. Jacobi 迭代 (20-40 次) ──
    this.jacobiMat.uniforms.tDivergence.value = divergenceRT.texture
    // 先清除压力
    r.setRenderTarget(pressureRT1)
    r.clear()
    r.setRenderTarget(pressureRT2)
    r.clear()

    let even = true
    for (let i = 0; i < this.config.jacobiIterations; i++) {
      if (even) {
        this.jacobiMat.uniforms.tPressure.value = pressureRT1.texture
        this.renderFullscreen(r, pressureRT2, this.jacobiMat)
      } else {
        this.jacobiMat.uniforms.tPressure.value = pressureRT2.texture
        this.renderFullscreen(r, pressureRT1, this.jacobiMat)
      }
      even = !even
    }

    // ── 6. 投影（减去压力梯度）：velocity1 → velocity2 ──
    const finalPressure = even ? pressureRT1 : pressureRT2
    this.projectMat.uniforms.tVelocity.value = velocityRT1.texture
    this.projectMat.uniforms.tPressure.value = finalPressure.texture
    this.renderFullscreen(r, velocityRT2, this.projectMat)

    // ── 更新引用 ──
    this.velocityTexture = velocityRT2.texture
    this.densityTexture = densityRT2.texture

    // ── 清除源注入画布 ──
    this.sourceCtx.clearRect(0, 0, this.config.resolution, this.config.resolution)

    // Ping-pong 交换：下帧从 velocity2/density2 读
    ;[this.velocityRT1, this.velocityRT2] = [this.velocityRT2, this.velocityRT1]
    ;[this.densityRT1, this.densityRT2] = [this.densityRT2, this.densityRT1]
  }

  // ────────────────────────────────────────
  // 清空
  // ────────────────────────────────────────

  /** 重置所有场到零 */
  clear(): void {
    const r = this.renderer
    ;[this.velocityRT1, this.velocityRT2,
      this.densityRT1, this.densityRT2,
      this.divergenceRT, this.pressureRT1, this.pressureRT2].forEach(rt => {
      r.setRenderTarget(rt)
      r.clear()
    })
    r.setRenderTarget(null)
    this.sourceCtx.clearRect(0, 0, this.config.resolution, this.config.resolution)
  }

  // ────────────────────────────────────────
  // 内部工具
  // ────────────────────────────────────────

  private renderFullscreen(
    renderer: THREE.WebGLRenderer,
    target: THREE.WebGLRenderTarget,
    material: THREE.ShaderMaterial,
  ): void {
    this.quad.material = material
    renderer.setRenderTarget(target)
    renderer.render(this.scene, this.camera)
    renderer.setRenderTarget(null)
  }

  /** 将 source canvas 作为叠加层混合到 RT */
  private blendSourceToRT(rt: THREE.WebGLRenderTarget, _type: 'velocity' | 'density'): void {
    // 复用现有的 WebGL state：直接在全屏 quad 上做 additive blend
    const r = this.renderer
    const oldRT = r.getRenderTarget()

    // 保存当前渲染目标内容
    r.setRenderTarget(rt)

    // 用 additive 方式绘制 sourceTexture
    const mat = new THREE.MeshBasicMaterial({
      map: this.sourceTexture,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.5,
    })
    this.quad.material = mat
    r.render(this.scene, this.camera)
    mat.dispose()

    r.setRenderTarget(oldRT)
  }

  // ────────────────────────────────────────
  // 资源释放
  // ────────────────────────────────────────

  dispose(): void {
    this.velocityRT1.dispose()
    this.velocityRT2.dispose()
    this.densityRT1.dispose()
    this.densityRT2.dispose()
    this.divergenceRT.dispose()
    this.pressureRT1.dispose()
    this.pressureRT2.dispose()
    this.sourceTexture.dispose()
    this.quad.geometry.dispose()
    ;(this.quad.material as THREE.Material).dispose()
    this.advectVelocityMat.dispose()
    this.diffuseVelocityMat.dispose()
    this.advectDensityMat.dispose()
    this.divergenceMat.dispose()
    this.jacobiMat.dispose()
    this.projectMat.dispose()
  }
}
