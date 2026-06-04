/**
 * GPU Rutt/Etra 线框浮雕 — 将 CPU Sobel 卷积迁移到 GLSL
 *
 * 替换原有的 wireframeRelief.ts（纯 JavaScript 逐像素计算），
 * 使用单个 fragment shader 完成：Sobel 边缘 + 亮度位移 + 线框遮罩 + 噪声
 */
import * as THREE from 'three'
import { RELIEF_WIREFRAME_FRAG } from './shaders'

export interface ReliefConfig {
  edgeStrength: number     // 边缘强度 0~2
  wireSpacing: number      // 线间距 0.003~0.02
  displacement: number     // 垂直位移 0~1
  lineColor: THREE.Color
  glowColor: THREE.Color
}

const DEFAULT_RELIEF_CONFIG: ReliefConfig = {
  edgeStrength: 1.2,
  wireSpacing: 0.008,
  displacement: 0.5,
  lineColor: new THREE.Color('#3a2a1a'),   // 深棕线
  glowColor: new THREE.Color('#d4a855'),   // 金色辉光
}

export class GPUWireframeRelief {
  private renderer: THREE.WebGLRenderer
  private config: ReliefConfig

  private quad: THREE.Mesh
  private camera: THREE.OrthographicCamera
  private scene: THREE.Scene
  private material: THREE.ShaderMaterial

  constructor(renderer: THREE.WebGLRenderer, width: number, height: number, config: Partial<ReliefConfig> = {}) {
    this.renderer = renderer
    this.config = { ...DEFAULT_RELIEF_CONFIG, ...config }

    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1)
    this.scene = new THREE.Scene()

    const geo = new THREE.PlaneGeometry(1, 1)
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uTexelSize: { value: new THREE.Vector2(1 / width, 1 / height) },
        uEdgeStrength: { value: this.config.edgeStrength },
        uWireSpacing: { value: this.config.wireSpacing },
        uDisplacement: { value: this.config.displacement },
        uTime: { value: 0 },
        uLineColor: { value: this.config.lineColor },
        uGlowColor: { value: this.config.glowColor },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: RELIEF_WIREFRAME_FRAG,
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new THREE.Mesh(geo, this.material)
    this.scene.add(this.quad)
    this.quad.position.set(0.5, 0.5, 0)
  }

  /** 设置输入纹理（通常为视频纹理） */
  setInputTexture(texture: THREE.Texture): void {
    this.material.uniforms.tDiffuse.value = texture
  }

  /** 更新配置 */
  setConfig(config: Partial<ReliefConfig>): void {
    Object.assign(this.config, config)
    const u = this.material.uniforms
    if (config.edgeStrength !== undefined) u.uEdgeStrength.value = config.edgeStrength
    if (config.wireSpacing !== undefined) u.uWireSpacing.value = config.wireSpacing
    if (config.displacement !== undefined) u.uDisplacement.value = config.displacement
    if (config.lineColor) u.uLineColor.value = config.lineColor
    if (config.glowColor) u.uGlowColor.value = config.glowColor
  }

  /** 更新时间和分辨率 */
  update(time: number, width?: number, height?: number): void {
    this.material.uniforms.uTime.value = time
    if (width && height) {
      this.material.uniforms.uTexelSize.value.set(1 / width, 1 / height)
    }
  }

  /**
   * 渲染到屏幕或指定 RenderTarget
   * @param target 为 null 则渲染到屏幕
   */
  render(target: THREE.WebGLRenderTarget | null = null): void {
    this.renderer.setRenderTarget(target)
    this.renderer.render(this.scene, this.camera)
    this.renderer.setRenderTarget(null)
  }

  dispose(): void {
    this.material.dispose()
    this.quad.geometry.dispose()
  }
}
