// ============================================================
// 体态游乐场 PosturePlay — useEyeDetection
//
// 人眼状态检测主循环 Hook：
//   - rAF 驱动逐帧面部检测（独立于 Pose 检测，降采样更激进）
//   - EAR 计算 → 眨眼检测 → 注视方向 → 疲劳评分
//   - 自动同步 eyeStore + 触发融合反馈
//
// 用法：
//   useEyeDetection(videoRef)
// ============================================================

import { useEffect, useRef } from 'react'
import { useEyeStore } from '@/stores/eyeStore'
import { getEyeStateService } from '@/services/eye'
import {
  FACE_FRAME_DOWNSAMPLE_RATE,
  FACE_METRICS_COMPUTE_INTERVAL,
} from '@/constants/eyeConfig'

/**
 * 启动人眼状态检测主循环。
 *
 * 独立于 Pose 检测，使用更激进的降采样（每 4 帧推理一次）
 * 以最小化 GPU 负担。
 */
export function useEyeDetection(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const updateFaceLandmarks = useEyeStore((s) => s.updateFaceLandmarks)
  const computeAndUpdateEyeMetrics = useEyeStore((s) => s.computeAndUpdateEyeMetrics)
  const updateFusionFeedback = useEyeStore((s) => s.updateFusionFeedback)

  const frameCountRef = useRef(0)
  const rAFRef = useRef(0)
  const detectCycleRef = useRef(0)

  useEffect(() => {
    const svc = getEyeStateService()
    let disposed = false

    const loop = async () => {
      if (disposed) return

      const video = videoRef.current
      if (!video || video.readyState < 2) {
        rAFRef.current = requestAnimationFrame(loop)
        return
      }

      frameCountRef.current++

      // 面部检测降采样更激进：每 4 帧推理一次
      if (frameCountRef.current % FACE_FRAME_DOWNSAMPLE_RATE === 0) {
        const now = performance.now()

        try {
          const faceLandmarks = await svc.detectFace(video, now)

          if (disposed) return

          if (!faceLandmarks || faceLandmarks.length < 468) {
            rAFRef.current = requestAnimationFrame(loop)
            return
          }

          // 更新面部关键点
          updateFaceLandmarks(faceLandmarks)

          // 每 N 次检测计算一次完整眼态指标
          detectCycleRef.current++
          if (detectCycleRef.current % FACE_METRICS_COMPUTE_INTERVAL === 0) {
            computeAndUpdateEyeMetrics()
            // 同时更新融合反馈
            updateFusionFeedback()
          }
        } catch {
          // detect 失败，静默跳过
        }
      }

      rAFRef.current = requestAnimationFrame(loop)
    }

    rAFRef.current = requestAnimationFrame(loop)

    return () => {
      disposed = true
      cancelAnimationFrame(rAFRef.current)
    }
  }, [
    videoRef,
    updateFaceLandmarks,
    computeAndUpdateEyeMetrics,
    updateFusionFeedback,
  ])
}
