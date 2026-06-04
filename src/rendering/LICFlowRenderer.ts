/**
 * LIC 流线渲染器 — Line Integral Convolution
 *
 * 将流体速度场拉成丝绸般的流线纹理。适用于：
 *   - 脊柱经络流线可视化
 *   - 气场流动方向展示
 *   - 体态能量流动路径
 *
 * 正向 + 反向双程积分，均匀采样白噪声，产生高质感的流线效果。
 */
import * as THREE from 'three'
import { LIC_FLOW_FRAG } from './shaders'

export interface LICConfig {
  /** 渲染分辨率 (256/512) */
  resolution: number
  /** 积分步长 — 越大流线越长 */
  stepSize: number
  /** 积分步数 — 越大越平滑但越贵 */
  numSteps: number
  /** 输出强度 0~1 */
  intensity: number
}

const DEFAULT_CONFIG: LICConfig = {
  resolution: 256,
  stepSize: 0.003,
  numSteps: 12,
  intensity: 0.7,
}

export class LICFlowRenderer {
  private renderer: THREE.WebGLRenderer
  private config: LICConfig

  private quad: THREE.Mesh
  private camera: THREE.OrthographicCamera
  private scene: THREE.Scene

  private licRT: THREE.WebGLRenderTarget
  private noiseTexture: THREE.DataTexture
  private licMat: THREE.ShaderMaterial

  constructor(renderer: THREE.WebGLRenderer, config: Partial<LICConfig> = {}) {
    this.renderer = renderer
    this.config = { ...DEFAULT_CONFIG, ...config }
    const res = this.config.resolution

    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1)
    this.scene = new THREE.Scene()
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial())
    this.scene.add(this.quad)
    this.quad.position.set(0.5, 0.5, 0)

    // ── LIC RT ──
    this.licRT = new THREE.WebGLRenderTarget(res, res, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
    })

    // ── 白噪声纹理 ──
    this.noiseTexture = this.generateNoiseTexture(res)

    // ── LIC 着色材质 ──
    this.licMat = new THREE.ShaderMaterial({
      uniforms: {
        tVelocity: { value: null },
        tNoise: { value: this.noiseTexture },
        uStepSize: { value: this.config.stepSize },
        uNumSteps: { value: this.config.numSteps },
        uIntensity: { value: this.config.intensity },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: LIC_FLOW_FRAG,
      depthTest: false,
      depthWrite: false,
    })
  }

  // ────────────────────────────────
  // 公开接口
  // ────────────────────────────────

  /** 渲染 LIC 流线到内部 RT，返回 RT 纹理供复合器使用 */
  render(velocityTexture: THREE.Texture): THREE.Texture {
    this.licMat.uniforms.tVelocity.value = velocityTexture
    this.renderFullscreen(this.renderer, this.licRT, this.licMat)
    return this.licRT.texture
  }

  /** 直接渲染 LIC 流线到目标（用于调试或单独显示） */
  renderTo(velocityTexture: THREE.Texture, target: THREE.WebGLRenderTarget | null): void {
    this.licMat.uniforms.tVelocity.value = velocityTexture
    this.renderFullscreen(this.renderer, target, this.licMat)
  }

  /** 获取 LIC 纹理 */
  getTexture(): THREE.Texture {
    return this.licRT.texture
  }

  /** 更新 LIC 参数 */
  setConfig(config: Partial<LICConfig>): void {
    Object.assign(this.config, config)
    this.licMat.uniforms.uStepSize.value = this.config.stepSize
    this.licMat.uniforms.uNumSteps.value = this.config.numSteps
    this.licMat.uniforms.uIntensity.value = this.config.intensity
  }

  /** 获取分辨率 */
  get resolution(): number {
    return this.config.resolution
  }

  // ────────────────────────────────
  // 内部
  // ────────────────────────────────

  /** 生成高质量白噪声纹理 */
  private generateNoiseTexture(res: number): THREE.DataTexture {
    const size = res * res
    const data = new Float32Array(size * 4)
    for (let i = 0; i < size; i++) {
      const val = Math.random()
      data[i * 4] = val     // R
      data[i * 4 + 1] = val // G
      data[i * 4 + 2] = val // B
      data[i * 4 + 3] = 1   // A
    }
    const tex = new THREE.DataTexture(data, res, res, THREE.RGBAFormat, THREE.FloatType)
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.needsUpdate = true
    return tex
  }

  private renderFullscreen(
    renderer: THREE.WebGLRenderer,
    target: THREE.WebGLRenderTarget | null,
    material: THREE.ShaderMaterial,
  ): void {
    this.quad.material = material
    renderer.setRenderTarget(target)
    renderer.render(this.scene, this.camera)
    if (target) renderer.setRenderTarget(null)
  }

  dispose(): void {
    this.licRT.dispose()
    this.noiseTexture.dispose()
    this.licMat.dispose()
    this.quad.geometry.dispose()
    ;(this.quad.material as THREE.Material).dispose()
  }
}
