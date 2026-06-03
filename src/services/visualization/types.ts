/**
 * VisualizationService 模块类型定义
 *
 * 定义对外接口和内部渲染器接口。
 */

import type { Keypoint, PostureMetrics, VisualizationType } from '@/types'

export type { VisualizationType }

/** VisualizationService 对外接口 */
export interface VisualizationServiceInterface {
  /** 绑定 Canvas 和 Video 元素 */
  mount(canvas: HTMLCanvasElement, video: HTMLVideoElement): void

  /** 启动渲染循环 */
  start(): void

  /** 停止渲染循环 */
  stop(): void

  /** 更新当前体态数据（每帧调用） */
  updatePose(metrics: PostureMetrics, keypoints: Keypoint[]): void

  /** 切换可视化类型（MVP 仅 tail） */
  setType(type: VisualizationType): void

  /** 设置模式风格 */
  setModeStyle(style: 'full' | 'simple' | 'minimal'): void

  /** 根据 video 分辨率动态调整 Canvas 尺寸 */
  resize(): void

  /** 销毁实例 */
  dispose(): void
}

/** 内部渲染器接口 */
export interface RendererInterface {
  updatePose(metrics: PostureMetrics, keypoints: Keypoint[]): void
  render(): void
  start(): void
  stop(): void
  setStyle(style: 'full' | 'simple' | 'minimal'): void
  setQuality(scale: number): void
  resize(width: number, height: number): void
  dispose(): void
}
