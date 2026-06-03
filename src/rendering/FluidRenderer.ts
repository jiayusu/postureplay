/**
 * 流体可视化渲染器
 *
 * 将 FluidSolver 的速度场和密度场可视化叠加到场景中：
 *   - 速度场染色（粒子追踪参考）
 *   - 密度场墨迹叠加
 *   - 漩涡爆发 + 光带拖尾
 */
import * as THREE from 'three'
import {
  FLOW_VISUALIZE_FRAG,
  FLUID_COMPOSITE_FRAG,
  VORTEX_BURST_FRAG,
  PULSE_RING_FRAG,
  ENERGY_TURBULENCE_FRAG,
} from './shaders'
import type { FluidSolver } from './FluidSolver'

export interface FluidRenderConfig {
  intensity: number          // 流体强度 0~2
  mode: 'overlay' | 'additive' | 'screen'
}

export class FluidRenderer {
  private renderer: THREE.WebGLRenderer
  private solver: FluidSolver

  private quad: THREE.Mesh
  private camera: THREE.OrthographicCamera
  private scene: THREE.Scene

  // 渲染 RT
  private fluidRT: THREE.WebGLRenderTarget
  private tempRT: THREE.WebGLRenderTarget

  // 材质
  private visualizeMat: THREE.ShaderMaterial
  private compositeMat: THREE.ShaderMaterial
  private vortexMat: THREE.ShaderMaterial
  private pulseMat: THREE.ShaderMaterial
  private turbulenceMat: THREE.ShaderMaterial

  private config: FluidRenderConfig

  // 动态特效状态
  private vortexCenter: THREE.Vector2 = new THREE.Vector2(0.5, 0.5)
  private vortexIntensity: number = 0
  private pulsePhase: number = 0
  private pulseCenter: THREE.Vector2 = new THREE.Vector2(0.5, 0.5)

  constructor(renderer: THREE.WebGLRenderer, solver: FluidSolver, width: number, height: number) {
    this.renderer = renderer
    this.solver = solver

    this.config = { intensity: 0.8, mode: 'additive' }

    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1)
    this.scene = new THREE.Scene()

    const geo = new THREE.PlaneGeometry(1, 1)

    const rtOpts: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    }
    this.fluidRT = new THREE.WebGLRenderTarget(width, height, rtOpts)
    this.tempRT = new THREE.WebGLRenderTarget(width, height, rtOpts)

    this.visualizeMat = new THREE.ShaderMaterial({
      uniforms: {
        tVelocity: { value: solver.getVelocityTexture() },
        uMagnification: { value: 3.0 },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: FLOW_VISUALIZE_FRAG,
      depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending, transparent: true,
    })

    this.compositeMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tFluid: { value: this.fluidRT.texture },
        uFluidIntensity: { value: this.config.intensity },
        uFluidMode: { value: 1.0 }, // additive
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: FLUID_COMPOSITE_FRAG,
      depthTest: false, depthWrite: false,
    })

    this.vortexMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uIntensity: { value: 0 },
        uRadius: { value: 0.3 },
        uTime: { value: 0 },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: VORTEX_BURST_FRAG,
      depthTest: false, depthWrite: false,
    })

    this.pulseMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uPulsePhase: { value: 0 },
        uPulseSpeed: { value: 2.0 },
        uInnerRadius: { value: 0.1 },
        uPulseColor: { value: new THREE.Color('#ffd700') },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: PULSE_RING_FRAG,
      depthTest: false, depthWrite: false,
    })

    this.turbulenceMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uIntensity: { value: 0.5 },
        uTime: { value: 0 },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: ENERGY_TURBULENCE_FRAG,
      depthTest: false, depthWrite: false,
    })

    this.quad = new THREE.Mesh(geo, this.visualizeMat)
    this.scene.add(this.quad)
  }

  // ── 配置 ──

  setConfig(config: Partial<FluidRenderConfig>): void {
    Object.assign(this.config, config)
    this.compositeMat.uniforms.uFluidIntensity.value = this.config.intensity
    const modeMap: Record<string, number> = { overlay: 0, additive: 1, screen: 2 }
    this.compositeMat.uniforms.uFluidMode.value = modeMap[this.config.mode] ?? 1
  }

  /** 设置漩涡爆发中心 */
  setVortex(center: { x: number; y: number }, intensity: number, radius: number = 0.3): void {
    this.vortexCenter.set(center.x, center.y)
    this.vortexIntensity = Math.max(0, Math.min(1, intensity))
    this.vortexMat.uniforms.uRadius.value = radius
  }

  /** 设置脉冲光环 */
  setPulse(center: { x: number; y: number }, color: THREE.Color): void {
    this.pulseCenter.set(center.x, center.y)
    this.pulseMat.uniforms.uPulseColor.value = color
  }

  /** 设置能量湍流 */
  setTurbulence(center: { x: number; y: number }, intensity: number): void {
    this.turbulenceMat.uniforms.uCenter.value.set(center.x, center.y)
    this.turbulenceMat.uniforms.uIntensity.value = intensity
  }

  // ── 渲染 ──

  /**
   * 将流体叠加到场景纹理（tDiffuse）
   * @param sceneTexture 场景渲染纹理
   * @param time 时间
   * @param output 输出目标（null = 屏幕）
   */
  renderOverlay(sceneTexture: THREE.Texture, time: number, output: THREE.WebGLRenderTarget | null = null): void {
    const r = this.renderer
    const { fluidRT, tempRT } = this

    // Step 1: 可视化速度场 → fluidRT
    this.visualizeMat.uniforms.tVelocity.value = this.solver.getVelocityTexture()
    this.quad.material = this.visualizeMat
    r.setRenderTarget(fluidRT)
    r.render(this.scene, this.camera)

    // Step 2: 漩涡爆发（如果有激活）→ tempRT
    if (this.vortexIntensity > 0.01) {
      this.vortexMat.uniforms.tDiffuse.value = fluidRT.texture
      this.vortexMat.uniforms.uCenter.value.copy(this.vortexCenter)
      this.vortexMat.uniforms.uIntensity.value = this.vortexIntensity
      this.vortexMat.uniforms.uTime.value = time
      this.quad.material = this.vortexMat
      r.setRenderTarget(tempRT)
      r.render(this.scene, this.camera)
      // 交换 fluidRT ← tempRT
      ;[this.fluidRT, this.tempRT] = [this.tempRT, this.fluidRT]
    }

    // Step 3: 脉冲光环
    this.pulsePhase += 0.016
    this.pulseMat.uniforms.tDiffuse.value = fluidRT.texture
    this.pulseMat.uniforms.uCenter.value.copy(this.pulseCenter)
    this.pulseMat.uniforms.uPulsePhase.value = this.pulsePhase % 1
    this.quad.material = this.pulseMat
    r.setRenderTarget(tempRT)
    r.render(this.scene, this.camera)
    ;[this.fluidRT, this.tempRT] = [this.tempRT, this.fluidRT]

    // Step 4: 能量湍流
    this.turbulenceMat.uniforms.tDiffuse.value = fluidRT.texture
    this.turbulenceMat.uniforms.uTime.value = time
    this.quad.material = this.turbulenceMat
    r.setRenderTarget(tempRT)
    r.render(this.scene, this.camera)
    ;[this.fluidRT, this.tempRT] = [this.tempRT, this.fluidRT]

    // Step 5: 最终合成 → output
    this.compositeMat.uniforms.tDiffuse.value = sceneTexture
    this.compositeMat.uniforms.tFluid.value = fluidRT.texture
    this.quad.material = this.compositeMat
    r.setRenderTarget(output)
    r.render(this.scene, this.camera)
    r.setRenderTarget(null)

    // 衰减漩涡强度
    this.vortexIntensity *= 0.95
  }

  resize(width: number, height: number): void {
    this.fluidRT.setSize(width, height)
    this.tempRT.setSize(width, height)
  }

  dispose(): void {
    this.fluidRT.dispose()
    this.tempRT.dispose()
    this.visualizeMat.dispose()
    this.compositeMat.dispose()
    this.vortexMat.dispose()
    this.pulseMat.dispose()
    this.turbulenceMat.dispose()
    this.quad.geometry.dispose()
  }
}
