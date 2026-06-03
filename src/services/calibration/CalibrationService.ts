/**
 * CalibrationService — 校准模块核心
 *
 * 引导 30 秒中立位校准采集，计算个人体态基线并持久化。
 *
 * 流程：
 *   1. startCalibration() 返回 AsyncIterable，30s 内每 500ms yield 关键点 + 进度
 *   2. UI 层收集 60 帧后调用 finalize(samples) 计算基线
 *   3. 剔除 visibility < 0.7 的帧，逐关键点取中位数
 *   4. 存储到 IndexedDB，返回 CalibrationData
 */

import type { CalibrationData, Keypoint } from '@/types'
import type { CalibrationServiceInterface } from './types'
import {
  saveCalibration,
  getLatestCalibration,
  deleteAllCalibrations,
} from '@/core/db/calibrationRepo'
import {
  filterValidFrames,
  hasMinValidSamples,
  computeCalibrationConfidence,
  computeBaselineKeypoints,
} from './validation'

/** 校准总时长（秒） */
const CALIBRATION_DURATION_SEC = 30

/** 采样间隔（毫秒） */
const SAMPLE_INTERVAL_MS = 500

/** 总采样帧数 */
const TOTAL_SAMPLES = (CALIBRATION_DURATION_SEC * 1000) / SAMPLE_INTERVAL_MS // = 60

// ---- UUID 生成 ----

/** 生成简单的 UUID v4 */
function generateId(): string {
  return 'cal-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
}

// ---- sleep ----

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---- CalibrationService ----

export class CalibrationService implements CalibrationServiceInterface {
  /**
   * 开始校准流程
   *
   * 返回一个 AsyncIterable，调用方需要用 for-await-of 消费。
   * 每次 yield 包含当前进度 (0-100) 和关键点数组。
   *
   * 注意：keypoints 需要由调用方（通过 PostureService.detect）提供。
   * 这里提供的是一个进度迭代器，调用方自行获取关键点后填充。
   *
   * 实际使用模式：
   *   for await (const { progress } of service.startCalibration()) {
   *     const keypoints = await postureService.detect(video, timestamp)
   *     // 存入本地 buffer
   *   }
   *   await service.finalize(allSamples)
   */
  async *startCalibration(): AsyncIterable<{
    progress: number
    keypoints: Keypoint[]
  }> {
    for (let i = 0; i < TOTAL_SAMPLES; i++) {
      const progress = Math.round(((i + 1) / TOTAL_SAMPLES) * 100)

      yield {
        progress,
        // keypoints 由调用方填充（此处返回空数组作为占位）
        keypoints: [],
      }

      // 最后一次不 sleep
      if (i < TOTAL_SAMPLES - 1) {
        await sleep(SAMPLE_INTERVAL_MS)
      }
    }
  }

  /**
   * 完成校准，计算基线并持久化
   *
   * @param samples - 采集的所有帧（60 帧），每帧为 33 个关键点
   * @returns 计算出的 CalibrationData
   * @throws 有效帧不足 20 时抛出错误
   */
  async finalize(samples: Keypoint[][]): Promise<CalibrationData> {
    // 1. 验证
    if (!hasMinValidSamples(samples)) {
      const validCount = filterValidFrames(samples).length
      throw new Error(
        `校准数据不足：需要至少 20 帧有效数据，当前仅 ${validCount} 帧有效`,
      )
    }

    // 2. 筛选有效帧
    const validFrames = filterValidFrames(samples)

    // 3. 计算基线（逐关键点中位数）
    const baselineKeypoints = computeBaselineKeypoints(validFrames)

    // 4. 计算置信度
    const confidence = computeCalibrationConfidence(samples)

    // 5. 组装 CalibrationData
    const data: CalibrationData = {
      id: generateId(),
      baselineKeypoints,
      createdAt: Date.now(),
      duration: CALIBRATION_DURATION_SEC,
      confidence,
    }

    // 6. 先清空旧校准，再保存新记录
    await deleteAllCalibrations()
    await saveCalibration(data)

    return data
  }

  /** 获取最近一次校准数据 */
  async getLatest(): Promise<CalibrationData | null> {
    return getLatestCalibration()
  }

  /** 重置校准（清空所有校准记录） */
  async reset(): Promise<void> {
    await deleteAllCalibrations()
  }
}

// ---- 单例 ----

let instance: CalibrationService | null = null

export function getCalibrationService(): CalibrationService {
  if (!instance) {
    instance = new CalibrationService()
  }
  return instance
}
