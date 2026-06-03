/**
 * "面相透射" 骨骼光影叠加层
 *
 * 隐喻渲染：风格化颅骨 + 旭日/悬崖/磐石 + 面廓金边
 * 纯 Canvas 2D
 */
import { useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import { usePhysiognomyStore } from '../stores/physiognomyStore'
import { useEyeStore } from '../stores/eyeStore'
import { renderBonePhysiognomy } from '../art'

export function BoneGlowOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)
  const canvasReadyRef = useRef(false)

  const boneMetrics = usePhysiognomyStore(s => s.boneMetrics)
  const faceLandmarks = useEyeStore(s => s.faceLandmarks)

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

      renderBonePhysiognomy(
        ctx, canvas.width, canvas.height,
        boneMetrics ?? null,
        faceLandmarks ?? null,
        performance.now() * 0.001,
      )

      animFrameRef.current = requestAnimationFrame(loop)
    }
    loop()
    return () => { running = false; cancelAnimationFrame(animFrameRef.current) }
  }, [boneMetrics, faceLandmarks])

  return (
    <canvas ref={canvasRef}
      className="absolute inset-0 z-[4] pointer-events-none"
      style={{ backgroundColor: 'transparent' }} />
  )
}
