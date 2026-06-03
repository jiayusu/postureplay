/**
 * "面相透射·眼鼻" 特效叠加层 — Eye Roller 风格
 *
 * 灵感来源：Eye Roller (yufengzhao.com)
 * 艺术技法：
 *   - 眼窝填充白色半透明基底
 *   - 瞳孔受重力/头部倾斜驱动，在眼窝多边形内滚动
 *   - 鼻梁金线高光 + 鼻尖辉点
 *
 * 纯 Canvas 2D，无需 GPU
 */
import { useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import { useEyeStore } from '../stores/eyeStore'
import { renderEyeNoseRelief, resetPupilStates } from '../art'

interface EyeNoseOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
}

export function EyeNoseOverlay(_props: EyeNoseOverlayProps) {
  // videoRef kept in props for future use
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)
  const canvasReadyRef = useRef(false)

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

  // 使用 useLayoutEffect 确保 canvas 尺寸在首次绘制前已设置
  useLayoutEffect(() => {
    resizeCanvas()
  }, [resizeCanvas])

  useEffect(() => {
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [resizeCanvas])

  // 挂载时重置瞳孔状态
  useEffect(() => {
    resetPupilStates()
    return () => {
      resetPupilStates()
    }
  }, [])

  // 渲染循环
  useEffect(() => {
    let running = true

    const loop = () => {
      if (!running) return
      const canvas = canvasRef.current

      // 首次 canvas 尺寸可能为 0（remount 时布局未完成），重新测量
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

      // 不需要 video 帧，只依赖 faceLandmarks
      renderEyeNoseRelief(
        ctx,
        faceLandmarks,
        canvas.width,
        canvas.height,
        performance.now() * 0.001,
      )

      animFrameRef.current = requestAnimationFrame(loop)
    }
    loop()

    return () => {
      running = false
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [faceLandmarks, resizeCanvas])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-[5] pointer-events-none"
      style={{ backgroundColor: 'transparent' }}
    />
  )
}
