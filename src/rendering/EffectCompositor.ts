/**
 * EffectCompositor — RD + NBody + LIC 三元语法合成器
 *
 * 将三个独立的 GPU 特效合成为一个 RT：
 *   tRD    = Reaction-Diffusion 图灵斑纹（面相气色）
 *   tNBody = N-Body 灵气星云（体态环绕粒子）
 *   tLIC   = LIC 流线（速度场流线可视化）
 *
 * 输出加法混合（additive blending）到场景之上，形成风格化的"气场"叠加层。
 */
import * as THREE from 'three'
import { TRIPLE_EFFECT_COMPOSITE_FRAG } from './shaders'

export interface CompositorConfig {
  /** 渲染分辨率 */
  resolution: number
  /** RD 斑纹强度 0~1 */
  rdStrength: number
  /** N-Body 星云强度 0~1 */
  nBodyStrength: number
  /** LIC 流线强度 0~1 */
  licStrength: number
}

const DEFAULT_CONFIG: CompositorConfig = {
  resolution: 512,
  rdStrength: 0.35,
  nBodyStrength: 0.5,
  licStrength: 0.3,
}

export class EffectCompositor {
  private renderer: THREE.WebGLRenderer
  private config: CompositorConfig

  private quad: THREE.Mesh
  private camera: THREE.OrthographicCamera
  private scene: THREE.Scene

  private compositeRT: THREE.WebGLRenderTarget
  private compositeMat: THREE.ShaderMaterial

  constructor(renderer: THREE.WebGLRenderer, config: Partial<CompositorConfig> = {}) {
    this.renderer = renderer
    this.config = { ...DEFAULT_CONFIG, ...config }
    const res = this.config.resolution

    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1)
    this.scene = new THREE.Scene()
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial())
    this.scene.add(this.quad)
    this.quad.position.set(0.5, 0.5, 0)

    // ── 合成 RT ──
    this.compositeRT = new THREE.WebGLRenderTarget(res, res, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
    })

    // ── 三元复合着色材质 ──
    this.compositeMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        tRD: { value: null },
        tNBody: { value: null },
        tLIC: { value: null },
        uRDStrength: { value: this.config.rdStrength },
        uNBodyStrength: { value: this.config.nBodyStrength },
        uLICStrength: { value: this.config.licStrength },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: TRIPLE_EFFECT_COMPOSITE_FRAG,
      depthTest: false,
      depthWrite: false,
    })
  }

  // ────────────────────────────────
  // 公开接口
  // ────────────────────────────────

  /**
   * 合成三个特效纹理 → 输出到内部 RT
   * @returns 合成后的 RT 纹理
   */
  composite(
    rdTexture: THREE.Texture,
    nBodyTexture: THREE.Texture,
    licTexture: THREE.Texture,
    sceneTexture?: THREE.Texture, // 可选：叠加到场景纹理上
  ): THREE.Texture {
    this.compositeMat.uniforms.tRD.value = rdTexture
    this.compositeMat.uniforms.tNBody.value = nBodyTexture
    this.compositeMat.uniforms.tLIC.value = licTexture
    this.compositeMat.uniforms.tScene.value = sceneTexture || null
    this.renderFullscreen(this.renderer, this.compositeRT, this.compositeMat)
    return this.compositeRT.texture
  }

  /**
   * 直接合成到屏幕或目标 RT（不经过内部 RT）
   */
  compositeTo(
    rdTexture: THREE.Texture,
    nBodyTexture: THREE.Texture,
    licTexture: THREE.Texture,
    target: THREE.WebGLRenderTarget | null,
    sceneTexture?: THREE.Texture,
  ): void {
    this.compositeMat.uniforms.tRD.value = rdTexture
    this.compositeMat.uniforms.tNBody.value = nBodyTexture
    this.compositeMat.uniforms.tLIC.value = licTexture
    this.compositeMat.uniforms.tScene.value = sceneTexture || null
    this.renderFullscreen(this.renderer, target, this.compositeMat)
  }

  /** 获取合成结果纹理 */
  getTexture(): THREE.Texture {
    return this.compositeRT.texture
  }

  /** 更新各层强度 */
  setStrength(rd?: number, nBody?: number, lic?: number): void {
    if (rd !== undefined) {
      this.config.rdStrength = rd
      this.compositeMat.uniforms.uRDStrength.value = rd
    }
    if (nBody !== undefined) {
      this.config.nBodyStrength = nBody
      this.compositeMat.uniforms.uNBodyStrength.value = nBody
    }
    if (lic !== undefined) {
      this.config.licStrength = lic
      this.compositeMat.uniforms.uLICStrength.value = lic
    }
  }

  // ────────────────────────────────
  // 内部
  // ────────────────────────────────

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
    this.compositeRT.dispose()
    this.compositeMat.dispose()
    this.quad.geometry.dispose()
    ;(this.quad.material as THREE.Material).dispose()
  }
}
