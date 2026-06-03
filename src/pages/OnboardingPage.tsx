// ============================================================
// 体态游乐场 PosturePlay — OnboardingPage
//
// 3 步引导轮播页：介绍「尾巴」概念 → 隐私说明 → 准备校准。
// 最后一步点击「开始校准」时启动摄像头并跳转校准页。
// ============================================================

import { useNavigate } from 'react-router-dom'
import { useUIStore } from '@/stores/uiStore'
import { useCameraStore } from '@/stores/cameraStore'

// ---- 步骤数据 ----

interface OnboardingStep {
  icon: string
  title: string
  desc: string
}

const steps: OnboardingStep[] = [
  {
    icon: '\u2726', // ✦
    title: '看见你的尾巴',
    desc: '你的体态，藏着一根看不见的尾巴。\n它会在你紧张时僵直，在你放松时轻摆。',
  },
  {
    icon: '\u25C8', // ◈
    title: '魔法时刻',
    desc: '开启摄像头，让我们看见你的身体语言。\n所有数据仅在本地处理，隐私安全。',
  },
  {
    icon: '\u2605', // ★
    title: '每日运势',
    desc: '每天结束时，你的尾巴会告诉你的运势。\n坚持下去，好姿势带来好运气。',
  },
]

export default function OnboardingPage() {
  const navigate = useNavigate()

  const onboardingStep = useUIStore((s) => s.onboardingStep)
  const nextOnboardingStep = useUIStore((s) => s.nextOnboardingStep)
  const prevOnboardingStep = useUIStore((s) => s.prevOnboardingStep)

  const startCamera = useCameraStore((s) => s.startCamera)

  // ---- 按钮逻辑 ----
  const handleMainButton = async () => {
    if (onboardingStep < 2) {
      nextOnboardingStep()
    } else {
      // Step 2 (最后一步): 启动摄像头并跳转校准
      try {
        await startCamera()
        navigate('/calibration')
      } catch {
        // startCamera 内部已处理错误，静默
      }
    }
  }

  const handleSkip = () => {
    navigate('/mirror')
  }

  const step = steps[onboardingStep]

  return (
    <div className="h-screen w-screen bg-[#0f0f1a] flex flex-col items-center justify-center relative">
      {/* 返回按钮（仅在非第一步显示） */}
      {onboardingStep > 0 && (
        <button
          onClick={prevOnboardingStep}
          className="absolute top-4 left-4 text-[#323258] hover:text-white transition-colors text-[15px]"
        >
          {'\u2190'} 返回
        </button>
      )}

      {/* 图标 */}
      <div
        className="w-[80px] h-[80px] rounded-full border border-[#ffb478]/20
                   flex items-center justify-center text-[48px] text-[#ffb478]/30 mb-8"
      >
        {step.icon}
      </div>

      {/* 标题 */}
      <h2 className="text-[24px] font-semibold text-white mb-3">
        {step.title}
      </h2>

      {/* 描述 */}
      <p className="text-[15px] text-[#323258] text-center max-w-[280px] leading-relaxed whitespace-pre-line">
        {step.desc}
      </p>

      {/* 步骤圆点 */}
      <div className="flex items-center gap-2 my-8">
        {steps.map((_, i) => (
          <div
            key={i}
            className={`w-[8px] h-[8px] rounded-full transition-colors duration-200 ${
              i === onboardingStep ? 'bg-[#f59e4b]' : 'bg-[#252540]'
            }`}
          />
        ))}
      </div>

      {/* 底部区域 */}
      <div className="mt-auto pb-12 flex flex-col items-center">
        {/* 主按钮 */}
        <button
          onClick={handleMainButton}
          className="bg-[#f59e4b] text-white rounded-[8px] px-8 py-3 text-[15px] font-medium
                     hover:brightness-110 transition-all duration-150"
        >
          {onboardingStep === 2 ? '开始校准' : '下一步'}
        </button>

        {/* 跳过链接 */}
        <span
          onClick={handleSkip}
          className="text-[11px] text-[#323258] mt-4 cursor-pointer hover:text-[#ffb478] transition-colors"
        >
          跳过，直接开始
        </span>
      </div>
    </div>
  )
}
