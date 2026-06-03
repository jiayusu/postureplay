/**
 * "掌中星辰" 动态投影叠加层
 *
 * 隐喻渲染：九宫八卦网格 + 大鱼际能量粒子 + 关节荧光 + 红点脉冲
 * 纯 Canvas 2D
 */
import { useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import { usePhysiognomyStore } from '../stores/physiognomyStore'
import { useHandStore } from '../stores/handStore'
import { renderPalmStars } from '../art'

export function PalmStarsOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)
  const canvasReadyRef = useRef(false)

  const palmStars = usePhysiognomyStore(s => s.palmStars)
  const detectedHands = useHandStore(s => s.detectedHands)

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return
    const w = parent.clientWidth
    const h = parent.clientHeight
    if (w > 0 && h > 0) {
      canvas.width = w
      canvas.height = h
      canvasReadyRef.current = true
    }
  }, [])

  useLayoutEffect(() => { resizeCanvas() }, [resizeCanvas])
  useEffect(() => {
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [resizeCanvas])

  useEffect(() => {
    let running = true
    const loop = () => {
      if (!running) return
      const canvas = canvasRef.current
      if (!canvasReadyRef.current && canvas) resizeCanvas()
      if (!canvas || canvas.width === 0) {
        animFrameRef.current = requestAnimationFrame(loop)
        return
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) { animFrameRef.current = requestAnimationFrame(loop); return }

      const handLm = detectedHands.length > 0 ? detectedHands[0].landmarks : null

      renderPalmStars(
        ctx, canvas.width, canvas.height,
        palmStars ?? null,
        handLm ?? null,
        performance.now() * 0.001,
      )

      animFrameRef.current = requestAnimationFrame(loop)
    }
    loop()
    return () => { running = false; cancelAnimationFrame(animFrameRef.current) }
  }, [palmStars, detectedHands])

  return (
    <canvas ref={canvasRef}
      className="absolute inset-0 z-[4] pointer-events-none"
      style={{ backgroundColor: 'transparent' }} />
  )
}
