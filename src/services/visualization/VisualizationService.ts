/**
 * VisualizationService — 可视化渲染引擎封装层
 *
 * 对内持有 TailRenderer 实例，对外暴露统一接口。
 * MVP 仅支持 'tail' 类型。
 */

import type { Keypoint, PostureMetrics, VisualizationType } from '@/types'
import type { VisualizationServiceInterface } from './types'
import { TailRenderer } from './renderers/TailRenderer'

export class VisualizationService implements VisualizationServiceInterface {
  private renderer: TailRenderer | null = null
  private canvas: HTMLCanvasElement | null = null
  private video: HTMLVideoElement | null = null

  /** 绑定 Canvas 和 Video 元素 */
  mount(canvas: HTMLCanvasElement, video: HTMLVideoElement): void {
    if (this.renderer) {
      this.renderer.dispose()
    }
    this.canvas = canvas
    this.video = video
    this.renderer = new TailRenderer(canvas)

    // 根据 video 分辨率初始化 Canvas 尺寸
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      this.renderer.resize(video.videoWidth, video.videoHeight)
    }
  }

  /** 启动渲染循环 */
  start(): void {
    this.renderer?.start()
  }

  /** 停止渲染循环 */
  stop(): void {
    this.renderer?.stop()
  }

  /** 更新当前体态数据（每帧调用） */
  updatePose(metrics: PostureMetrics, keypoints: Keypoint[]): void {
    this.renderer?.updatePose(metrics, keypoints)
  }

  /** 切换可视化类型（MVP 仅 tail） */
  setType(type: VisualizationType): void {
    if (type !== 'tail') {
      console.warn(
        `[VisualizationService] Type "${type}" not yet supported. MVP only supports "tail".`,
      )
    }
  }

  /** 设置模式风格 */
  setModeStyle(style: 'full' | 'simple' | 'minimal'): void {
    this.renderer?.setStyle(style)
  }

  /** 设置 Canvas 渲染分辨率缩放比例（用于性能降级，0-1） */
  setResolutionScale(scale: number): void {
    if (scale <= 0 || scale > 1) return
    this.renderer?.setQuality(scale)
  }

  /** 根据 video 分辨率动态调整 Canvas 尺寸 */
  resize(): void {
    if (!this.renderer || !this.video) return

    const w = this.video.videoWidth
    const h = this.video.videoHeight

    if (w > 0 && h > 0) {
      this.renderer.resize(w, h)
    }
  }

  /** 销毁实例 */
  dispose(): void {
    this.renderer?.dispose()
    this.renderer = null
    this.canvas = null
    this.video = null
  }
}

// ---- 单例 ----

let instance: VisualizationService | null = null

export function getVisualizationService(): VisualizationService {
  if (!instance) {
    instance = new VisualizationService()
  }
  return instance
}
