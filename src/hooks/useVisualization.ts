// ============================================================
// 体态游乐场 PosturePlay — useVisualization
//
// Canvas 渲染绑定 Hook：
//   - mount 时初始化 VisualizationService 并启动渲染循环
//   - 监听 keypoints / metrics / degradationLevel 变化 → 更新渲染状态
//   - unmount 时停止渲染并 dispose
//
// 用法：
//   useVisualization(canvasRef, videoRef)
// ============================================================

import { useEffect, useRef } from 'react'
import { getVisualizationService } from '@/services/visualization'
import { usePostureStore } from '@/stores/postureStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useUIStore } from '@/stores/uiStore'
import { useCameraStore } from '@/stores/cameraStore'
import { CANVAS_SCALE_LEVEL1, CANVAS_SCALE_LEVEL2, CANVAS_SCALE_LEVEL3 } from '@/constants/config'
import type { DegradationLevel } from '@/types'

/** 降级等级 → Canvas 缩放比例 */
const LEVEL_SCALE: Record<DegradationLevel, number> = {
  none: 1,
  level1: CANVAS_SCALE_LEVEL1,
  level2: CANVAS_SCALE_LEVEL2,
  level3: CANVAS_SCALE_LEVEL3,
}

export function useVisualization(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  videoRef: React.RefObject<HTMLVideoElement | null>,
) {
  const keypoints = usePostureStore((s) => s.keypoints)
  const metrics = usePostureStore((s) => s.metrics)
  const mode = useSessionStore((s) => s.mode)
  const degradationLevel = useUIStore((s) => s.degradationLevel)
  const cameraStatus = useCameraStore((s) => s.status)

  const mountedRef = useRef(false)

  // ── Mount / Unmount ──
  // 依赖 cameraStatus，确保 camera 就绪后 re-mount（初次 mount 时 video 可能尚未渲染）
  useEffect(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video || cameraStatus !== 'active') {
      mountedRef.current = false
      return
    }

    const svc = getVisualizationService()
    svc.mount(canvas, video)
    svc.start()
    mountedRef.current = true

    return () => {
      mountedRef.current = false
      svc.stop()
      svc.dispose()
    }
  }, [canvasRef, videoRef, cameraStatus])

  // ── 模式切换 → 风格 ──
  useEffect(() => {
    const svc = getVisualizationService()
    const modeToStyle: Record<string, 'full' | 'simple' | 'minimal'> = {
      work: 'full',
      casual: 'simple',
      meditation: 'minimal',
    }
    svc.setModeStyle(modeToStyle[mode] || 'full')
  }, [mode])

  // ── 降级等级 → Canvas 分辨率 ──
  useEffect(() => {
    const svc = getVisualizationService()
    const scale = LEVEL_SCALE[degradationLevel] ?? 1
    svc.setResolutionScale(scale)
  }, [degradationLevel])

  // ── Keypoints / Metrics → updatePose ──
  useEffect(() => {
    if (!mountedRef.current) return
    const svc = getVisualizationService()
    if (keypoints && metrics) {
      svc.updatePose(metrics, keypoints)
    }
  }, [keypoints, metrics])
}
