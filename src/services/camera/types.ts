/**
 * CameraService 模块类型定义
 *
 * 从全局类型重新导出 CameraConfig / CameraErrorType，
 * 并定义本模块特有的 LightingInfo 和 CameraServiceInterface。
 */

import type { CameraConfig } from '@/types'

export type { CameraConfig }

// ---- 光照检测 ----

/** 光照检测结果 */
export interface LightingInfo {
  /** 光照是否充足 */
  sufficient: boolean
  /** 光照等级 */
  level: 'low' | 'normal' | 'good'
}

// ---- 服务接口 ----

/** CameraService 对外接口 */
export interface CameraServiceInterface {
  /** 启动摄像头，返回 MediaStream */
  start(config: CameraConfig): Promise<MediaStream>

  /** 切换前后摄像头 */
  switchFacing(): Promise<MediaStream>

  /** 停止摄像头，释放所有 track */
  stop(): void

  /** 获取当前视频 track 的实际设置（含分辨率） */
  getTrackSettings(): MediaTrackSettings | null

  /** 检测当前光照条件（可选传入 video 元素以基于实际帧像素采样） */
  checkLighting(video?: HTMLVideoElement): LightingInfo

  /** 当前是否正在运行 */
  isActive(): boolean

  /** 当前摄像头朝向 */
  getFacingMode(): 'user' | 'environment'
}
