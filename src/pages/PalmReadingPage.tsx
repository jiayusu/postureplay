// ============================================================
// 体态游乐场 PosturePlay — 手相健康分析页面
//
// 用户将手掌对准摄像头，系统分析手部健康指标：
// - 手指长度分析（2D:4D 比值）
// - 手掌颜色与红润度
// - 手部震颤检测
// - 指关节灵活性
// - 掌纹线分析
//
// 注意：本页面是一个完整的演示页面。实际部署时，
// 通过 useHandDetection hook 驱动 MediaPipe HandLandmarker
// 进行实时手部关键点检测。当前使用模拟数据展示 UI 效果。
// ============================================================

import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

// ── 分析阶段 ──

type AnalysisPhase =
  | 'init'           // 等待模型加载
  | 'scanning'       // 正在扫描手部
  | 'analyzing'     // 正在分析
  | 'results'        // 显示结果
  | 'error'          // 错误状态

// ── 页面组件 ──

export default function PalmReadingPage() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<AnalysisPhase>('init')
  const scanTimerRef = useRef<ReturnType<typeof setInterval>>()
  const [loadingProgress, setLoadingProgress] = useState(0)

  // 演示状态序列
  useEffect(() => {
    // 模拟模型加载
    const p1 = setTimeout(() => setLoadingProgress(30), 300)
    const p2 = setTimeout(() => setLoadingProgress(60), 600)
    const p3 = setTimeout(() => setLoadingProgress(90), 900)
    const p4 = setTimeout(() => {
      setLoadingProgress(100)
      setPhase('scanning')
    }, 1500)

    // 模拟扫描 → 分析
    const p5 = setTimeout(() => setPhase('analyzing'), 5000)
    const p6 = setTimeout(() => setPhase('results'), 7500)

    return () => {
      clearTimeout(p1); clearTimeout(p2); clearTimeout(p3)
      clearTimeout(p4); clearTimeout(p5); clearTimeout(p6)
    }
  }, [])

  // ── 清理 ──

  const handleRetry = useCallback(() => {
    setPhase('init')
    setLoadingProgress(0)
    if (scanTimerRef.current) clearInterval(scanTimerRef.current)
    // 重新开始动画
    const p1 = setTimeout(() => setLoadingProgress(30), 300)
    const p2 = setTimeout(() => setLoadingProgress(60), 600)
    const p3 = setTimeout(() => setLoadingProgress(90), 900)
    const p4 = setTimeout(() => {
      setLoadingProgress(100)
      setPhase('scanning')
    }, 1500)
    const p5 = setTimeout(() => setPhase('analyzing'), 5000)
    const p6 = setTimeout(() => setPhase('results'), 7500)
    return () => {
      clearTimeout(p1); clearTimeout(p2); clearTimeout(p3)
      clearTimeout(p4); clearTimeout(p5); clearTimeout(p6)
    }
  }, [])

  const handleBack = useCallback(() => {
    if (scanTimerRef.current) clearInterval(scanTimerRef.current)
    navigate('/mirror')
  }, [navigate])

  // ── 渲染 ──

  return (
    <div className="w-full h-full flex flex-col bg-[#0f0f1a] relative overflow-hidden">

      {/* 顶部导航栏 */}
      <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-5 pt-6 pb-3">
        <button
          onClick={handleBack}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-[#1a1a2e]/70 backdrop-blur-sm border border-[#2a2a4a] text-white/70 hover:text-white hover:border-[#f59e4b]/50 transition-colors"
          aria-label="返回"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 4L6 10L12 16" />
          </svg>
        </button>

        <h1 className="text-white/90 text-lg font-semibold tracking-wide">
          手相健康
        </h1>

        <div className="w-10 h-10" />
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col items-center justify-center px-5">

        {/* 阶段：初始化 */}
        {phase === 'init' && (
          <div className="flex flex-col items-center gap-6 animate-fade-in">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#f59e4b]/20 to-[#f97316]/20 flex items-center justify-center border border-[#f59e4b]/20">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#f59e4b" strokeWidth="1.5">
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            </div>
            <p className="text-white/60 text-sm">正在初始化手部检测模型...</p>
            <div className="w-48 h-1.5 bg-[#1a1a2e] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#f59e4b] to-[#f97316] rounded-full transition-all duration-500"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
            <p className="text-white/30 text-xs mt-2">首次加载需要下载约 5MB 模型文件</p>
          </div>
        )}

        {/* 阶段：扫描中 */}
        {phase === 'scanning' && (
          <div className="relative w-full max-w-md aspect-[4/3] rounded-2xl overflow-hidden border border-[#2a2a4a] bg-[#0a0a14]">
            {/* 摄像头该占位区（实际项目中此处为 CameraView 组件） */}
            <div className="w-full h-full bg-gradient-to-b from-[#0f0f1a] to-[#1a1a2e] flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-[#1a1a2e]/50 border border-[#f59e4b]/20 flex items-center justify-center">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f59e4b/50" strokeWidth="1.5">
                    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z" />
                    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                    <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="2" />
                    <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="2" />
                  </svg>
                </div>
                <p className="text-white/30 text-xs">摄像头预览区域</p>
              </div>
            </div>

            {/* 扫描提示 */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-[#1a1a2e]/80 backdrop-blur-sm border border-[#f59e4b]/30">
              <p className="text-[#f59e4b] text-sm flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#f59e4b] animate-pulse" />
                请将手掌对准摄像头
              </p>
            </div>

            {/* 引导框 */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-1/4 left-1/4 right-1/4 bottom-1/4 border-2 border-dashed border-[#f59e4b]/20 rounded-2xl" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-28 border border-[#f59e4b]/10 rounded-full" />
            </div>
          </div>
        )}

        {/* 阶段：分析中 */}
        {phase === 'analyzing' && (
          <div className="flex flex-col items-center gap-6 animate-fade-in">
            <div className="w-20 h-20 relative">
              <div className="absolute inset-0 rounded-full border-2 border-[#f59e4b]/20" />
              <div className="absolute inset-0 rounded-full border-2 border-t-[#f59e4b] animate-spin" />
            </div>
            <p className="text-white/80 text-base">正在分析手部健康数据...</p>
            <div className="flex flex-col gap-1.5 w-56">
              <div className="flex items-center gap-2 text-white/50 text-xs">
                <div className="w-3 h-3 rounded-full bg-[#22c55e]/60" />
                手指长度分析
              </div>
              <div className="flex items-center gap-2 text-white/50 text-xs">
                <div className="w-3 h-3 rounded-full bg-[#f59e4b]/60" />
                手掌颜色检测
              </div>
              <div className="flex items-center gap-2 text-white/30 text-xs">
                <div className="w-3 h-3 rounded-full bg-[#3b3b5a]" />
                震颤分析
              </div>
              <div className="flex items-center gap-2 text-white/30 text-xs">
                <div className="w-3 h-3 rounded-full bg-[#3b3b5a]" />
                掌纹特征提取
              </div>
            </div>
          </div>
        )}

        {/* 阶段：结果展示 */}
        {phase === 'results' && (
          <HandHealthResults onRetry={handleRetry} onBack={handleBack} />
        )}

        {/* 阶段：错误 */}
        {phase === 'error' && (
          <div className="flex flex-col items-center gap-6 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-[#ef4444]/10 border border-[#ef4444]/30 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <p className="text-white/70 text-sm">摄像头访问失败</p>
            <p className="text-white/40 text-xs">请检查摄像头权限后重试</p>
            <button
              onClick={handleRetry}
              className="px-6 py-2.5 rounded-full bg-[#f59e4b]/10 border border-[#f59e4b]/40 text-[#f59e4b] text-sm hover:bg-[#f59e4b]/20 transition-colors"
            >
              重新尝试
            </button>
          </div>
        )}
      </div>

      {/* 隐藏的分析 Canvas（实际部署时用于颜色/掌纹分析，render 到隐藏 DOM） */}
      <canvas
        className="hidden"
        width={640}
        height={480}
        aria-hidden="true"
      />
    </div>
  )
}

// ============================================================
// 子组件：手部健康结果卡片
// ============================================================

function HandHealthResults({
  onRetry,
  onBack,
}: {
  onRetry: () => void
  onBack: () => void
}) {
  return (
    <div className="w-full max-w-md flex flex-col gap-5 animate-fade-in px-2">
      {/* 综合评分 */}
      <div className="rounded-2xl bg-[#1a1a2e]/80 backdrop-blur-sm border border-[#2a2a4a] p-6 text-center">
        <p className="text-white/50 text-xs uppercase tracking-widest mb-2">
          手部健康评分
        </p>
        <div className="relative inline-flex items-center justify-center mb-3">
          <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="#2a2a4a" strokeWidth="6" />
            <circle
              cx="50" cy="50" r="42"
              fill="none"
              stroke="#f59e4b"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={264}
              strokeDashoffset={154}
            />
          </svg>
          <span className="absolute text-2xl font-bold text-[#f59e4b]">78</span>
        </div>
        <p className="text-white/60 text-sm">双手健康整体正常，有轻微改善空间</p>
      </div>

      {/* 详细指标 */}
      <div className="space-y-3">
        {/* 手指长度分析 */}
        <div className="rounded-xl bg-[#1a1a2e]/60 border border-[#2a2a4a]/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#22c55e]" />
              <span className="text-white/80 text-sm font-medium">手指长度比 (2D:4D)</span>
            </div>
            <span className="text-[#22c55e] text-xs">正常</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex justify-between text-xs text-white/40 mb-1">
                <span>2D (食指)</span>
                <span>4D (无名指)</span>
              </div>
              <div className="h-2 bg-[#1a1a3e] rounded-full overflow-hidden flex">
                <div className="h-full bg-[#60a5fa] rounded-full" style={{ width: '48%' }} />
                <div className="h-full bg-[#f97316] rounded-full" style={{ width: '52%' }} />
              </div>
            </div>
            <span className="text-white/60 text-sm font-mono">0.98</span>
          </div>
        </div>

        {/* 手掌颜色 */}
        <div className="rounded-xl bg-[#1a1a2e]/60 border border-[#2a2a4a]/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#f59e4b]" />
              <span className="text-white/80 text-sm font-medium">手掌颜色</span>
            </div>
            <span className="text-[#f59e4b] text-xs">红润度正常</span>
          </div>
          <div className="flex gap-2">
            {['#e8b4b8', '#e4c4b0', '#d4b8a8'].map((color, i) => (
              <div
                key={i}
                className="flex-1 h-8 rounded-lg"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        {/* 手部震颤 */}
        <div className="rounded-xl bg-[#1a1a2e]/60 border border-[#2a2a4a]/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#22c55e]" />
              <span className="text-white/80 text-sm font-medium">手部震颤</span>
            </div>
            <span className="text-[#22c55e] text-xs">生理性正常</span>
          </div>
          <div className="flex items-end gap-0.5 h-10">
            {Array.from({ length: 30 }, (_, i) => {
              const h = Math.sin(i * 0.3) * 15 + 50
              return (
                <div
                  key={i}
                  className="flex-1 rounded-sm bg-[#60a5fa]/40"
                  style={{ height: `${h}%` }}
                />
              )
            })}
          </div>
        </div>

        {/* 掌纹线分析 */}
        <div className="rounded-xl bg-[#1a1a2e]/60 border border-[#2a2a4a]/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#a78bfa]" />
              <span className="text-white/80 text-sm font-medium">掌纹线检测</span>
            </div>
            <span className="text-[#a78bfa] text-xs">3/4 已检测</span>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-white/50">生命线</span>
              <span className="text-[#22c55e]">清晰 ✓</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/50">感情线</span>
              <span className="text-[#22c55e]">清晰 ✓</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/50">智慧线</span>
              <span className="text-[#f59e4b]">一般 ~</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/50">命运线</span>
              <span className="text-white/30">未检测 —</span>
            </div>
          </div>
        </div>

        {/* 健康建议 */}
        <div className="rounded-xl bg-[#1a1a2e]/60 border border-[#f59e4b]/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="#f59e4b">
              <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 14a6 6 0 110-12 6 6 0 010 12zm0-9a1 1 0 011 1v3a1 1 0 11-2 0V8a1 1 0 011-1zm0 7a1 1 0 100-2 1 1 0 000 2z" />
            </svg>
            <span className="text-white/80 text-sm font-medium">健康建议</span>
          </div>
          <ul className="space-y-1.5 text-xs text-white/50">
            <li className="flex items-start gap-1.5">
              <span className="text-[#f59e4b] mt-0.5">•</span>
              手部颜色正常，血液循环良好
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-[#f59e4b] mt-0.5">•</span>
              震颤在正常生理范围内，神经系统健康
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-[#f59e4b] mt-0.5">•</span>
              建议定期活动手指关节，保持灵活性
            </li>
          </ul>
        </div>
      </div>

      {/* 底部按钮 */}
      <div className="flex gap-3 mt-2">
        <button
          onClick={onRetry}
          className="flex-1 py-3 rounded-xl bg-[#1a1a2e] border border-[#2a2a4a] text-white/70 text-sm hover:bg-[#2a2a3e] transition-colors"
        >
          重新检测
        </button>
        <button
          onClick={onBack}
          className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#f59e4b]/20 to-[#f97316]/20 border border-[#f59e4b]/30 text-[#f59e4b] text-sm font-medium hover:from-[#f59e4b]/30 hover:to-[#f97316]/30 transition-colors"
        >
          返回主页
        </button>
      </div>

      {/* 免责声明 */}
      <p className="text-center text-white/20 text-[10px] px-4">
        ⚠ 本功能仅供娱乐和健康参考，不构成医疗诊断。
        如有健康疑虑，请咨询专业医生。
      </p>
    </div>
  )
}
