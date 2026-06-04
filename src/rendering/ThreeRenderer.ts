/**
 * Three.js GPU 渲染器 —— 主控类
 * 管理场景、相机、视频纹理、仿真层和后处理管线
 */
import * as THREE from 'three'
import { PostProcessingPipeline } from './PostProcessing'
import type { BloomParams, EnergyParams, OutlineParams } from './PostProcessing'
import { InstancedParticleSystem } from './InstancedParticleSystem'
import {
  BAGUA_HALO_VERT,
  BAGUA_HALO_FRAG,
  GLOW_COLUMN_VERT,
  GLOW_COLUMN_FRAG,
} from './shaders'

// ──────────────────────────────────────────────
// 导出类型
// ──────────────────────────────────────────────

export type { BloomParams, EnergyParams, OutlineParams }

/** 视图模式 */
export type ViewMode = 'spine' | 'palm' | 'bone' | 'combined'

/** 层可见性配置 */
export interface LayerVisibility {
  spine: boolean
  palm: boolean
  bone: boolean
}

/** 脊柱树参数（从外部驱动） */
export interface SpineTreeParams {
  /** 脊柱关键点归一化坐标数组 [{x, y}] */
  spinePoints: Array<{ x: number; y: number }>
  /** 能量等级 0~1 */
  energyLevel: number
  /** 能量状态标签 */
  energyState: 'flowing' | 'blocked' | 'diminished'
  /** 光柱颜色 */
  columnColor: THREE.Color
  /** 脊柱弯曲角（用于藤蔓缠绕动画） */
  lateralAngle: number
}

/** 手相参数 */
export interface PalmStarsParams {
  /** 手掌中心归一化坐标 */
  palmCenter: { x: number; y: number }
  /** 生命线饱满度 0~1 */
  lifeLineFullness: number
  /** 金星丘丰隆度 0~1 */
  venusMount: number
  /** 掌色信息 */
  palmColor: { r: number; g: number; b: number }
}

/** 骨相参数 */
export interface BonePhysiognomyParams {
  /** 面部轮廓关键点 */
  faceOutline: Array<{ x: number; y: number }>
  /** 额头饱满度 0~1 */
  foreheadFullness: number
  /** 颧骨突出度 0~1 */
  cheekboneProminence: number
  /** 下颌角大小（度） */
  jawAngle: number
  /** 面部宽高比 */
  faceRatio: number
}

// ──────────────────────────────────────────────
// ThreeRenderer
// ──────────────────────────────────────────────

export class ThreeRenderer {
  // ── 核心组件 ──
  readonly scene: THREE.Scene
  readonly camera: THREE.OrthographicCamera
  readonly renderer: THREE.WebGLRenderer
  private pipeline: PostProcessingPipeline

  // ── 视频层 ──
  private videoTexture: THREE.VideoTexture | null = null
  private videoPlane: THREE.Mesh | null = null
  // ── 仿真层 ──
  // 脊柱
  private spineGroup: THREE.Group
  private glowColumn: THREE.Mesh | null = null
  private baguaHalo: THREE.Mesh | null = null
  private spineParticles: InstancedParticleSystem | null = null

  // 手相
  private palmGroup: THREE.Group
  private palmParticles: InstancedParticleSystem | null = null

  // 骨相
  private boneGroup: THREE.Group
  private boneLine: THREE.Line | null = null
  private boneParticles: InstancedParticleSystem | null = null

  // ── 尺寸 ──
  private width: number
  private height: number

  // ── 动画 ──
  private animationId: number = 0
  private lastTime: number = 0
  private onFrameCallback: ((dt: number) => void) | null = null

  // ── 状态 ──
  private disposed: boolean = false

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.width = width
    this.height = height

    // ── 渲染器 ──
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false, // 用后处理的话，抗锯齿在 composer 里做
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(width, height, false)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    // ── 场景 ──
    this.scene = new THREE.Scene()

    // ── 正交相机（2D 仿真用） ──
    // 左上角为 (0,0)，向右 x+，向下 y+
    this.camera = new THREE.OrthographicCamera(
      0, width,
      height, 0,
      -1, 1,
    )
    this.camera.position.z = 1

    // ── 后处理管线 ──
    this.pipeline = new PostProcessingPipeline(
      this.renderer,
      this.scene,
      this.camera,
      width,
      height,
    )

    // ── 仿真层 ──
    this.spineGroup = new THREE.Group()
    this.spineGroup.name = 'spineLayer'
    this.spineGroup.visible = false
    this.scene.add(this.spineGroup)

    this.palmGroup = new THREE.Group()
    this.palmGroup.name = 'palmLayer'
    this.palmGroup.visible = false
    this.scene.add(this.palmGroup)

    this.boneGroup = new THREE.Group()
    this.boneGroup.name = 'boneLayer'
    this.boneGroup.visible = false
    this.scene.add(this.boneGroup)

    // ── 默认后处理参数 ──
    this.pipeline.setBloomParams({ threshold: 0.4, strength: 1.2, radius: 2.0 })
    this.pipeline.setEnergyParams({
      level: 0.5,
      center: new THREE.Vector2(0.5, 0.5),
    })
    this.pipeline.setOutlineParams({
      enabled: false,
      strength: 1.0,
      inkColor: new THREE.Color('#2c1810'),
      noiseAmount: 0.15,
    })
    this.pipeline.setLUTParams({ intensity: 0.5 })

    // ── 生成 LUT 纹理 ──
    this.createGuochaoLUT()
  }

  // ─────────────────────────────────────────
  // 视频绑定
  // ─────────────────────────────────────────

  /** 绑定摄像头 video 元素作为背景 */
  setVideo(video: HTMLVideoElement): void {
    if (this.videoTexture) {
      this.videoTexture.dispose()
    }

    this.videoTexture = new THREE.VideoTexture(video)
    this.videoTexture.colorSpace = THREE.SRGBColorSpace

    if (this.videoPlane) {
      this.scene.remove(this.videoPlane)
    }

    // 全屏视频背景（z = -0.5 在其他层后面）
    const geo = new THREE.PlaneGeometry(this.width, this.height)
    const mat = new THREE.MeshBasicMaterial({
      map: this.videoTexture,
      depthWrite: false,
      depthTest: false,
    })
    this.videoPlane = new THREE.Mesh(geo, mat)
    this.videoPlane.position.set(this.width / 2, this.height / 2, -0.5)
    this.videoPlane.renderOrder = 0
    this.scene.add(this.videoPlane)
  }

  // ─────────────────────────────────────────
  // 脊柱仿真层
  // ─────────────────────────────────────────

  /** 创建/更新脊柱光柱 */
  private ensureSpineGlowColumn(params: SpineTreeParams): void {
    if (!this.glowColumn) {
      // 光柱：细长的发光矩形
      const columnWidth = 24
      const geo = new THREE.PlaneGeometry(columnWidth, 1) // 高度动态设置
      const mat = new THREE.ShaderMaterial({
        vertexShader: GLOW_COLUMN_VERT,
        fragmentShader: GLOW_COLUMN_FRAG,
        uniforms: {
          uGlowColor: { value: new THREE.Color(params.columnColor) },
          uIntensity: { value: params.energyLevel },
          uTime: { value: 0 },
          uPulseSpeed: { value: 2.0 },
        },
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      })
      this.glowColumn = new THREE.Mesh(geo, mat)
      this.glowColumn.renderOrder = 2
      this.spineGroup.add(this.glowColumn)
    }

    const mat = this.glowColumn.material as THREE.ShaderMaterial
    mat.uniforms.uGlowColor.value = new THREE.Color(params.columnColor)
    mat.uniforms.uIntensity.value = Math.max(0.1, params.energyLevel)

    // 根据脊柱点计算光柱位置和高度
    if (params.spinePoints.length >= 2) {
      const top = params.spinePoints[0]
      const bottom = params.spinePoints[params.spinePoints.length - 1]
      const x = top.x * this.width
      const spineHeight = (bottom.y - top.y) * this.height
      const y = top.y * this.height

      this.glowColumn.position.set(x, y + spineHeight / 2, 0.01)
      this.glowColumn.scale.set(1, Math.max(spineHeight, 1), 1)
    }
  }

  /** 创建/更新八卦光环 */
  private ensureBaguaHalo(params: SpineTreeParams): void {
    if (!this.baguaHalo) {
      const size = 180
      const geo = new THREE.PlaneGeometry(size, size)
      const mat = new THREE.ShaderMaterial({
        vertexShader: BAGUA_HALO_VERT,
        fragmentShader: BAGUA_HALO_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uOpacity: { value: 0.6 },
          uInnerRadius: { value: 0.35 },
          uOuterRadius: { value: 0.48 },
          uYangColor: { value: new THREE.Color('#ffd700') },
          uYinColor: { value: new THREE.Color('#1a1a2e') },
          uGlowIntensity: { value: 1.0 },
        },
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      })
      this.baguaHalo = new THREE.Mesh(geo, mat)
      this.baguaHalo.renderOrder = 1
      this.spineGroup.add(this.baguaHalo)
    }

    // 定位到脊柱中点
    if (params.spinePoints.length >= 2) {
      const mid = params.spinePoints[Math.floor(params.spinePoints.length / 2)]
      this.baguaHalo.position.set(
        mid.x * this.width,
        mid.y * this.height,
        0.02,
      )
    }

    const mat = this.baguaHalo.material as THREE.ShaderMaterial
    mat.uniforms.uGlowIntensity.value = 0.3 + params.energyLevel * 0.7
    mat.uniforms.uOpacity.value = 0.3 + params.energyLevel * 0.5
  }

  /** 确保脊柱粒子系统存在 */
  private ensureSpineParticles(): void {
    if (!this.spineParticles) {
      this.spineParticles = new InstancedParticleSystem(5000, this.spineGroup)
    }
  }

  updateSpineTree(params: SpineTreeParams): void {
    this.ensureSpineGlowColumn(params)
    this.ensureBaguaHalo(params)
    this.ensureSpineParticles()

    // 沿脊柱发射能量粒子
    if (this.spineParticles && params.spinePoints.length >= 2) {
      // 每帧发射少量粒子
      const emitCount = params.energyState === 'flowing' ? 8 : 2
      const pColor: [number, number, number] = params.energyState === 'flowing'
        ? [1.0, 0.85, 0.2]   // 金色
        : params.energyState === 'blocked'
          ? [0.6, 0.6, 0.6]  // 灰色
          : [0.2, 0.5, 1.0]  // 蓝色

      for (let i = 0; i < emitCount; i++) {
        const idx = Math.floor(Math.random() * (params.spinePoints.length - 1))
        const pt = params.spinePoints[idx]
        this.spineParticles.emit(
          pt.x * this.width,
          pt.y * this.height,
          0.03,
          (Math.random() - 0.5) * 20,
          -(Math.random() * 30 + 10),
          0,
          0.3 + Math.random() * 0.7,
          2 + Math.random() * 4,
          pColor,
        )
      }
    }

    // 能量流状态 → Bloom 强度
    const bloomStrength = params.energyState === 'flowing' ? 1.5 : 0.3
    this.pipeline.setBloomParams({
      threshold: 0.3,
      strength: bloomStrength,
      radius: 2.0,
    })

    // 能量场脉动
    if (params.spinePoints.length >= 2) {
      const mid = params.spinePoints[Math.floor(params.spinePoints.length / 2)]
      this.pipeline.setEnergyParams({
        level: params.energyLevel,
        center: new THREE.Vector2(mid.x, mid.y),
      })
    }
  }

  // ─────────────────────────────────────────
  // 手相仿真层
  // ─────────────────────────────────────────

  /** 确保手相粒子系统存在 */
  private ensurePalmParticles(): void {
    if (!this.palmParticles) {
      this.palmParticles = new InstancedParticleSystem(5000, this.palmGroup)
    }
  }

  updatePalmStars(params: PalmStarsParams): void {
    this.ensurePalmParticles()

    if (!this.palmParticles) return

    const cx = params.palmCenter.x * this.width
    const cy = params.palmCenter.y * this.height

    // 金星丘能量粒子
    const venusCount = Math.floor(params.venusMount * 15)
    for (let i = 0; i < venusCount; i++) {
      const angle = Math.random() * Math.PI * 2
      const radius = 20 + Math.random() * 30
      this.palmParticles.emit(
        cx + Math.cos(angle) * radius,
        cy + Math.sin(angle) * radius,
        0.03,
        Math.cos(angle) * 5,
        Math.sin(angle) * 5,
        0,
        0.3 + Math.random() * 0.5,
        1 + Math.random() * 3,
        [1.0, 0.84, 0.0], // 金色
      )
    }

    // 生命线粒子流（沿弧形路径）
    const lifeCount = Math.floor(params.lifeLineFullness * 10)
    for (let i = 0; i < lifeCount; i++) {
      const t = Math.random()
      const arcX = cx + Math.cos(t * Math.PI * 0.6 - 0.3) * 60
      const arcY = cy + Math.sin(t * Math.PI * 0.6 - 0.3) * 80
      this.palmParticles.emit(
        arcX,
        arcY,
        0.03,
        (Math.random() - 0.5) * 8,
        -(Math.random() * 12 + 4),
        0,
        0.4 + Math.random() * 0.6,
        1.5 + Math.random() * 3,
        [0.2, 0.9, 0.4], // 翠绿
      )
    }

    // Bloom：手掌区域发光
    this.pipeline.setBloomParams({
      threshold: 0.35,
      strength: 0.6 + params.venusMount * 0.8,
      radius: 1.5,
    })

    // 能量场以手掌为中心
    this.pipeline.setEnergyParams({
      level: params.lifeLineFullness,
      center: new THREE.Vector2(params.palmCenter.x, params.palmCenter.y),
    })
  }

  // ─────────────────────────────────────────
  // 骨相仿真层
  // ─────────────────────────────────────────

  /** 确保骨相粒子系统存在 */
  private ensureBoneParticles(): void {
    if (!this.boneParticles) {
      this.boneParticles = new InstancedParticleSystem(3000, this.boneGroup)
    }
  }

  updateBoneGlow(params: BonePhysiognomyParams): void {
    this.ensureBoneParticles()

    // 更新骨骼轮廓线
    if (params.faceOutline.length > 0) {
      if (!this.boneLine) {
        const mat = new THREE.LineBasicMaterial({
          color: new THREE.Color('#ffd700'),
          linewidth: 1,
          transparent: true,
          opacity: 0.7,
          depthTest: false,
          depthWrite: false,
        })
        const geo = new THREE.BufferGeometry()
        this.boneLine = new THREE.Line(geo, mat)
        this.boneLine.renderOrder = 3
        this.boneGroup.add(this.boneLine)
      }

      const positions: number[] = []
      for (const pt of params.faceOutline) {
        positions.push(pt.x * this.width, pt.y * this.height, 0.03)
      }
      this.boneLine.geometry.dispose()
      this.boneLine.geometry = new THREE.BufferGeometry()
      this.boneLine.geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3),
      )
    }

    // 额骨饱满 → 粒子在额头区域爆发
    if (this.boneParticles && params.faceOutline.length > 0) {
      const forehead = params.faceOutline[0]
      const fx = forehead.x * this.width
      const fy = forehead.y * this.height

      const glowCount = Math.floor(params.foreheadFullness * 8)
      for (let i = 0; i < glowCount; i++) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.5
        const speed = 30 + Math.random() * 50
        this.boneParticles.emit(
          fx + (Math.random() - 0.5) * 40,
          fy + Math.random() * 10,
          0.03,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          0,
          0.5 + Math.random() * 0.5,
          3 + Math.random() * 5,
          [1.0, 0.6, 0.1], // 旭日橙金
        )
      }
    }

    // 水墨描边：骨相层启用时开启
    const outlineEnabled = params.faceOutline.length > 0
    this.pipeline.setOutlineParams({
      enabled: outlineEnabled,
      strength: 0.8,
      inkColor: new THREE.Color('#2c1810'),
      noiseAmount: 0.12,
    })

    // Bloom 给骨骼金边发光
    this.pipeline.setBloomParams({
      threshold: 0.5,
      strength: 0.8,
      radius: 1.0,
    })
  }

  // ─────────────────────────────────────────
  // 层切换
  // ─────────────────────────────────────────

  setLayerVisibility(visibility: LayerVisibility): void {
    this.spineGroup.visible = visibility.spine
    this.palmGroup.visible = visibility.palm
    this.boneGroup.visible = visibility.bone

    // 骨相层不显示时关闭描边
    if (!visibility.bone) {
      this.pipeline.setOutlineParams({
        enabled: false,
        strength: 0,
        inkColor: new THREE.Color('#2c1810'),
        noiseAmount: 0,
      })
    }
  }

  // ─────────────────────────────────────────
  // 后处理参数
  // ─────────────────────────────────────────

  setBloomParams(params: Partial<BloomParams>): void {
    this.pipeline.setBloomParams(params)
  }

  setEnergyParams(params: Partial<EnergyParams>): void {
    this.pipeline.setEnergyParams(params)
  }

  setOutlineParams(params: Partial<OutlineParams>): void {
    this.pipeline.setOutlineParams(params)
  }

  setLUTIntensity(intensity: number): void {
    this.pipeline.setLUTParams({ intensity })
  }

  // ─────────────────────────────────────────
  // LUT 生成：国潮色调
  // ─────────────────────────────────────────

  private createGuochaoLUT(): void {
    // 创建 1024×32 的 LUT 纹理（32³ 的 3D LUT 展开）
    const size = 1024
    const height = 32
    const data = new Uint8Array(size * height * 3)

    for (let bIdx = 0; bIdx < 32; bIdx++) {
      for (let gIdx = 0; gIdx < 32; gIdx++) {
        for (let rIdx = 0; rIdx < 32; rIdx++) {
          const r = rIdx / 31
          const g = gIdx / 31
          const b = bIdx / 31

          // 国潮色调映射：
          // - 暖色增强（红橙 → 更饱和的金红）
          // - 冷色偏青（让青色更像青花瓷）
          // - 暗部偏暖棕
          // - 亮部偏暖金
          let nr = r, ng = g, nb = b

          // 暖色调增强
          const warmth = r + g - b * 0.5
          nr += warmth * 0.08
          ng += warmth * 0.04
          nb -= warmth * 0.04

          // 青色 → 青花瓷蓝
          if (b > r && b > g) {
            nr = nr * 0.9 + 0.02
            ng = ng * 0.95 + 0.02
          }

          // 阴影区偏暖棕
          const luminance = 0.299 * nr + 0.587 * ng + 0.114 * nb
          if (luminance < 0.3) {
            nr += 0.03
            ng -= 0.02
          }

          // 高光区偏暖金
          if (luminance > 0.7) {
            nr += 0.02
            ng += 0.01
            nb -= 0.03
          }

          // 钳制
          nr = Math.max(0, Math.min(1, nr))
          ng = Math.max(0, Math.min(1, ng))
          nb = Math.max(0, Math.min(1, nb))

          // 写入像素：LUT 布局为 32×32 个格子横排
          const px = rIdx + (bIdx % 32) * 32
          const py = gIdx + Math.floor(bIdx / 32) * 32
          const idx = (py * size + px) * 3
          data[idx] = Math.round(nr * 255)
          data[idx + 1] = Math.round(ng * 255)
          data[idx + 2] = Math.round(nb * 255)
        }
      }
    }

    const texture = new THREE.DataTexture(
      data,
      size,
      height,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    )
    texture.colorSpace = THREE.SRGBColorSpace
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.needsUpdate = true

    this.pipeline.setLUTTexture(texture)
  }

  // ─────────────────────────────────────────
  // 渲染循环
  // ─────────────────────────────────────────

  setFrameCallback(callback: (dt: number) => void): void {
    this.onFrameCallback = callback
  }

  private animate = (time: number): void => {
    if (this.disposed) return

    const dt = Math.min((time - this.lastTime) / 1000, 0.1) // 防止大帧间隔
    this.lastTime = time

    // 更新视频纹理
    if (this.videoTexture) {
      this.videoTexture.needsUpdate = true
    }

    // 更新光柱脉冲时间
    if (this.glowColumn) {
      const mat = this.glowColumn.material as THREE.ShaderMaterial
      mat.uniforms.uTime.value = time * 0.001
    }

    // 更新八卦光环旋转
    if (this.baguaHalo) {
      const mat = this.baguaHalo.material as THREE.ShaderMaterial
      mat.uniforms.uTime.value = time * 0.001
    }

    // 更新后处理 shader 时间
    this.pipeline.updateTimeUniform(time * 0.001)

    // 粒子物理更新
    if (this.spineParticles) this.spineParticles.update(dt)
    if (this.palmParticles) this.palmParticles.update(dt)
    if (this.boneParticles) this.boneParticles.update(dt)

    // 执行后处理管线渲染
    this.pipeline.render(dt)

    // 调用外部帧回调
    this.onFrameCallback?.(dt)

    this.animationId = requestAnimationFrame(this.animate)
  }

  start(): void {
    if (this.animationId) return
    this.lastTime = performance.now()
    this.animationId = requestAnimationFrame(this.animate)
  }

  stop(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId)
      this.animationId = 0
    }
  }

  // ─────────────────────────────────────────
  // 尺寸调整
  // ─────────────────────────────────────────

  resize(width: number, height: number): void {
    this.width = width
    this.height = height

    this.camera.right = width
    this.camera.bottom = height  // Y 轴翻转已在构造函数设置
    this.camera.updateProjectionMatrix()

    this.renderer.setSize(width, height, false)
    this.pipeline.setSize(width, height)

    if (this.videoPlane) {
      this.videoPlane.geometry.dispose()
      this.videoPlane.geometry = new THREE.PlaneGeometry(width, height)
      this.videoPlane.position.set(width / 2, height / 2, -0.5)
    }
  }

  // ─────────────────────────────────────────
  // 清理
  // ─────────────────────────────────────────

  dispose(): void {
    this.disposed = true
    this.stop()

    // 清理仿真层
    ;[this.spineGroup, this.palmGroup, this.boneGroup].forEach(group => {
      group.traverse(child => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
          child.geometry?.dispose()
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose())
          } else {
            child.material?.dispose()
          }
        }
      })
    })

    this.spineParticles?.dispose()
    this.palmParticles?.dispose()
    this.boneParticles?.dispose()

    this.videoTexture?.dispose()
    this.pipeline.dispose()
    this.renderer.dispose()
  }
}
