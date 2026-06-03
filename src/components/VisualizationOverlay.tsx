// ============================================================
// 体态游乐场 PosturePlay — VisualizationOverlay
//
// Canvas 叠加层，与 CameraView 同尺寸叠加。
// 使用 useVisualization Hook 驱动渲染管线。
// 根据当前模式（work/casual/meditation）切换可视化风格。
// ============================================================

import React, { useRef, useEffect } from 'react'
import { useVisualization } from '@/hooks/useVisualization'
import { useSessionStore } from '@/stores/sessionStore'
import { getVisualizationService } from '@/services/visualization'

type VisualizationStyle = 'full' | 'simple' | 'minimal'

interface VisualizationOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement>
  className?: string
}

const modeToStyle: Record<string, VisualizationStyle> = {
  work: 'full',
  casual: 'simple',
  meditation: 'minimal',
}

const VisualizationOverlay: React.FC<VisualizationOverlayProps> = ({
  videoRef,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mode = useSessionStore((s) => s.mode)

  // ── 绑定渲染管线 ──
  useVisualization(canvasRef, videoRef)

  // ── 模式切换 → 可视化风格 ──
  useEffect(() => {
    const style = modeToStyle[mode] || 'full'
    const svc = getVisualizationService()
    svc.setModeStyle(style)
  }, [mode])

  // ── 同步 Canvas 尺寸到 video 实际分辨率 ──
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const syncDimensions = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const vw = video.videoWidth
      const vh = video.videoHeight
      if (vw && vh) {
        canvas.width = vw
        canvas.height = vh
        getVisualizationService().resize()
      }
    }

    syncDimensions()

    const onResize = () => syncDimensions()
    video.addEventListener('resize', onResize)
    video.addEventListener('loadedmetadata', onResize)

    return () => {
      video.removeEventListener('resize', onResize)
      video.removeEventListener('loadedmetadata', onResize)
    }
  }, [videoRef])

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full pointer-events-none z-[2] ${className}`}
    />
  )
}

export default VisualizationOverlay
