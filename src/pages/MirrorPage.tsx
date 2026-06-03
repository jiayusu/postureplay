// ============================================================
// 体态游乐场 PosturePlay — MirrorPage
//
// 核心镜像页：摄像头画面 + 尾巴可视化 + 实时体态检测。
// 层叠结构（从底到顶）：
//   1. CameraView（摄像头画面）
//   2. VisualizationOverlay（尾巴渲染）
//   3. UI Chrome（EmotionHUD / ModeSwitcher / AlertBanner / Fortune FAB）
//
// 阶段十五更新：
//   - usePerformanceMonitor → useDegradationController(mode)
//   - 多级降级指示器（三级颜色：黄/橙/红）
// 阶段十六更新：
//   - 摄像头重连提示覆盖层（reconnecting / 重试中状态）
// AI-Eyes 集成：
//   - useEyeDetection：独立 rAF 面部检测管道
//   - EyeHeatmapOverlay：眼疲劳热力图（Grad-CAM 风格）
//   - FusionService：体态+眼态联动反馈
// ============================================================

import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCameraSetup } from '@/hooks/useCameraSetup'
import { usePoseDetection } from '@/hooks/usePoseDetection'
import { useEyeDetection } from '@/hooks/useEyeDetection'

import { useDegradationController } from '@/hooks/useDegradationController'
import { useCameraStore } from '@/stores/cameraStore'
import { usePostureStore } from '@/stores/postureStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useUIStore } from '@/stores/uiStore'
import { useEyeStore } from '@/stores/eyeStore'
import CameraView from '@/components/CameraView'
import VisualizationOverlay from '@/components/VisualizationOverlay'
import EyeHeatmapOverlay from '@/components/EyeHeatmapOverlay'
import ModeSwitcher from '@/components/ModeSwitcher'
import EmotionHUD from '@/components/EmotionHUD'
import AlertBanner from '@/components/AlertBanner'
import type { DegradationLevel } from '@/types'

// ── 降级等级 → UI 指示 ──

const DEGRADE_INDICATOR: Record<DegradationLevel, { icon: string; color: string; label: string } | null> = {
  none: null,
  level1: { icon: '\u26A1', color: '#fbbf24', label: '性能模式' },    // ⚡ 黄色
  level2: { icon: '\u26A1', color: '#f59e4b', label: '大幅降级' },    // ⚡ 橙色
  level3: { icon: '\u2757', color: '#ef4444', label: '极限降级' },    // ❗ 红色
}

export default function MirrorPage() {
  const navigate = useNavigate()

  // ---- Refs ----
  const videoRef = useRef<HTMLVideoElement>(null)

  // ---- Hooks ----
  useCameraSetup(videoRef)
  usePoseDetection(videoRef)
  useEyeDetection(videoRef)

  // ---- Stores ----
  const cameraStatus = useCameraStore((s) => s.status)
  const startCamera = useCameraStore((s) => s.startCamera)

  const metrics = usePostureStore((s) => s.metrics)
  const modelStatus = usePostureStore((s) => s.modelStatus)
  const modelProgress = usePostureStore((s) => s.modelProgress)
  const loadModel = usePostureStore((s) => s.loadModel)

  const mode = useSessionStore((s) => s.mode)
  const isActive = useSessionStore((s) => s.isActive)
  const startSession = useSessionStore((s) => s.startSession)
  const endSession = useSessionStore((s) => s.endSession)

  const degradationLevel = useUIStore((s) => s.degradationLevel)

  const faceModelStatus = useEyeStore((s) => s.faceModelStatus)
  const loadFaceModel = useEyeStore((s) => s.loadFaceModel)
  const fusionFeedback = useEyeStore((s) => s.fusionFeedback)

  // ── 三级降级控制器（替换旧 usePerformanceMonitor）──
  useDegradationController(mode)

  // ---- 自动加载 AI 模型（若跳过 LoadingPage 直接进入） ----
  useEffect(() => {
    if (modelStatus === 'idle') {
      loadModel()
    }
  }, [modelStatus, loadModel])

  // ---- 自动加载面部模型 ----
  useEffect(() => {
    if (faceModelStatus === 'idle') {
      loadFaceModel()
    }
  }, [faceModelStatus, loadFaceModel])

  // ---- 启动摄像头 + 会话 ----
  useEffect(() => {
    if (cameraStatus === 'idle') {
      startCamera()
    }
    if (!isActive) {
      startSession(mode)
    }
  }, []) // eslint-disable-next-line react-hooks/exhaustive-deps

  // ---- 清理：结束会话 ----
  useEffect(() => {
    const handleBeforeUnload = () => {
      endSession()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      endSession()
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [endSession])

  // ---- Tab 可见性：体态偏离时修改页面标题 ----
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && metrics && !metrics.isNeutral) {
        if (!document.title.startsWith('\u26A0')) {
          document.documentElement.dataset.prevTitle = document.title
        }
        document.title = '\u26A0\uFE0F 你的尾巴歪了！'
      } else {
        const prev = document.documentElement.dataset.prevTitle
        if (prev) {
          document.title = prev
          delete document.documentElement.dataset.prevTitle
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [metrics])

  // ── 降级指示器信息 ──
  const degradeInfo = DEGRADE_INDICATOR[degradationLevel]

  return (
    <div className="h-screen w-screen bg-[#0f0f1a] relative overflow-hidden">
      {/* ---- 模型加载中（直接进入 /mirror 时显示） ---- */}
      {modelStatus !== 'ready' && (
        <div className="absolute inset-0 z-50 bg-[#0f0f1a] flex flex-col items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#f59e4b] border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-[15px] text-[#f59e4b] font-medium">
            AI 眼镜正在装配中...
          </p>
          <p className="text-[12px] text-[#6b6b8a] mt-2">
            {modelStatus === 'loading' ? `${modelProgress}%` : '准备中...'}
          </p>
          {modelStatus === 'error' && (
            <button
              onClick={loadModel}
              className="mt-4 px-6 py-2 rounded-full text-sm bg-[#f59e4b] text-white hover:brightness-110 transition-all"
            >
              重新加载
            </button>
          )}
        </div>
      )}

      {/* ---- 第 1 层：摄像头画面 ---- */}
      <div className="absolute inset-0 z-0">
        <CameraView ref={videoRef} mirrored className="w-full h-full object-cover" />
      </div>

      {/* ---- 第 2 层：可视化叠加 ---- */}
      <div className="absolute inset-0 z-[2] pointer-events-none">
        <VisualizationOverlay videoRef={videoRef} className="w-full h-full" />
      </div>

      {/* ---- 第 2.5 层：眼疲劳热力图叠加 ---- */}
      <div className="absolute inset-0 z-[3] pointer-events-none">
        <EyeHeatmapOverlay videoRef={videoRef} className="w-full h-full" />
      </div>

      {/* ---- 第 3 层：UI Chrome ---- */}
      <div className="absolute top-0 left-0 z-10">
        <EmotionHUD />
      </div>

      <div className="absolute top-4 right-4 z-10">
        <ModeSwitcher />
      </div>

      {/* 多级降级指示器 */}
      {degradeInfo && (
        <div
          className="absolute top-4 right-36 z-10 text-[13px] font-medium flex items-center gap-1"
          style={{ color: degradeInfo.color }}
        >
          <span>{degradeInfo.icon}</span>
          <span className="text-[11px] opacity-80">{degradeInfo.label}</span>
        </div>
      )}

      {/* 阶段十六：摄像头重连提示覆盖层 */}
      {cameraStatus === 'reconnecting' && (
        <div className="absolute inset-0 z-50 bg-[#0f0f1a]/80 flex flex-col items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#f59e4b] border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-[15px] text-[#f59e4b] font-medium">
            摄像头断开了，正在重新连接...
          </p>
          <p className="text-[12px] text-[#6b6b8a] mt-2">
            请确保摄像头未被其他应用占用
          </p>
        </div>
      )}

      {/* AlertBanner：顶部横幅 */}
      <div className="absolute top-14 left-0 right-0 z-20">
        <AlertBanner />
      </div>

      {/* Physiognomy FAB：相术体态按钮 */}
      <button
        onClick={() => navigate('/physiognomy')}
        className="fixed bottom-8 right-[136px] z-30
                   w-[48px] h-[48px] rounded-full bg-[#1a1a2e]/80 backdrop-blur-sm
                   border border-[#ffd700]/30
                   flex items-center justify-center
                   shadow-lg hover:scale-110 transition-all duration-200"
        title="相术体态分析"
      >
        <span className="text-[18px]">☯</span>
      </button>

      {/* Palm FAB：手相健康按钮 */}
      <button
        onClick={() => navigate('/palm')}
        className="fixed bottom-8 right-24 z-30
                   w-[48px] h-[48px] rounded-full bg-[#1a1a2e]/80 backdrop-blur-sm
                   border border-[#f59e4b]/30
                   flex items-center justify-center
                   shadow-lg hover:scale-110 transition-all duration-200"
        title="手相健康"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e4b" strokeWidth="1.5">
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z" />
          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
          <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="2" />
          <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="2" />
        </svg>
      </button>

      {/* Fortune FAB：右下角悬浮按钮 */}
      <button
        onClick={() => navigate('/fortune')}
        className="fixed bottom-8 right-8 z-30
                   w-[48px] h-[48px] rounded-full bg-[#f59e4b]
                   flex items-center justify-center
                   shadow-lg hover:scale-110 transition-all duration-200"
        title="查看运势"
      >
        <span className="text-white text-[18px] font-medium">{'\u8FD0'}</span>
      </button>

      {/* ── 体态+眼态融合反馈 ── */}
      {fusionFeedback && fusionFeedback.level !== 'none' && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40
                        max-w-[360px] w-[90%]
                        bg-[#1a1a2e]/90 backdrop-blur-[12px]
                        rounded-[12px] px-4 py-3
                        border border-[#323258]/50
                        shadow-xl
                        animate-[slideUp_0.3s_ease-out]">
          <div className="flex items-start gap-2">
            <span className="text-[16px] mt-0.5">
              {fusionFeedback.level === 'alert' ? '\u2757' :
               fusionFeedback.level === 'warning' ? '\u26A0' : '\u2139'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-white leading-snug">
                {fusionFeedback.title}
              </p>
              <p className="text-[12px] text-[#a0a0c0] mt-0.5 leading-snug">
                {fusionFeedback.description}
              </p>
              <p className="text-[11px] text-[#f59e4b] mt-1.5 font-medium">
                {'\u27A4'} {fusionFeedback.suggestedAction}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
