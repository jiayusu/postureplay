/**
 * CalibrationService 模块类型定义
 *
 * 从全局类型重新导出 CalibrationData，定义服务接口。
 */

import type { CalibrationData, Keypoint } from '@/types'

export type { CalibrationData }

/** CalibrationService 对外接口 */
export interface CalibrationServiceInterface {
  /** 开始校准流程，返回实时关键点流 */
  startCalibration(): AsyncIterable<{
    progress: number
    keypoints: Keypoint[]
  }>

  /** 完成校准，计算基线并持久化 */
  finalize(samples: Keypoint[][]): Promise<CalibrationData>

  /** 获取最近一次校准数据 */
  getLatest(): Promise<CalibrationData | null>

  /** 重置校准 */
  reset(): Promise<void>
}
