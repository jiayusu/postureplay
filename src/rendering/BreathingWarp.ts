/**
 * 呼吸扭曲空间 — 以呼吸节律驱动的全屏径向畸变
 *
 * 吸 = 膨胀（像素向外推），呼 = 收缩（像素向内拉）
 * 叠加同心圆波纹，在脊柱中心产生"能量涟漪"。
 * 连同心跳/呼吸数据后效果尤为沉浸。
 */
import * as THREE from 'three'
import { BREATHING_WARP_FRAG } from './shaders_ext'

export interface BreathingWarpConfig {
  resolution: number
  amplitude: number         // 0.005~0.05
  rippleCount: number       // 波纹圈数
  centerX: number           // 扭曲中心 0~1
  centerY: number
}

const DEFAULT_CONFIG: BreathingWarpConfig = {
  resolution: 512,
  amplitude: 0.015,
  rippleCount: 3,
  centerX: 0.5,
  centerY: 0.55, // 脊柱中心略偏上
}

export class BreathingWarp {
  private renderer: THREE.WebGLRenderer
  private config: BreathingWarpConfig

  private quad: THREE.Mesh
  private camera: THREE.OrthographicCamera
  private scene: THREE.Scene

  private warpRT: THREE.WebGLRenderTarget
  private warpMat: THREE.ShaderMaterial

  _breathPhase: number = 0     // 0→1 呼吸阶段
  _elapsed: number = 0

  constructor(renderer: THREE.WebGLRenderer, config: Partial<BreathingWarpConfig> = {}) {
    this.renderer = renderer
    this.config = { ...DEFAULT_CONFIG, ...config }
    const res = this.config.resolution

    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1)
    this.scene = new THREE.Scene()
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial())
    this.scene.add(this.quad)
    this.quad.position.set(0.5, 0.5, 0)

    this.warpRT = new THREE.WebGLRenderTarget(res, res, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
    })

    this.warpMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        uBreathPhase: { value: 0 },
        uBreathAmplitude: { value: this.config.amplitude },
        uRippleCount: { value: this.config.rippleCount },
        uCenterX: { value: this.config.centerX },
        uCenterY: { value: this.config.centerY },
        uTime: { value: 0 },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: BREATHING_WARP_FRAG,
      depthTest: false, depthWrite: false,
    })
  }

  // ────────────────────────────
  // 公开接口
  // ────────────────────────────

  /**
   * @param dt      帧间隔
   * @param breathRate 呼吸频率 (次/分钟, 默认 12)
   * @param intensity  扭曲强度乘数 0~2
   */
  update(dt: number, breathRate: number = 12, intensity: number = 1): void {
    this._elapsed += dt
    // 呼吸周期：正弦波 0→1→0
    const cycle = (this._elapsed * breathRate / 60) % 1
    this._breathPhase = cycle
    this.warpMat.uniforms.uBreathPhase.value = cycle
    this.warpMat.uniforms.uBreathAmplitude.value = this.config.amplitude * intensity
    this.warpMat.uniforms.uTime.value = this._elapsed
  }

  /** 应用扭曲到输入纹理，返回扭曲后的纹理 */
  warp(inputTexture: THREE.Texture): THREE.Texture {
    this.warpMat.uniforms.tScene.value = inputTexture
    this.renderFullscreen(this.renderer, this.warpRT, this.warpMat)
    return this.warpRT.texture
  }

  /** 直接扭曲并渲染到目标 */
  warpTo(inputTexture: THREE.Texture, target: THREE.WebGLRenderTarget | null): void {
    this.warpMat.uniforms.tScene.value = inputTexture
    this.renderFullscreen(this.renderer, target, this.warpMat)
  }

  /** 用当前场景纹理做扭曲 */
  getTexture(): THREE.Texture {
    return this.warpRT.texture
  }

  /** 设置扭曲中心（从关键点坐标更新） */
  setCenter(x: number, y: number): void {
    this.config.centerX = x
    this.config.centerY = y
    this.warpMat.uniforms.uCenterX.value = x
    this.warpMat.uniforms.uCenterY.value = y
  }

  // ────────────────────────────
  // 内部
  // ────────────────────────────

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
    this.warpRT.dispose()
    this.warpMat.dispose()
    this.quad.geometry.dispose()
    ;(this.quad.material as THREE.Material).dispose()
  }
}
