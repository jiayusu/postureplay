// ============================================================
// 体态游乐场 PosturePlay — 手部骨架叠加层
//
// 在 Canvas 上绘制手部 21 个关键点和连接线。
// 与 VisualizationOverlay 模式一致，支持 2D Canvas 渲染。
// ============================================================

import { useEffect, useRef } from 'react'
import type { HandKeypoint } from '@/types/hand'
import { HAND_CONNECTIONS, HAND_KEYPOINT_INDEX } from '@/constants/handKeypoints'
import { HAND_KEYPOINT_NAMES } from '@/constants/handKeypoints'

interface HandOverlayProps {
  /** 检测到的手部关键点列表（每只手 21 个点） */
  landmarks: HandKeypoint[]
  /** 手性 */
  handedness: 'Left' | 'Right'
  /** Canvas 宽度 */
  width: number
  /** Canvas 高度 */
  height: number
  /** 是否显示关键点圆点 */
  showKeypoints?: boolean
  /** 是否显示索引标签 */
  showLabels?: boolean
}

export default function HandOverlay({
  landmarks,
  handedness,
  width,
  height,
  showKeypoints = true,
  showLabels = false,
}: HandOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || landmarks.length < 21) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 清空 Canvas
    ctx.clearRect(0, 0, width, height)

    // 手性颜色
    const primaryColor = handedness === 'Left' ? '#60a5fa' : '#f97316'
    const glowColor = handedness === 'Left'
      ? 'rgba(96, 165, 250, 0.3)'
      : 'rgba(249, 115, 22, 0.3)'

    // 绘制光晕
    drawGlow(ctx, landmarks, width, height, glowColor)

    // 绘制连接线
    ctx.strokeStyle = primaryColor
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (const [i, j] of HAND_CONNECTIONS) {
      const a = landmarks[i]
      const b = landmarks[j]
      if (a.visibility < 0.3 || b.visibility < 0.3) continue

      ctx.beginPath()
      ctx.moveTo(a.x * width, a.y * height)
      ctx.lineTo(b.x * width, b.y * height)
      ctx.stroke()
    }

    // 绘制关键点
    if (showKeypoints) {
      for (let i = 0; i < landmarks.length; i++) {
        const lm = landmarks[i]
        if (lm.visibility < 0.3) continue

        const x = lm.x * width
        const y = lm.y * height

        // 指尖用更大圆点
        const isFingertip = [4, 8, 12, 16, 20].includes(i)
        const radius = isFingertip ? 6 : 3.5

        // 外圈（暗色）
        ctx.beginPath()
        ctx.arc(x, y, radius + 1, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(15, 15, 26, 0.8)'
        ctx.fill()

        // 内圈（主题色）
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fillStyle = primaryColor
        ctx.fill()

        // 指尖加亮环
        if (isFingertip) {
          ctx.beginPath()
          ctx.arc(x, y, radius + 2.5, 0, Math.PI * 2)
          ctx.strokeStyle = primaryColor
          ctx.lineWidth = 1.5
          ctx.stroke()
        }

        // 标签
        if (showLabels) {
          ctx.font = '8px monospace'
          ctx.fillStyle = '#ffffff'
          ctx.textAlign = 'center'
          ctx.fillText(HAND_KEYPOINT_NAMES[i], x, y - radius - 4)
        }
      }
    }
  }, [landmarks, handedness, width, height, showKeypoints, showLabels])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 z-20 pointer-events-none"
      aria-label={`${handedness === 'Left' ? '左手' : '右手'} 手部骨架`}
    />
  )
}

// ---- 辅助：绘制光晕 ----

function drawGlow(
  ctx: CanvasRenderingContext2D,
  landmarks: HandKeypoint[],
  width: number,
  height: number,
  color: string,
) {
  const wrist = landmarks[HAND_KEYPOINT_INDEX['wrist']]
  const middleMCP = landmarks[HAND_KEYPOINT_INDEX['middle_finger_mcp']]

  if (wrist.visibility < 0.3 || middleMCP.visibility < 0.3) return

  const cx = (wrist.x + middleMCP.x) / 2 * width
  const cy = (wrist.y + middleMCP.y) / 2 * height
  const radius = Math.max(60, Math.abs(wrist.x - middleMCP.x) * width * 1.2)

  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
  gradient.addColorStop(0, color)
  gradient.addColorStop(1, 'transparent')

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
}
