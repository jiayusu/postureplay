// ============================================================
// 体态游乐场 PosturePlay — LoadingPage
//
// 模型加载页：启动时调用 postureStore.loadModel() 加载 AI 模型，
// 加载完成后自动跳转到引导页或镜像页。
//
// 阶段十六更新：
//   - 浏览器兼容性检查：不支持 getUserMedia 时显示友好提示
//   - 模型加载超时处理：30 秒超时显示重试 UI
// ============================================================

import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePostureStore } from '@/stores/postureStore'
import ProgressBar from '@/components/ProgressBar'

// ---- 浏览器兼容性检查 ----

function isGetUserMediaSupported(): boolean {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
}

function isCompatibleBrowser(): boolean {
  // 仅检查 getUserMedia，这是核心功能依赖
  return isGetUserMediaSupported()
}

// 不支持的浏览器推荐列表
const RECOMMENDED_BROWSERS = ['Chrome', 'Edge', 'Firefox'] as const

export default function LoadingPage() {
  const navigate = useNavigate()

  const modelProgress = usePostureStore((s) => s.modelProgress)
  const modelStatus = usePostureStore((s) => s.modelStatus)
  const loadModel = usePostureStore((s) => s.loadModel)

  // 浏览器兼容性
  const [browserSupported] = useState(() => isCompatibleBrowser())

  // 超时标记：30 秒内未完成且未进入 error 状态 → 触发超时
  const [isTimeout, setIsTimeout] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ---- mount: 开始加载模型 ----
  useEffect(() => {
    if (!browserSupported) return

    loadModel()

    // 30 秒超时
    timeoutRef.current = setTimeout(() => {
      setIsTimeout(true)
    }, 30000)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [loadModel, browserSupported])

  // ---- 监听模型状态，清除超时 + 自动跳转 ----
  useEffect(() => {
    if (modelStatus === 'ready') {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      setIsTimeout(false)
      // 延迟一小段时间让用户看到 100%
      const timer = setTimeout(() => {
        navigate('/onboarding')
      }, 600)
      return () => clearTimeout(timer)
    }

    if (modelStatus === 'error') {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      setIsTimeout(false)
    }
  }, [modelStatus, navigate])

  // ---- 重试 ----
  const handleRetry = () => {
    setIsTimeout(false)
    loadModel()
    timeoutRef.current = setTimeout(() => {
      setIsTimeout(true)
    }, 30000)
  }

  // ────────────────────────────────────────
  // 浏览器不兼容
  // ────────────────────────────────────────
  if (!browserSupported) {
    return (
      <div className="h-screen w-screen bg-[#0f0f1a] flex flex-col items-center justify-center px-6 text-center">
        <div className="text-[48px] mb-4 select-none">{'\uD83C\uDF10'}</div>

        <h2 className="text-[22px] font-semibold text-white mb-2">
          浏览器不支持
        </h2>

        <p className="text-[13px] text-[#6b6b8a] mb-8 max-w-[320px] leading-relaxed">
          体态游乐场需要摄像头权限才能使用，请使用以下浏览器打开：
        </p>

        <div className="flex gap-4 mb-10">
          {RECOMMENDED_BROWSERS.map((browser) => (
            <span
              key={browser}
              className="text-[14px] text-[#f59e4b] bg-[#1a1a2e] rounded-[6px] px-4 py-1.5"
            >
              {browser}
            </span>
          ))}
        </div>

        <p className="text-[11px] text-[#323258] mt-6">
          所有检测均在本地完成，不上传任何数据
        </p>
      </div>
    )
  }

  // ────────────────────────────────────────
  // 超时
  // ────────────────────────────────────────
  if (isTimeout && modelStatus !== 'ready' && modelStatus !== 'error') {
    return (
      <div className="h-screen w-screen bg-[#0f0f1a] flex flex-col items-center justify-center px-6">
        <div className="text-white text-[32px] font-semibold mb-4">
          体态游乐场
        </div>

        <span className="text-[13px] text-[#f59e4b] mb-6 text-center">
          AI 眼镜装配超时，请检查网络后重试
        </span>

        <button
          onClick={handleRetry}
          className="bg-[#f59e4b] text-white rounded-[8px] px-8 py-2.5 text-[15px] font-medium
                     hover:brightness-110 transition-all duration-150"
        >
          重新加载
        </button>

        <p className="text-[11px] text-[#323258] mt-auto pb-8 mt-16">
          如果多次超时，请检查网络连接或关闭代理工具
        </p>
      </div>
    )
  }

  // ────────────────────────────────────────
  // 错误态
  // ────────────────────────────────────────
  if (modelStatus === 'error') {
    return (
      <div className="h-screen w-screen bg-[#0f0f1a] flex flex-col items-center justify-center px-6">
        <div className="text-white text-[32px] font-semibold mb-4">
          体态游乐场
        </div>

        <span className="text-[13px] text-[#ef4444] mb-8 text-center">
          模型加载失败，请检查网络连接后重试
        </span>

        <button
          onClick={handleRetry}
          className="bg-[#f59e4b] text-white rounded-[8px] px-8 py-2.5 text-[15px] font-medium
                     hover:brightness-110 transition-all duration-150"
        >
          重新加载
        </button>

        <p className="text-[11px] text-[#323258] mt-auto pb-8 mt-16">
          所有检测均在本地完成，不上传任何数据
        </p>
      </div>
    )
  }

  // ────────────────────────────────────────
  // 加载态
  // ────────────────────────────────────────
  return (
    <div className="h-screen w-screen bg-[#0f0f1a] flex flex-col items-center justify-center">
      {/* 1. 标题 */}
      <h1 className="text-[32px] font-semibold text-[#ffb478]">
        体态游乐场
      </h1>

      {/* 2. 副标题 */}
      <span className="text-[15px] text-[#323258] mb-8">
        PosturePlay
      </span>

      {/* 3. 进度条 */}
      <div className="w-full max-w-[320px] px-6">
        <ProgressBar
          progress={modelProgress}
          label="AI 眼镜正在装配中..."
        />
      </div>

      {/* 4. 百分比 */}
      <span className="text-[13px] text-[#323258] mt-2">
        {modelProgress}%
      </span>

      {/* 5. 底部隐私声明 */}
      <p className="text-[11px] text-[#323258] mt-auto pb-8">
        所有检测均在本地完成，不上传任何数据
      </p>
    </div>
  )
}
