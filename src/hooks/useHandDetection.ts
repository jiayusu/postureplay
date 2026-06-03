// ============================================================
// 体态游乐场 PosturePlay — useHandDetection
//
// 管理手部检测的生命周期（rAF 循环、模型初始化、指标计算）。
// 跟随与 usePoseDetection / useEyeDetection 相同的模式。
// ============================================================

import { useEffect, useRef, useCallback } from 'react'
import { useHandStore } from '@/stores/handStore'
import { detectHands } from '@/services/hand/mediapipeHand'
import {
  HAND_FRAME_DOWNSAMPLE_RATE,
  HAND_METRICS_COMPUTE_INTERVAL,
} from '@/constants/palmHealthConfig'

interface UseHandDetectionOptions {
  /** 摄像头 video 元素的 RefObject（在 effect 中读取 .current，避免 render 时机题） */
  videoRef: React.RefObject<HTMLVideoElement | null>
  /** 用于图像分析的 Canvas 元素 */
  analysisCanvas: HTMLCanvasElement | null
  /** 是否启用 */
  enabled: boolean
}

export function useHandDetection(options: UseHandDetectionOptions) {
  const { videoRef, analysisCanvas, enabled } = options

  const {
    handModelStatus,
    handModelProgress,
    detectedHands,
    leftHandMetrics,
    rightHandMetrics,
    combinedMetrics,
    loadHandModel,
    setAnalysisCanvas,
    updateDetectedHands,
    computeHandMetrics,
    computeCombinedMetrics,
    resetHandState,
  } = useHandStore()

  const rafRef = useRef<number>(0)
  const frameCountRef = useRef(0)
  const metricsCountRef = useRef(0)

  // 初始化模型
  useEffect(() => {
    if (!enabled) return
    if (handModelStatus === 'idle' || handModelStatus === 'error') {
      loadHandModel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  // 设置分析 Canvas
  useEffect(() => {
    setAnalysisCanvas(analysisCanvas)
    return () => setAnalysisCanvas(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisCanvas])

  // rAF 检测循环
  useEffect(() => {
    const video = videoRef.current
    if (!enabled || handModelStatus !== 'ready' || !video) {
      return
    }

    let running = true

    const detect = () => {
      if (!running) return

      // 每帧重新读取 ref，确保视频元素可用后再开始
      const currentVideo = videoRef.current
      if (!currentVideo) {
        rafRef.current = requestAnimationFrame(detect)
        return
      }

      frameCountRef.current++

      // 降采样
      if (frameCountRef.current % HAND_FRAME_DOWNSAMPLE_RATE === 0) {
        // detectHands 是同步函数
        const now = performance.now()
        const hands = detectHands(currentVideo, now)

        updateDetectedHands(hands)

        metricsCountRef.current++

        // 定期计算完整指标
        if (
          hands.length > 0 &&
          metricsCountRef.current % HAND_METRICS_COMPUTE_INTERVAL === 0
        ) {
          computeHandMetrics()
          computeCombinedMetrics()
        }
      }

      rafRef.current = requestAnimationFrame(detect)
    }

    rafRef.current = requestAnimationFrame(detect)

    return () => {
      running = false
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, handModelStatus])

  // 暴露手动触发指标计算的接口
  const forceCompute = useCallback(() => {
    computeHandMetrics()
    computeCombinedMetrics()
  }, [computeHandMetrics, computeCombinedMetrics])

  return {
    handModelStatus,
    handModelProgress,
    detectedHands,
    leftHandMetrics,
    rightHandMetrics,
    combinedMetrics,
    forceCompute,
    resetHandState,
  }
}
