/**
 * GPUEffectOverlay — GPU 气场特效叠加层
 *
 * 在摄像头画面上方叠加全屏 GPU 特效（流体 + RD + NBody + LIC 流线），
 * 形成环绕人体的"能量气场"视觉效果。
 *
 * 用法：
 *   <GPUEffectOverlay className="absolute inset-0 z-[2.2]" />
 */
import React, { useRef } from 'react'
import { useGPUEffects } from '@/hooks/useGPUEffects'
import type { GPUEffectsConfig } from '@/hooks/useGPUEffects'

interface GPUEffectOverlayProps {
  className?: string
  config?: Partial<GPUEffectsConfig>
}

const GPUEffectOverlay: React.FC<GPUEffectOverlayProps> = ({
  className = '',
  config,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useGPUEffects(canvasRef, config)

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none ${className}`}
      style={{ width: '100%', height: '100%' }}
    />
  )
}

export default GPUEffectOverlay
