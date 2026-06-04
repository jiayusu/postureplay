/**
 * 经络电磁力场线 — EM Field Lines between body keypoints
 *
 * 将体态关键点（肩/肘/腕/髋/膝/踝）映射为电荷，
 * 正电荷（关节）向外辐射，负电荷（压迫点）向内吸引，
 * 形成类似中医经络的力场线纹理。
 *
 * 两步渲染：
 *   1. EM 力场计算 → fieldRT
 *   2. LIC 追踪 + 渲染 → output RT
 */
import * as THREE from 'three'
import { MERIDIAN_EM_FIELD_FRAG, MERIDIAN_RENDER_FRAG } from './shaders_ext'

/** 单个电荷 */
export interface MeridianCharge {
  x: number         // 0~1
  y: number
  charge: number    // 正=源(关节) / 负=汇(肌肉紧张)
  radius: number    // 影响半径
}

export interface MeridianConfig {
  resolution: number
  stepSize: number
  numSteps: number
  intensity: number
}

const DEFAULT_CONFIG: MeridianConfig = {
  resolution: 256,
  stepSize: 0.003,
  numSteps: 10,
  intensity: 0.6,
}

// (reserved for future palette-driven color mapping)

export class MeridianForceLines {
  private renderer: THREE.WebGLRenderer
  private config: MeridianConfig

  private quad: THREE.Mesh
  private camera: THREE.OrthographicCamera
  private scene: THREE.Scene

  private fieldRT: THREE.WebGLRenderTarget
  private outputRT: THREE.WebGLRenderTarget
  private noiseTexture: THREE.DataTexture

  private fieldMat: THREE.ShaderMaterial
  private renderMat: THREE.ShaderMaterial

  constructor(renderer: THREE.WebGLRenderer, config: Partial<MeridianConfig> = {}) {
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
      type: THREE.FloatType,
    }
    this.fieldRT = new THREE.WebGLRenderTarget(res, res, rtOpts)
    this.outputRT = new THREE.WebGLRenderTarget(res, res, rtOpts)

    // 白噪声（用于力场线追踪）
    this.noiseTexture = this.generateNoise(res)

    // 力场计算
    this.fieldMat = new THREE.ShaderMaterial({
      uniforms: {
        uCharges: { value: new Array(12).fill(new THREE.Vector4(0, 0, 0, 0)) },
        uChargeCount: { value: 0 },
        uTexelSize: { value: new THREE.Vector2(1 / res, 1 / res) },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: MERIDIAN_EM_FIELD_FRAG,
      depthTest: false, depthWrite: false,
    })

    // 力场线渲染
    this.renderMat = new THREE.ShaderMaterial({
      uniforms: {
        tField: { value: null },
        tNoise: { value: this.noiseTexture },
        uStepSize: { value: this.config.stepSize },
        uNumSteps: { value: this.config.numSteps },
        uIntensity: { value: this.config.intensity },
        uLineColor: { value: new THREE.Color('#22dd88') },
        uNodeColor: { value: new THREE.Color('#ffdd44') },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: MERIDIAN_RENDER_FRAG,
      depthTest: false, depthWrite: false,
    })
  }

  // ────────────────────────────
  // 公开接口
  // ────────────────────────────

  /**
   * 从 MediaPipe 关键点生成电荷
   * 覆盖 12 个主要关节点：肩×2 / 肘×2 / 腕×2 / 髋×2 / 膝×2 / 踝×2
   */
  setKeypoints(
    keypoints: Array<{ x: number; y: number }>,
    spineScore?: number, // 用于调整电荷极性
  ): void {
    const charges: MeridianCharge[] = []
    const indices = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]
    const altSign = [1, 1, -1, -1, 1, 1, -1, 1, -1, 1, -1, 1] // 交替正负

    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i]
      if (idx >= keypoints.length) continue
      const kp = keypoints[idx]
      if (!kp || kp.x === 0 && kp.y === 0) continue

      const scoreFactor = (spineScore ?? 50) / 100
      charges.push({
        x: kp.x,
        y: kp.y,
        charge: altSign[i] * (0.5 + scoreFactor),
        radius: 0.04 + (i % 2) * 0.01,
      })
    }

    // 设置 uniform
    this.fieldMat.uniforms.uChargeCount.value = charges.length
    const arr = this.fieldMat.uniforms.uCharges.value as THREE.Vector4[]
    for (let i = 0; i < 12; i++) {
      if (i < charges.length) {
        const c = charges[i]
        arr[i].set(c.x, c.y, c.charge, c.radius)
      } else {
        arr[i].set(0, 0, 0, 0)
      }
    }
  }

  /** 执行渲染：计算力场 → 追踪力场线 → 返回纹理 */
  render(): THREE.Texture {
    const r = this.renderer

    // Step 1: 计算 EM 力场
    this.renderFullscreen(r, this.fieldRT, this.fieldMat)

    // Step 2: 追踪力场线
    this.renderMat.uniforms.tField.value = this.fieldRT.texture
    this.renderFullscreen(r, this.outputRT, this.renderMat)

    return this.outputRT.texture
  }

  /** 直接渲染到目标 */
  renderTo(target: THREE.WebGLRenderTarget | null): void {
    this.renderMat.uniforms.tField.value = this.fieldRT.texture
    // 需要先算力场
    const r = this.renderer
    this.renderFullscreen(r, this.fieldRT, this.fieldMat)
    this.renderFullscreen(r, target, this.renderMat)
  }

  getTexture(): THREE.Texture {
    return this.outputRT.texture
  }

  /** 根据体态分数选经络线颜色（红=紧张, 绿=放松, 金=平衡） */
  setColorByScore(score: number): void {
    const t = score / 100
    const color = new THREE.Color()
    // 低分→红, 中分→金, 高分→绿
    color.setHSL(0.15 + t * 0.25, 0.8, 0.4 + t * 0.3)
    this.renderMat.uniforms.uLineColor.value = color
  }

  dispose(): void {
    this.fieldRT.dispose()
    this.outputRT.dispose()
    this.noiseTexture.dispose()
    this.fieldMat.dispose()
    this.renderMat.dispose()
    this.quad.geometry.dispose()
    ;(this.quad.material as THREE.Material).dispose()
  }

  // ────────────────────────────
  // 内部
  // ────────────────────────────

  private generateNoise(res: number): THREE.DataTexture {
    const size = res * res
    const data = new Float32Array(size * 4)
    for (let i = 0; i < size; i++) {
      const v = Math.random()
      data[i * 4] = v
      data[i * 4 + 1] = v
      data[i * 4 + 2] = v
      data[i * 4 + 3] = 1
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
}
