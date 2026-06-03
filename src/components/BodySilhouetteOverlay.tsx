/**
 * "经络能量体" 人体剪影叠加层
 *
 * 从 MediaPipe Pose 33 点关键点绘制人体线框骨架 + 半透明轮廓填充，
 * 形成"经络能量体"的相术视觉，叠加在摄像头画面之上。
 *
 * 纯 Canvas 2D，无需 GPU
 */
import { useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import { usePostureStore } from '../stores/postureStore'
import { usePhysiognomyStore } from '../stores/physiognomyStore'
import { renderBodySilhouette } from '../art'

interface BodySilhouetteOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
}

export function BodySilhouetteOverlay({ videoRef: _videoRef }: BodySilhouetteOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)
  const canvasReadyRef = useRef(false)

  const keypoints = usePostureStore(s => s.keypoints)
  const spineEnergy = usePhysiognomyStore(s => s.spineEnergy)

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

  useLayoutEffect(() => {
    resizeCanvas()
  }, [resizeCanvas])

  useEffect(() => {
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [resizeCanvas])

  // 渲染循环
  useEffect(() => {
    let running = true

    const loop = () => {
      if (!running) return
      const canvas = canvasRef.current

      if (!canvasReadyRef.current && canvas) {
        resizeCanvas()
      }

      if (!canvas || canvas.width === 0) {
        animFrameRef.current = requestAnimationFrame(loop)
        return
      }

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        animFrameRef.current = requestAnimationFrame(loop)
        return
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      renderBodySilhouette(
        ctx,
        keypoints,
        canvas.width,
        canvas.height,
        performance.now() * 0.001,
        spineEnergy,
      )

      animFrameRef.current = requestAnimationFrame(loop)
    }
    loop()

    return () => {
      running = false
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [keypoints, spineEnergy, resizeCanvas])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-[3] pointer-events-none"
      style={{ backgroundColor: 'transparent' }}
    />
  )
}
