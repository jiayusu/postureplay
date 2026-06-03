// ============================================================
// 体态游乐场 PosturePlay — EyeHeatmapOverlay
//
// 眼疲劳热力图叠加层。
// 借鉴 AI-Eyes-Refractive-Error 的 Grad-CAM 热力图思路，
// 在用户画面眼周区域叠加眼疲劳热度可视化：
//   - 绿色 = 眼睛健康（正常 EAR + 正常眨眼频率）
//   - 黄色 = 轻微疲劳
//   - 橙色 = 中度疲劳
//   - 红色 = 严重疲劳
//
// 热力圆圈渲染在两眼的眼裂位置，透明度/颜色由疲劳因素驱动。
// ============================================================

import { useEffect, useRef, useCallback } from 'react'
import { useEyeStore } from '@/stores/eyeStore'
import { EYE_LANDMARK_INDICES } from '@/types/eye'

interface EyeHeatmapOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  className?: string
}

export default function EyeHeatmapOverlay({ videoRef, className }: EyeHeatmapOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rAFRef = useRef(0)

  const eyeMetrics = useEyeStore((s) => s.eyeMetrics)
  const faceLandmarks = useEyeStore((s) => s.faceLandmarks)
  const video = videoRef.current

  // 绘制热力圈
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // canvas 未完成尺寸设置时跳过
    if (canvas.width === 0 || canvas.height === 0) {
      rAFRef.current = requestAnimationFrame(draw)
      return
    }

    if (!eyeMetrics || !faceLandmarks || faceLandmarks.length < 468) {
      rAFRef.current = requestAnimationFrame(draw)
      return
    }

    const { fatigueScore } = eyeMetrics
    const li = EYE_LANDMARK_INDICES

    // 获取 Video 和 Canvas 的实际渲染尺寸
    const videoEl = video
    const videoW = videoEl?.videoWidth ?? 0
    const videoH = videoEl?.videoHeight ?? 0
    if (videoW === 0 || videoH === 0) {
      rAFRef.current = requestAnimationFrame(draw)
      return
    }
    const canvasW = canvas.width
    const canvasH = canvas.height

    // 计算缩放比例（视频 → Canvas）
    const scaleX = canvasW / videoW
    const scaleY = canvasH / videoH

    // 从面部关键点推算眼裂中心在视频中的位置
    const getEyeCenter = (innerIdx: number, outerIdx: number, topIdx: number, bottomIdx: number) => {
      const inner = faceLandmarks[innerIdx]
      const outer = faceLandmarks[outerIdx]
      const top = faceLandmarks[topIdx]
      const bottom = faceLandmarks[bottomIdx]
      if (!inner || !outer) return null

      const cx = ((inner.x + outer.x) / 2) * videoW * scaleX
      const cy = ((top?.y ?? inner.y) + (bottom?.y ?? inner.y)) / 2 * videoH * scaleY
      const eyeWidth = Math.abs(outer.x - inner.x) * videoW * scaleX

      return { cx, cy, eyeWidth }
    }

    const leftCenter = getEyeCenter(
      li.leftEye.inner, li.leftEye.outer,
      li.leftEye.top, li.leftEye.bottom,
    )
    const rightCenter = getEyeCenter(
      li.rightEye.inner, li.rightEye.outer,
      li.rightEye.top, li.rightEye.bottom,
    )

    // 确定热力图颜色
    const getColor = (fatigue: number): [number, number, number, number] => {
      if (fatigue < 25) return [34, 197, 94, 0.25]    // 绿色，低透明度
      if (fatigue < 50) return [250, 204, 21, 0.40]    // 黄色
      if (fatigue < 75) return [249, 115, 22, 0.55]    // 橙色
      return [239, 68, 68, 0.70]                        // 红色
    }

    const [r, g, b, alpha] = getColor(fatigueScore)

    // 绘制热力光圈（径向渐变）
    const drawHeatCircle = (cx: number, cy: number, radius: number) => {
      const gradient = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius)
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`)
      gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${alpha * 0.5})`)
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)

      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.fill()
    }

    // 绘制脉搏环（外圈渐变闪烁）
    const t = performance.now() / 1000
    const pulseAlpha = 0.3 + 0.15 * Math.sin(t * 2) // 2Hz 脉动

    const drawPulseRing = (cx: number, cy: number, radius: number) => {
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${pulseAlpha})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2)
      ctx.stroke()
    }

    if (leftCenter) drawHeatCircle(leftCenter.cx, leftCenter.cy, leftCenter.eyeWidth * 0.75)
    if (rightCenter) drawHeatCircle(rightCenter.cx, rightCenter.cy, rightCenter.eyeWidth * 0.75)

    // 疲劳严重时增加外圈脉搏环
    if (fatigueScore > 40) {
      if (leftCenter) drawPulseRing(leftCenter.cx, leftCenter.cy, leftCenter.eyeWidth * 0.75)
      if (rightCenter) drawPulseRing(rightCenter.cx, rightCenter.cy, rightCenter.eyeWidth * 0.75)
    }

    // 疲劳严重时绘制眼疲劳文字标签
    if (fatigueScore > 25 && leftCenter) {
      const label = fatigueScore > 75 ? '重度疲劳' : fatigueScore > 50 ? '中度疲劳' : '轻度疲劳'
      ctx.font = '12px sans-serif'
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`
      ctx.textAlign = 'center'
      ctx.fillText(label, leftCenter.cx, leftCenter.cy - leftCenter.eyeWidth * 0.9)
    }

    rAFRef.current = requestAnimationFrame(draw)
  }, [eyeMetrics, faceLandmarks, video])

  // Canvas 尺寸同步
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      if (!canvas.parentElement) return
      canvas.width = canvas.parentElement.clientWidth
      canvas.height = canvas.parentElement.clientHeight
    }

    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  // 渲染循环
  useEffect(() => {
    rAFRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rAFRef.current)
  }, [draw])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ pointerEvents: 'none' }}
    />
  )
}
