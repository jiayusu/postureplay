/**
 * SimulationOverlay — GPU 仿真叠加层
 *
 * 在摄像头画面上方叠加全屏 GPU 仿真（流体 + RD + NBody + LIC 流线），
 * 形成环绕人体的"能量气场"视觉效果。
 *
 * 用法：
 *   <SimulationOverlay className="absolute inset-0 z-[2.2]" />
 */
import React, { useRef } from 'react'
import { useSimulation } from '@/hooks/useSimulation'
import type { SimulationConfig } from '@/hooks/useSimulation'

interface SimulationOverlayProps {
  className?: string
  config?: Partial<SimulationConfig>
}

const SimulationOverlay: React.FC<SimulationOverlayProps> = ({
  className = '',
  config,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useSimulation(canvasRef, config)

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none ${className}`}
      style={{ width: '100%', height: '100%', background: 'transparent' }}
    />
  )
}

export default SimulationOverlay
