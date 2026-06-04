/**
 * 七脉轮辉光 — 7 个发光球体映射人体 7 大能量中心
 *
 * 顶轮 (Crown)          → 鼻尖上方 (紫)
 * 眉心轮 (Third Eye)    → 眉心     (靛)
 * 喉轮 (Throat)         → 下巴     (蓝)
 * 心轮 (Heart)          → 胸骨     (绿)
 * 太阳轮 (Solar Plexus) → 腹上     (黄)
 * 腹轮 (Sacral)          → 丹田     (橙)
 * 根轮 (Root)           → 会阴     (红)
 *
 * 每个球使用自定义 ShaderMaterial（菲涅尔 + 脉冲光晕）。
 * 体态分数驱动脉轮颜色：高分=纯正色, 低分=浑浊暗淡。
 */
import * as THREE from 'three'
import { CHAKRA_GLOW_ORB_FRAG } from './shaders_ext'

/** 脉轮定义 */
interface ChakraDef {
  name: string
  yRatio: number      // 垂直位置比 (相对人体高度)
  color: THREE.Color
  pulseRate: number    // 脉冲频率乘数
  radius: number
}

const CHAKRA_DEFS: ChakraDef[] = [
  { name: 'crown',      yRatio: 0.15, color: new THREE.Color('#cc44ff'), pulseRate: 1.0,  radius: 0.025 },
  { name: 'thirdEye',   yRatio: 0.22, color: new THREE.Color('#4444ff'), pulseRate: 1.3,  radius: 0.02 },
  { name: 'throat',     yRatio: 0.28, color: new THREE.Color('#00aaff'), pulseRate: 1.1,  radius: 0.022 },
  { name: 'heart',      yRatio: 0.36, color: new THREE.Color('#00cc44'), pulseRate: 0.8,  radius: 0.028 },
  { name: 'solarPlexus',yRatio: 0.44, color: new THREE.Color('#ffcc00'), pulseRate: 1.2,  radius: 0.026 },
  { name: 'sacral',     yRatio: 0.55, color: new THREE.Color('#ff6600'), pulseRate: 0.9,  radius: 0.024 },
  { name: 'root',       yRatio: 0.65, color: new THREE.Color('#ff0044'), pulseRate: 0.7,  radius: 0.026 },
]

export interface ChakraConfig {
  intensity: number       // 0~1
  bodyCenterX: number     // 人体中心 X (归一化 0~1)
}

const DEFAULT_CONFIG: ChakraConfig = {
  intensity: 0.7,
  bodyCenterX: 0.5,
}

export class ChakraOrbs {
  private renderer: THREE.WebGLRenderer
  private config: ChakraConfig

  private meshes: THREE.Mesh[] = []
  private materials: THREE.ShaderMaterial[] = []
  private camera: THREE.OrthographicCamera
  private scene: THREE.Scene

  _elapsed: number = 0

  constructor(renderer: THREE.WebGLRenderer, config: Partial<ChakraConfig> = {}) {
    this.renderer = renderer
    this.config = { ...DEFAULT_CONFIG, ...config }

    // 正交相机 (归一化坐标 -1..1)
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1)
    this.scene = new THREE.Scene()

    // 为每个脉轮创建球体
    const geo = new THREE.SphereGeometry(1, 32, 32)

    for (const def of CHAKRA_DEFS) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uGlowColor: { value: def.color },
          uIntensity: { value: this.config.intensity },
          uTime: { value: 0 },
          uPulseRate: { value: def.pulseRate },
        },
        vertexShader: /* glsl */ `
          varying vec3 vWorldPos;
          varying vec3 vNormal;
          void main() {
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vWorldPos = worldPos.xyz;
            vNormal = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: CHAKRA_GLOW_ORB_FRAG,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        transparent: true,
      })

      const mesh = new THREE.Mesh(geo, mat)
      mesh.renderOrder = 999
      this.meshes.push(mesh)
      this.materials.push(mat)
      this.scene.add(mesh)
    }

    // 初始位置
    this.updatePositions(this.config.bodyCenterX, this.config.intensity)
  }

  // ────────────────────────────
  // 公开接口
  // ────────────────────────────

  /**
   * 更新脉轮位置和强度
   * @param centerX  人体中心 X (0~1，相对摄像头画面)
   * @param intensity 整体强度 0~1 (体态分驱动)
   * @param score    体态分数 0~100 (低分→混浊, 高分→纯净)
   */
  updatePositions(centerX: number, intensity: number, score: number = 50): void {
    this.config.bodyCenterX = centerX
    this.config.intensity = intensity

    const cx = (centerX - 0.5) * 2 // 归一化→clip space

    for (let i = 0; i < CHAKRA_DEFS.length; i++) {
      const def = CHAKRA_DEFS[i]
      const mesh = this.meshes[i]
      const mat = this.materials[i]

      // Y: 顶→底 (clip space: +1顶, -1底)
      const cy = (0.5 - def.yRatio) * 2 // yRatio 0=顶, 1=底 → clip Y

      mesh.position.set(cx, cy, 0)
      mesh.scale.setScalar(def.radius)

      // 分数驱动颜色饱和度
      const sat = 0.3 + (score / 100) * 0.7
      const color = def.color.clone()
      color.offsetHSL(0, 0, (sat - 0.5) * 0.3) // 低分偏暗

      mat.uniforms.uGlowColor.value = color
      mat.uniforms.uIntensity.value = intensity * (0.5 + (score / 100) * 0.5)
    }
  }

  /** 每帧调用更新动画时间 */
  update(dt: number): void {
    this._elapsed += dt
    for (const mat of this.materials) {
      mat.uniforms.uTime.value = this._elapsed
    }
  }

  /** 渲染所有脉轮到当前目标 */
  renderTo(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null): void {
    renderer.setRenderTarget(target)
    renderer.render(this.scene, this.camera)
    if (target) renderer.setRenderTarget(null)
  }

  /** 渲染到 RT 并返回纹理 */
  renderToRT(target: THREE.WebGLRenderTarget): THREE.Texture {
    this.renderTo(this.renderer, target)
    return target.texture
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose()
    }
    for (const mat of this.materials) {
      mat.dispose()
    }
  }
}
