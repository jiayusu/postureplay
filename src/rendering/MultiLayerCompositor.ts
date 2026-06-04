/**
 * MultiLayerCompositor — 全管线合成器
 *
 * 管线段：
 *   1. Compute: fluid / rd / nbody / particles / meridian / lic / chakra → 各自 RT
 *   2. Multi-layer composite → compositeRT（加法混合所有特效层）
 *   3. Breathing warp → warpRT（呼吸扭曲 compositeRT）
 *   4. Output → screen 或外部 RT
 */
import * as THREE from 'three'
import { MULTI_LAYER_COMPOSITE_FRAG } from './shaders_ext'
import { BREATHING_WARP_FRAG } from './shaders_ext'

export interface CompositorLayerConfig {
  rdStrength: number
  nBodyStrength: number
  licStrength: number
  particleStrength: number
  meridianStrength: number
  chakraStrength: number
}

const DEFAULT_LAYERS: CompositorLayerConfig = {
  rdStrength: 1.2,
  nBodyStrength: 1.5,
  licStrength: 1.0,
  particleStrength: 1.2,
  meridianStrength: 1.0,
  chakraStrength: 1.5,
}

export class MultiLayerCompositor {
  private renderer: THREE.WebGLRenderer
  private layerConfig: CompositorLayerConfig

  private quad: THREE.Mesh
  private camera: THREE.OrthographicCamera
  private scene: THREE.Scene

  // 中间 RT
  private compositeRT: THREE.WebGLRenderTarget
  private warpRT: THREE.WebGLRenderTarget

  // 着色材质
  private compositeMat: THREE.ShaderMaterial
  private warpMat: THREE.ShaderMaterial
  private screenBlitMat: THREE.ShaderMaterial

  private _breathPhase = 0
  private _elapsed = 0

  constructor(renderer: THREE.WebGLRenderer, resolution: number = 512) {
    this.renderer = renderer
    this.layerConfig = { ...DEFAULT_LAYERS }

    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1)
    this.scene = new THREE.Scene()
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial())
    // PlaneGeometry(1,1) 默认顶点范围 (-0.5,-0.5)~(0.5,0.5)
    // OrthographicCamera(0,1,1,0) 视口范围 x:[0,1] y:[0,1]
    // quad 必须移到 (0.5, 0.5) 才能覆盖整个视口
    this.quad.position.set(0.5, 0.5, 0)
    this.scene.add(this.quad)

    const rtOpts: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
    }

    this.compositeRT = new THREE.WebGLRenderTarget(resolution, resolution, rtOpts)
    this.warpRT = new THREE.WebGLRenderTarget(resolution, resolution, rtOpts)

    // ── 多层合成着色器 ──
    this.compositeMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        tRD: { value: null },
        tNBody: { value: null },
        tLIC: { value: null },
        tParticles: { value: null },
        tMeridian: { value: null },
        tChakra: { value: null },
        uRDStrength: { value: this.layerConfig.rdStrength },
        uNBodyStrength: { value: this.layerConfig.nBodyStrength },
        uLICStrength: { value: this.layerConfig.licStrength },
        uParticleStrength: { value: this.layerConfig.particleStrength },
        uMeridianStrength: { value: this.layerConfig.meridianStrength },
        uChakraStrength: { value: this.layerConfig.chakraStrength },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: MULTI_LAYER_COMPOSITE_FRAG,
      depthTest: false, depthWrite: false,
    })

    // ── 呼吸扭曲着色器 ──
    this.warpMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        uBreathPhase: { value: 0 },
        uBreathAmplitude: { value: 0.012 },
        uRippleCount: { value: 3 },
        uCenterX: { value: 0.5 },
        uCenterY: { value: 0.55 },
        uTime: { value: 0 },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: BREATHING_WARP_FRAG,
      depthTest: false, depthWrite: false,
    })

    // ── 屏幕 blit 着色器 (warpRT → screen) ──
    this.screenBlitMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        uGlobalAlpha: { value: 1.0 },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform sampler2D tScene;
        uniform float uGlobalAlpha;
        void main() {
          vec4 c = texture2D(tScene, vUv);
          gl_FragColor = vec4(c.rgb, c.a * uGlobalAlpha);
        }`,
      depthTest: false, depthWrite: false,
      transparent: true,
    })
  }

  // ────────────────────────────
  // 配置
  // ────────────────────────────

  setLayers(config: Partial<CompositorLayerConfig>): void {
    Object.assign(this.layerConfig, config)
    const u = this.compositeMat.uniforms
    u.uRDStrength.value = this.layerConfig.rdStrength
    u.uNBodyStrength.value = this.layerConfig.nBodyStrength
    u.uLICStrength.value = this.layerConfig.licStrength
    u.uParticleStrength.value = this.layerConfig.particleStrength
    u.uMeridianStrength.value = this.layerConfig.meridianStrength
    u.uChakraStrength.value = this.layerConfig.chakraStrength
  }

  /** 更新呼吸扭曲参数 */
  setBreath(dt: number, breathRate: number = 12, intensity: number = 1): void {
    this._elapsed += dt
    this._breathPhase = (this._elapsed * breathRate / 60) % 1
    this.warpMat.uniforms.uBreathPhase.value = this._breathPhase
    this.warpMat.uniforms.uBreathAmplitude.value = 0.012 * intensity
    this.warpMat.uniforms.uTime.value = this._elapsed
  }

  setBreathCenter(x: number, y: number): void {
    this.warpMat.uniforms.uCenterX.value = x
    this.warpMat.uniforms.uCenterY.value = y
  }

  /** 设置全局透明度（用于性能降级等场景） */
  setGlobalAlpha(alpha: number): void {
    this.screenBlitMat.uniforms.uGlobalAlpha.value = alpha
  }

  // ────────────────────────────
  // 合成方法
  // ────────────────────────────

  /**
   * 全管线合成（推荐用法）
   *   Step 1: 多层 additive 混合 → compositeRT
   *   Step 2: 呼吸扭曲 → warpRT
   *   Step 3: warpRT → screen
   */
  compositeFinal(params: {
    rd: THREE.Texture
    nBody: THREE.Texture
    lic: THREE.Texture
    particles: THREE.Texture
    meridian: THREE.Texture
    chakra: THREE.Texture
    dt: number
  }): void {
    const r = this.renderer

    // Step 1: 多层合成 → compositeRT
    const cu = this.compositeMat.uniforms
    cu.tScene.value = null
    cu.tRD.value = params.rd
    cu.tNBody.value = params.nBody
    cu.tLIC.value = params.lic
    cu.tParticles.value = params.particles
    cu.tMeridian.value = params.meridian
    cu.tChakra.value = params.chakra
    this.renderPass(r, this.compositeRT, this.compositeMat)

    // Step 2: 呼吸扭曲 → warpRT
    this.warpMat.uniforms.tScene.value = this.compositeRT.texture
    this.renderPass(r, this.warpRT, this.warpMat)

    // Step 3: warpRT → screen (透明叠加)
    this.screenBlitMat.uniforms.tScene.value = this.warpRT.texture
    this.quad.material = this.screenBlitMat
    r.setRenderTarget(null)
    // 不清除，让特效透明叠加
    r.render(this.scene, this.camera)
  }

  /** 仅执行多层合成（跳过呼吸扭曲），渲染到目标 */
  compositeLayers(
    rd: THREE.Texture, nBody: THREE.Texture, lic: THREE.Texture,
    particles: THREE.Texture, meridian: THREE.Texture, chakra: THREE.Texture,
    target: THREE.WebGLRenderTarget | null,
  ): void {
    const cu = this.compositeMat.uniforms
    cu.tScene.value = null
    cu.tRD.value = rd
    cu.tNBody.value = nBody
    cu.tLIC.value = lic
    cu.tParticles.value = particles
    cu.tMeridian.value = meridian
    cu.tChakra.value = chakra
    this.renderPass(this.renderer, target, this.compositeMat)
  }

  // ────────────────────────────
  // 内部
  // ────────────────────────────

  private renderPass(
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
    this.warpRT.dispose()
    this.compositeMat.dispose()
    this.warpMat.dispose()
    this.screenBlitMat.dispose()
    this.quad.geometry.dispose()
    ;(this.quad.material as THREE.Material).dispose()
  }
}
