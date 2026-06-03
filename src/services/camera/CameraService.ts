/**
 * CameraService — 摄像头管理服务
 *
 * 负责 getUserMedia 调用、track 管理、前后摄切换、
 * 光照检测、分辨率降级策略、错误分类。
 */

import type { CameraConfig, CameraErrorType } from '@/types'
import type { CameraServiceInterface, LightingInfo } from './types'

// ---- 常量 ----

/** 分辨率降级序列 */
const RESOLUTION_FALLBACK: [number, number][] = [
  [640, 480],
  [480, 360],
  [320, 240],
]

/** 光照等级阈值 */
const LIGHTING_LOW_THRESHOLD = 80
const LIGHTING_GOOD_THRESHOLD = 150

/** 光照采样网格（3×3 九宫格归一化坐标） */
const LIGHTING_SAMPLE_POINTS: [number, number][] = [
  [0.25, 0.25],
  [0.5, 0.25],
  [0.75, 0.25],
  [0.25, 0.5],
  [0.5, 0.5],
  [0.75, 0.5],
  [0.25, 0.75],
  [0.5, 0.75],
  [0.75, 0.75],
]

/** 用户友好的错误文案映射 */
const ERROR_MESSAGES: Record<CameraErrorType, string> = {
  not_supported: '当前浏览器不支持摄像头调用，请使用 Chrome、Edge 或 Firefox 打开',
  permission_denied: '摄像头权限被拒绝，请在浏览器设置中允许摄像头访问',
  not_found: '未检测到摄像头设备，请确认摄像头已连接',
  not_readable: '摄像头被其他应用占用，请关闭其他使用摄像头的程序后重试',
  in_use: '摄像头正在被其他应用使用，请关闭后重试',
  generic: '摄像头启动失败，请检查设备连接后重试',
}

// ---- 工具函数 ----

/**
 * 将 getUserMedia 的 DOMException 映射为 CameraErrorType
 */
function classifyError(error: unknown): CameraErrorType {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
        return 'permission_denied'
      case 'NotFoundError':
        return 'not_found'
      case 'NotReadableError':
        return 'not_readable'
      case 'OverconstrainedError':
        return 'not_supported'
      default:
        return 'not_supported'
    }
  }
  return 'generic'
}

/**
 * 检测浏览器是否支持 getUserMedia
 */
function isGetUserMediaSupported(): boolean {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
}

// ---- 错误类 ----

/** 自定义 Camera 错误类 */
export class CameraError extends Error {
  public readonly type: CameraErrorType
  public readonly userMessage: string

  constructor(type: CameraErrorType) {
    super(ERROR_MESSAGES[type])
    this.name = 'CameraError'
    this.type = type
    this.userMessage = ERROR_MESSAGES[type]
  }
}

// ---- CameraService ----

export class CameraService implements CameraServiceInterface {
  private stream: MediaStream | null = null
  private config: CameraConfig | null = null

  /** 启动摄像头（含分辨率降级策略） */
  async start(config: CameraConfig): Promise<MediaStream> {
    // 浏览器兼容性检查
    if (!isGetUserMediaSupported()) {
      throw new CameraError('not_supported')
    }

    // 如果已有流在运行，先停止
    if (this.stream) {
      this.stop()
    }

    this.config = { ...config }

    // 找到降级序列中第一个不小于目标分辨率的位置作为起点
    let startIndex = RESOLUTION_FALLBACK.findIndex(
      ([w, h]) => w <= config.width && h <= config.height,
    )
    if (startIndex === -1) startIndex = RESOLUTION_FALLBACK.length - 1

    // 从最接近目标的分辨率开始尝试
    for (let i = startIndex; i < RESOLUTION_FALLBACK.length; i++) {
      const [width, height] = RESOLUTION_FALLBACK[i]

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: config.facingMode,
          width: { ideal: width },
          height: { ideal: height },
        },
        audio: false,
      }

      try {
        this.stream = await navigator.mediaDevices.getUserMedia(constraints)
        // 成功获取，记录实际分辨率
        const settings = this.getTrackSettings()
        if (settings && (settings.width !== undefined || settings.height !== undefined)) {
          // 实际分辨率可能与 ideal 不同（浏览器自动选择最近的），检查是否可接受
        }
        return this.stream
      } catch (error) {
        // 如果是 NotReadableError / OverconstrainedError 且还有更低分辨率可尝试，则继续降级
        if (
          (error instanceof DOMException &&
            (error.name === 'NotReadableError' || error.name === 'OverconstrainedError')) &&
          i < RESOLUTION_FALLBACK.length - 1
        ) {
          continue
        }
        // 其他错误或已到最低分辨率，抛出
        this.stream = null
        this.config = null
        const type = classifyError(error)
        throw new CameraError(type)
      }
    }

    // 理论上不会到这里（循环内一定会 return 或 throw）
    this.stream = null
    this.config = null
    throw new CameraError('generic')
  }

  /** 停止摄像头（防重复调用保护） */
  stop(): void {
    if (!this.stream) return

    for (const track of this.stream.getTracks()) {
      track.stop()
    }
    this.stream = null
  }

  /** 切换前后摄像头 */
  async switchFacing(): Promise<MediaStream> {
    if (!this.config) {
      throw new CameraError('not_found')
    }

    this.stop()

    const newFacing: CameraConfig['facingMode'] =
      this.config.facingMode === 'user' ? 'environment' : 'user'

    return this.start({ ...this.config, facingMode: newFacing })
  }

  /** 获取当前视频 track 的实际设置 */
  getTrackSettings(): MediaTrackSettings | null {
    if (!this.stream) return null

    const videoTrack = this.stream.getVideoTracks()[0]
    if (!videoTrack) return null

    return videoTrack.getSettings()
  }

  /**
   * 检测光照条件
   *
   * 通过 Canvas 2D 从 video 元素捕获一帧，在 3×3 九宫格位置采样像素亮度，
   * 计算平均值后映射到 low / normal / good 等级。
   *
   * @param video - 播放中的 video 元素，需要有 readyState >= 2
   */
  checkLighting(video?: HTMLVideoElement): LightingInfo {
    if (!video || video.readyState < 2) {
      return { sufficient: true, level: 'normal' }
    }

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      return { sufficient: true, level: 'normal' }
    }

    // 绘制当前帧
    ctx.drawImage(video, 0, 0)

    let totalBrightness = 0
    let sampleCount = 0

    for (const [nx, ny] of LIGHTING_SAMPLE_POINTS) {
      const x = Math.floor(nx * canvas.width)
      const y = Math.floor(ny * canvas.height)
      const pixel = ctx.getImageData(x, y, 1, 1).data
      // 亮度 = (R + G + B) / 3
      const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3
      totalBrightness += brightness
      sampleCount++
    }

    const avgBrightness = sampleCount > 0 ? totalBrightness / sampleCount : 128

    if (avgBrightness < LIGHTING_LOW_THRESHOLD) {
      return { sufficient: false, level: 'low' }
    } else if (avgBrightness >= LIGHTING_GOOD_THRESHOLD) {
      return { sufficient: true, level: 'good' }
    } else {
      return { sufficient: true, level: 'normal' }
    }
  }

  /** 是否正在运行 */
  isActive(): boolean {
    return this.stream !== null && this.stream.active
  }

  /** 获取当前摄像头朝向 */
  getFacingMode(): 'user' | 'environment' {
    return this.config?.facingMode ?? 'user'
  }
}

// ---- 单例 ----

/** 模块级单例 */
let instance: CameraService | null = null

export function getCameraService(): CameraService {
  if (!instance) {
    instance = new CameraService()
  }
  return instance
}
