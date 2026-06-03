/**
 * 生命之树脊柱能量图谱叠加层
 *
 * 隐喻渲染：金色藤蔓 + 节点花朵/锁链 + 八卦圈 + 太极图 + 能量粒子
 * 纯 Canvas 2D
 */
import { useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import { usePhysiognomyStore } from '../stores/physiognomyStore'
import { usePostureStore } from '../stores/postureStore'
import { renderSpineTree } from '../art'

export function SpineTreeOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)
  const canvasReadyRef = useRef(false)

  const spineMetrics = usePhysiognomyStore(s => s.spineMetrics)
  const spineEnergy = usePhysiognomyStore(s => s.spineEnergy)
  const keypoints = usePostureStore(s => s.keypoints)

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

      renderSpineTree(
        ctx, canvas.width, canvas.height,
        spineMetrics ?? null,
        spineEnergy ?? null,
        keypoints ?? null,
        performance.now() * 0.001,
      )

      animFrameRef.current = requestAnimationFrame(loop)
    }
    loop()
    return () => { running = false; cancelAnimationFrame(animFrameRef.current) }
  }, [spineMetrics, spineEnergy, keypoints])

  return (
    <canvas ref={canvasRef}
      className="absolute inset-0 z-[4] pointer-events-none"
      style={{ backgroundColor: 'transparent' }} />
  )
}
