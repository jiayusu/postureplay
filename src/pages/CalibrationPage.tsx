// ============================================================
// 体态游乐场 PosturePlay — CalibrationPage
//
// 30 秒中立位校准流程：
//   摄像头拍摄 + 骨架可视化 + 每 500ms 采样关键点 →
//   进度满 100% 后 finalize → 跳转镜像页。
// ============================================================

import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCalibrationStore } from '@/stores/calibrationStore'
import { useCameraStore } from '@/stores/cameraStore'
import { usePostureStore } from '@/stores/postureStore'
import { usePoseDetection } from '@/hooks/usePoseDetection'
import ProgressBar from '@/components/ProgressBar'
import type { Keypoint } from '@/types'

// ---- 连接定义（用于绘制骨架线） ----
const SKELETON_CONNECTIONS: [number, number][] = [
  [11, 12], // 肩膀
  [11, 23], // 左肩 → 左髋
  [12, 24], // 右肩 → 右髋
  [23, 24], // 髋部
  [11, 13], // 左上臂
  [13, 15], // 左前臂
  [12, 14], // 右上臂
  [14, 16], // 右前臂
  [23, 25], // 左大腿
  [25, 27], // 左小腿
  [24, 26], // 右大腿
  [26, 28], // 右小腿
]

export default function CalibrationPage() {
  const navigate = useNavigate()

  // ---- Refs ----
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // ---- Stores ----
  const phase = useCalibrationStore((s) => s.phase)
  const progress = useCalibrationStore((s) => s.progress)
  const startCalibration = useCalibrationStore((s) => s.startCalibration)
  const addSample = useCalibrationStore((s) => s.addSample)
  const finalize = useCalibrationStore((s) => s.finalize)
  const reset = useCalibrationStore((s) => s.reset)
  const loadExisting = useCalibrationStore((s) => s.loadExisting)

  const cameraStatus = useCameraStore((s) => s.status)
  const startCamera = useCameraStore((s) => s.startCamera)
  const stream = useCameraStore((s) => s.stream)

  const keypoints = usePostureStore((s) => s.keypoints)

  // ---- 启动姿态检测 ----
  usePoseDetection(videoRef)

  // ---- Mount: 初始化摄像头 + 校准 ----
  useEffect(() => {
    const init = async () => {
      // 检查是否已有校准数据
      const existing = await loadExisting()
      if (existing) {
        // 已有校准数据，短暂显示完成态后跳转
        const timer = setTimeout(() => {
          navigate('/mirror')
        }, 1000)
        return () => clearTimeout(timer)
      }

      // 确保摄像头运行
      if (cameraStatus !== 'active') {
        await startCamera()
      }

      // 开始校准
      startCalibration()
    }

    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- 绑定 stream 到 video ---
  useEffect(() => {
    const video = videoRef.current
    if (!video || !stream) return
    if (video.srcObject === stream) return

    video.srcObject = stream
    video.playsInline = true
    video.play().catch(() => {})
  }, [stream])

  // ---- 采样循环：每 500ms 采集一次关键点 ----
  useEffect(() => {
    if (phase !== 'calibrating') return

    const interval = setInterval(() => {
      const kps = usePostureStore.getState().keypoints
      if (kps && kps.length > 0) {
        addSample(kps)
      }
    }, 500)

    return () => clearInterval(interval)
  }, [phase, addSample])

  // ---- 进度到 100% → finalize ----
  useEffect(() => {
    if (phase === 'calibrating' && progress >= 100) {
      finalize().catch(() => {})
    }
  }, [phase, progress, finalize])

  // ---- 校准完成 → 跳转 ----
  useEffect(() => {
    if (phase === 'complete') {
      const timer = setTimeout(() => {
        navigate('/mirror')
      }, 1200)
      return () => clearTimeout(timer)
    }
  }, [phase, navigate])

  // ---- 绘制骨架 Canvas ----
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !keypoints) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 同步 canvas 尺寸
    canvas.width = canvas.clientWidth
    canvas.height = canvas.clientHeight

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const w = canvas.width
    const h = canvas.height

    // 画关键点
    const drawKeypoint = (kp: Keypoint) => {
      if (kp.visibility < 0.5) return
      const cx = kp.x * w
      const cy = kp.y * h
      ctx.beginPath()
      ctx.arc(cx, cy, 4, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.fill()
    }

    keypoints.forEach(drawKeypoint)

    // 画骨架连线
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 2
    for (const [i, j] of SKELETON_CONNECTIONS) {
      const a = keypoints[i]
      const b = keypoints[j]
      if (!a || !b || a.visibility < 0.5 || b.visibility < 0.5) continue
      ctx.beginPath()
      ctx.moveTo(a.x * w, a.y * h)
      ctx.lineTo(b.x * w, b.y * h)
      ctx.stroke()
    }
  }, [keypoints])

  // ---- 取消 ----
  const handleCancel = () => {
    reset()
    navigate('/onboarding')
  }

  // ---- 重试 ----
  const handleRetry = () => {
    reset()
    startCalibration()
  }

  // ---- 错误态 ----
  if (phase === 'error') {
    return (
      <div className="h-screen w-screen bg-[#0f0f1a] flex flex-col items-center justify-center px-6">
        <span className="text-[#ef4444] text-[16px] mb-6 text-center">
          校准数据不足，请重新校准
        </span>

        <button
          onClick={handleRetry}
          className="bg-[#f59e4b] text-white rounded-[8px] px-8 py-2.5 text-[15px] font-medium
                     hover:brightness-110 transition-all duration-150 mb-3"
        >
          重新校准
        </button>

        <span
          onClick={handleCancel}
          className="text-[13px] text-[#323258] hover:text-white cursor-pointer transition-colors"
        >
          返回
        </span>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen bg-[#0f0f1a] relative overflow-hidden">
      {/* 摄像头画面：全屏镜像 */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform: 'scaleX(-1)' }}
        muted
        playsInline
      />

      {/* 骨架画布叠加 */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full z-[1] pointer-events-none"
      />

      {/* 顶部文字叠加 */}
      <div className="absolute top-0 left-0 right-0 z-10 pt-8 px-4">
        <h2 className="text-[18px] text-white font-medium text-center">
          校准你的中立位
        </h2>
        <p className="text-[13px] text-[#323258] text-center mt-1">
          请自然站立（或端坐），保持你最舒服的姿势
        </p>
      </div>

      {/* 底部进度区域 */}
      <div className="absolute bottom-0 left-0 right-0 z-10 pb-12 px-4 flex flex-col items-center">
        <div className="w-full max-w-[320px]">
          <ProgressBar
            progress={progress}
            label={`采集数据中... ${progress}%`}
          />
        </div>

        <p className="text-[13px] text-[#323258] text-center mt-2">
          保持自然，不要刻意挺直
        </p>

        <span
          onClick={handleCancel}
          className="text-[13px] text-[#323258] hover:text-white cursor-pointer mt-3 transition-colors"
        >
          取消校准
        </span>
      </div>
    </div>
  )
}
