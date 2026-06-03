// ============================================================
// 体态游乐场 PosturePlay — usePoseDetection
//
// 姿态检测主循环 Hook：
//   - rAF 驱动逐帧检测
//   - 帧降采样（每 FRAME_DOWNSAMPLE_RATE 帧推理一次）
//   - 指标增量更新（非推理帧复用上一次 metrics + stillness/emotion 增量）
//   - 自动同步 postureStore + sessionStore
//
// 用法：
//   usePoseDetection(videoRef)
// ============================================================

import { useEffect, useRef } from 'react'
import { usePostureStore } from '@/stores/postureStore'
import { useSessionStore } from '@/stores/sessionStore'
import { getPostureService } from '@/services/posture'
import {
  FRAME_DOWNSAMPLE_RATE,
  METRICS_COMPUTE_INTERVAL,
  INFERENCE_TIME_WINDOW,
} from '@/constants/config'
import type { PostureSnapshot } from '@/types'

/**
 * 启动姿态检测主循环。
 *
 * 内部结构：
 *   rAF loop → frameCounter → (降采样) → detectPose → updateKeypoints
 *   → computeAndUpdateMetrics → (session 激活) → tickNeutral + persistSnapshot
 *
 * @param videoRef - 绑定到摄像头流的 <video> 元素
 */
export function usePoseDetection(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const updateKeypoints = usePostureStore((s) => s.updateKeypoints)
  const computeAndUpdateMetrics = usePostureStore((s) => s.computeAndUpdateMetrics)
  const tickNeutral = useSessionStore((s) => s.tickNeutral)
  const isActive = useSessionStore((s) => s.isActive)

  const frameCountRef = useRef(0)
  const rAFRef = useRef(0)
  const lastDetectTimeRef = useRef(0)
  const inferenceTimesRef = useRef<number[]>([])
  const detectCycleRef = useRef(0)

  // ── 暴露 inferenceTimes 到 postureStore（调试用）──

  // ---- rAF 主循环 ----
  useEffect(() => {
    const svc = getPostureService()
    let disposed = false

    const loop = async () => {
      if (disposed) return

      const video = videoRef.current
      if (!video || video.readyState < 2) {
        rAFRef.current = requestAnimationFrame(loop)
        return
      }

      frameCountRef.current++

      // --- 帧降采样：每 N 帧执行一次推理 ---
      if (frameCountRef.current % FRAME_DOWNSAMPLE_RATE === 0) {
        const now = performance.now()
        const deltaSec = lastDetectTimeRef.current
          ? (now - lastDetectTimeRef.current) / 1000
          : 1 / 30
        lastDetectTimeRef.current = now

        try {
          const t0 = performance.now()
          const keypoints = await svc.detect(video, now)
          const t1 = performance.now()

          // ── 记录推理耗时 ──
          const inferenceMs = t1 - t0
          const times = inferenceTimesRef.current
          times.push(inferenceMs)
          if (times.length > INFERENCE_TIME_WINDOW) times.shift()

          // 每 20 次推理同步一次 avgInferenceTime 到 store
          detectCycleRef.current++
          if (detectCycleRef.current % 20 === 0 && times.length > 0) {
            const avg = times.reduce((s, v) => s + v, 0) / times.length
            usePostureStore.getState().setPerformanceMetrics({
              avgInferenceTime: avg,
            })
          }

          if (disposed || !keypoints || keypoints.length === 0) {
            rAFRef.current = requestAnimationFrame(loop)
            return
          }

          // 更新关键点到 postureStore
          updateKeypoints(keypoints)

          // 每 METRICS_COMPUTE_INTERVAL 次推理执行完整指标计算
          const detectCycle = frameCountRef.current / FRAME_DOWNSAMPLE_RATE
          if (detectCycle % METRICS_COMPUTE_INTERVAL === 1) {
            computeAndUpdateMetrics()
          }

          // 同步到 sessionStore
          const metrics = usePostureStore.getState().metrics
          if (metrics) {
            const snapshot: PostureSnapshot = {
              sessionId: '', // sessionStore 内部自动注入
              timestamp: now,
              spineAngle: metrics.spineAngle,
              shoulderLevelDiff: metrics.shoulderLevelDiff,
              headForwardAngle: metrics.headForwardAngle,
              breathMode: metrics.breathMode,
              emotionalState: metrics.emotionalState,
              isNeutral: metrics.isNeutral,
            }

            tickNeutral(metrics.isNeutral, deltaSec, snapshot)
          }
        } catch {
          // detect 失败（模型未就绪等），静默跳过本帧
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
    updateKeypoints,
    computeAndUpdateMetrics,
    tickNeutral,
    isActive,
  ])
}
