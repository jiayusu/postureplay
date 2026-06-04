/**
 * 相术体态分析页 — Rutt/Etra 线框浮雕版 (纯 Canvas 2D)
 *
 * 灵感来源：C-Trend Live (yufengzhao.com)
 * 艺术技法：视频帧逐行采样亮度 → 映射为垂直位移 → 线框曲面
 *         亮部隆起，暗部平伏 → 三维浮雕视觉
 *
 * 视觉层级：
 *   1. CameraView 摄像头画面
 *   2. Canvas 2D 特效叠加层 (spine/palm/bone)
 *   3. UI Chrome: 模式切换 + HUD + 运势面板
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCameraSetup } from '@/hooks/useCameraSetup'
import { usePoseDetection } from '@/hooks/usePoseDetection'
import { useEyeDetection } from '@/hooks/useEyeDetection'
import { useHandDetection } from '@/hooks/useHandDetection'
import { usePhysiognomy } from '@/hooks/usePhysiognomy'
import { useCameraStore } from '@/stores/cameraStore'
import { usePostureStore } from '@/stores/postureStore'
import { useEyeStore } from '@/stores/eyeStore'
import { useHandStore } from '@/stores/handStore'
import { useSessionStore } from '@/stores/sessionStore'
import { usePhysiognomyStore } from '@/stores/physiognomyStore'
import CameraView from '@/components/CameraView'
import { SpineTreeOverlay } from '@/components/SpineTreeOverlay'
import { PalmStarsOverlay } from '@/components/PalmStarsOverlay'
import { BoneGlowOverlay } from '@/components/BoneGlowOverlay'
import { EyeNoseOverlay } from '@/components/EyeNoseOverlay'
import { BodySilhouetteOverlay } from '@/components/BodySilhouetteOverlay'
import SimulationOverlay from '@/components/SimulationOverlay'
import { FortuneConstellation } from '@/components/FortuneConstellation'
import type { SimulationConfig } from '@/hooks/useSimulation'
import type { FortuneInterpretation, TreatmentPlan } from '@/types/physiognomy'

/** 视图模式 (本地定义，不再依赖 @/rendering) */
type ViewMode = 'spine' | 'palm' | 'bone' | 'combined'

const MODE_CONFIG: Record<ViewMode, {
  label: string
  icon: string
  color: string
  desc: string
}> = {
  spine: { label: '生命之树', icon: '🌳', color: '#ffd700', desc: '脊柱龙骨·线框浮雕' },
  palm: { label: '掌中星辰', icon: '✋', color: '#4488ff', desc: '掌纹拓印·地形等高' },
  bone: { label: '面相透射', icon: '💀', color: '#c0a060', desc: '骨相光影·大理石雕刻' },
  combined: { label: '三才合一', icon: '☯', color: '#ff66aa', desc: '脊柱·手相·骨相 综合' },
}

export default function PhysiognomyPage() {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('combined')
  const [showFortune, setShowFortune] = useState(false)
  const [showConstellation, setShowConstellation] = useState(false)

  // ── 面相专属仿真配置：弱流体 + 强 RD 斑纹 + 经络线 + 脉轮 ──
  const physioSimConfig = useRef<SimulationConfig>({
    fluidEnabled: true,
    rdIntensity: 1.2,           // 面相模式 RD 加强
    nBodyIntensity: 0.6,        // 星云收敛
    licIntensity: 0.2,          // 流线减弱（面相不需要）
    particleIntensity: 0.5,     // 烟雾适中
    meridianIntensity: 0.8,     // 经络加强
    chakraIntensity: 0.5,       // 脉轮适中
    globalAlpha: 0.5,
  })

  // ---- Camera & Detection Hooks ----
  useCameraSetup(videoRef)
  usePoseDetection(videoRef)
  useEyeDetection(videoRef)

  const analysisCanvasRef = useRef<HTMLCanvasElement>(null)
  useHandDetection({
    videoRef,
    analysisCanvas: analysisCanvasRef.current,
    enabled: true,
  })

  usePhysiognomy(true)

  // ---- Stores ----
  const cameraStatus = useCameraStore(s => s.status)
  const errorMessage = useCameraStore(s => s.errorMessage)
  const startCamera = useCameraStore(s => s.startCamera)

  const modelStatus = usePostureStore(s => s.modelStatus)
  const modelProgress = usePostureStore(s => s.modelProgress)
  const loadModel = usePostureStore(s => s.loadModel)

  const faceModelStatus = useEyeStore(s => s.faceModelStatus)
  const loadFaceModel = useEyeStore(s => s.loadFaceModel)

  const handModelStatus = useHandStore(s => s.handModelStatus)
  const loadHandModel = useHandStore(s => s.loadHandModel)

  const mode = useSessionStore(s => s.mode)
  const isActive = useSessionStore(s => s.isActive)
  const startSession = useSessionStore(s => s.startSession)
  const endSession = useSessionStore(s => s.endSession)

  const spineMetrics = usePhysiognomyStore(s => s.spineMetrics)
  const palmStars = usePhysiognomyStore(s => s.palmStars)
  const boneMetrics = usePhysiognomyStore(s => s.boneMetrics)
  const fortune = usePhysiognomyStore(s => s.fortune)
  const fortuneLoading = usePhysiognomyStore(s => s.fortuneLoading)
  const fortuneError = usePhysiognomyStore(s => s.fortuneError)
  const generateFortune = usePhysiognomyStore(s => s.generateFortune)

  // ---- 自动加载模型 ----
  useEffect(() => {
    if (modelStatus === 'idle') loadModel()
  }, [modelStatus, loadModel])

  useEffect(() => {
    if (faceModelStatus === 'idle') loadFaceModel()
  }, [faceModelStatus, loadFaceModel])

  useEffect(() => {
    if (handModelStatus === 'idle') loadHandModel()
  }, [handModelStatus, loadHandModel])

  // ---- 启动摄像头 + 会话 ----
  useEffect(() => {
    if (cameraStatus === 'idle') startCamera()
    if (!isActive) startSession(mode)
  }, [])

  useEffect(() => {
    const h = () => endSession()
    window.addEventListener('beforeunload', h)
    return () => { endSession(); window.removeEventListener('beforeunload', h) }
  }, [endSession])

  // ---- 运势生成 ----
  const handleGenerateFortune = useCallback(async () => {
    setShowFortune(true)
    setShowConstellation(true)
    await generateFortune()
  }, [generateFortune])

  // ---- 全部模型就绪 ----
  const allModelsReady =
    modelStatus === 'ready' &&
    faceModelStatus === 'ready' &&
    handModelStatus === 'ready'

  return (
    <div className="h-screen w-screen relative overflow-hidden">
      {/* ── 第 1 层：摄像头画面 ── */}
      <div className="absolute inset-0 z-0">
        <CameraView ref={videoRef} mirrored className="w-full h-full object-cover" />
      </div>

      {/* ── 模型加载遮罩 (半透明，摄像头透底) ── */}
      {!allModelsReady && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-[2px] flex flex-col items-center justify-center">
          <div className="w-10 h-10 border-2 border-[#f59e4b] border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-[16px] text-[#f59e4b] font-medium">相术天眼正在开启...</p>
          <div className="mt-3 space-y-1 text-center">
            <p className="text-[12px] text-[#6b6b8a]">
              体态 👁 {modelStatus === 'ready' ? '✅' : modelStatus === 'loading' ? `${modelProgress}%` : '⏳'}
            </p>
            <p className="text-[12px] text-[#6b6b8a]">
              面相 👁 {faceModelStatus === 'ready' ? '✅' : faceModelStatus === 'loading' ? '...' : '⏳'}
            </p>
            <p className="text-[12px] text-[#6b6b8a]">
              手相 👁 {handModelStatus === 'ready' ? '✅' : handModelStatus === 'loading' ? '...' : '⏳'}
            </p>
          </div>
        </div>
      )}

      {/* ── 摄像头状态浮层 (CameraView 已简化为纯 video，状态 UI 在此处理) ── */}
      {cameraStatus === 'idle' && (
        <div className="absolute inset-0 z-[6] flex flex-col items-center justify-center bg-black/80 gap-3">
          <div className="w-[60px] h-[48px] relative">
            <div className="absolute inset-0 rounded-[8px] border-2 border-[#646488]/50" />
            <div className="absolute top-2 left-2 right-2 bottom-2 rounded-[4px] border border-[#646488]/30" />
            <div className="absolute top-[14px] left-1/2 -translate-x-1/2 w-[10px] h-[10px] rounded-full bg-[#646488]/40" />
          </div>
          <span className="text-sm text-[#8888aa]">摄像头未启动</span>
        </div>
      )}

      {cameraStatus === 'requesting' && (
        <div className="absolute inset-0 z-[6] flex flex-col items-center justify-center bg-black/80 gap-4">
          <div className="w-8 h-8 border-2 border-[#f59e4b] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-[#ffb478]">正在打开摄像头...</span>
        </div>
      )}

      {cameraStatus === 'error' && (
        <div className="absolute inset-0 z-[6] flex flex-col items-center justify-center bg-black/80 gap-4 px-4">
          <span className="text-sm text-[#ef4444] text-center">
            {errorMessage || '摄像头访问失败'}
          </span>
          <button
            onClick={startCamera}
            className="px-4 py-2 rounded-full text-sm bg-[#252540] text-[#ffb478] hover:bg-[#323258] transition-colors duration-150"
          >
            重试
          </button>
        </div>
      )}

      {/* ── 摄像头重连 ── */}
      {cameraStatus === 'reconnecting' && (
        <div className="absolute inset-0 z-50 bg-black/80 flex flex-col items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#f59e4b] border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-[15px] text-[#f59e4b]">摄像头重连中...</p>
        </div>
      )}

      {/* 隐藏的分析 Canvas（手部颜色采样用） */}
      <canvas ref={analysisCanvasRef} className="hidden" />

      {/* ── 第 2 层：暗色半透明底衬 + GPU 气场仿真 ── */}
      <div className="absolute inset-0 z-[1] bg-black/35 pointer-events-none" />

      {/* ── GPU 气场仿真层 (面相定制配置) ── */}
      {allModelsReady && (
        <div className="absolute inset-0 z-[2] pointer-events-none">
          <SimulationOverlay className="w-full h-full" config={physioSimConfig.current} />
        </div>
      )}

      {/* ── 第 3 层：Canvas 2D Rutt/Etra 线框浮雕 + 眼鼻 + 人像 ── */}
      {allModelsReady && (
        <>
          {/* 人体能量体剪影 (依赖 pose keypoints，z-[3]) */}
          <BodySilhouetteOverlay videoRef={videoRef} />
          {/* 眼鼻特效：Eye Roller 风格 (依赖 faceLandmarks，z-[5]) */}
          <EyeNoseOverlay videoRef={videoRef} />
          {(viewMode === 'spine' || viewMode === 'combined') && <SpineTreeOverlay />}
          {(viewMode === 'palm' || viewMode === 'combined') && <PalmStarsOverlay />}
          {(viewMode === 'bone' || viewMode === 'combined') && <BoneGlowOverlay />}
        </>
      )}

      {/* ── 第 3 层：顶部模式切换 ── */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
        <div className="flex gap-1.5 bg-[#1a1a2e]/85 backdrop-blur-md rounded-full p-1 border border-[#ffffff]/10">
          {(Object.keys(MODE_CONFIG) as ViewMode[]).map(key => {
            const cfg = MODE_CONFIG[key]
            const active = viewMode === key
            return (
              <button
                key={key}
                onClick={() => setViewMode(key)}
                className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all duration-200 whitespace-nowrap ${
                  active
                    ? 'bg-white/10 text-white shadow-inner'
                    : 'text-[#8888aa] hover:text-white/70'
                }`}
                style={active ? { color: cfg.color } : undefined}
              >
                {cfg.icon} {cfg.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── 第 4 层：底部状态栏 ── */}
      <div className="absolute bottom-4 left-4 right-4 z-10">
        <div className="flex items-end justify-between">
          {/* 左侧 HUD */}
          <div className="space-y-2">
            {spineMetrics && (
              <StatusChip
                label="龙骨"
                value={spineMetrics.overallScore}
                color={spineMetrics.overallScore >= 80 ? '#44ff44' : spineMetrics.overallScore >= 50 ? '#ffaa44' : '#ff4444'}
                unit="分"
              />
            )}
            {palmStars && (
              <StatusChip
                label="元气"
                value={palmStars.vitalityScore}
                color={palmStars.vitalityScore >= 75 ? '#44ff44' : palmStars.vitalityScore >= 45 ? '#ffaa44' : '#ff4444'}
                unit="分"
              />
            )}
            {boneMetrics && (
              <StatusChip
                label="骨相"
                value={boneMetrics.overallScore}
                color={boneMetrics.overallScore >= 80 ? '#44ff44' : boneMetrics.overallScore >= 55 ? '#ffaa44' : '#ff4444'}
                unit="分"
              />
            )}
          </div>

          {/* 右侧按钮组 */}
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/mirror')}
              className="px-4 py-2 rounded-full text-[13px] bg-[#1a1a2e]/80 border border-white/20
                         text-white/60 hover:text-white hover:border-white/40 transition-all"
            >
              返回镜像
            </button>
            <button
              onClick={handleGenerateFortune}
              disabled={!allModelsReady || fortuneLoading}
              className="px-5 py-2 rounded-full text-[13px] font-medium
                         bg-gradient-to-r from-[#d4a745] to-[#f59e4b]
                         text-[#0f0f1a] hover:brightness-110 transition-all
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {fortuneLoading ? '⏳ 天机演算中...' : '☯ 解读运势'}
            </button>
          </div>
        </div>
      </div>

      {/* ── 运势解读弹窗 ── */}
      {showFortune && (
        fortuneLoading ? (
          <>
            {showConstellation && <FortuneConstellation />}
            <FortuneLoadingModal onClose={() => { setShowFortune(false); setShowConstellation(false) }} />
          </>
        ) : fortune ? (
          <>
            <FortuneModal
              fortune={fortune}
              onClose={() => { setShowFortune(false); setShowConstellation(false) }}
            />
          </>
        ) : (
          <FortuneErrorModal
            error={fortuneError ?? '运势生成失败'}
            onClose={() => { setShowFortune(false); setShowConstellation(false) }}
          />
        )
      )}
    </div>
  )
}

/** 状态标签 */
function StatusChip({
  label,
  value,
  color,
  unit,
}: {
  label: string
  value: number
  color: string
  unit: string
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full
                    bg-[#1a1a2e]/75 backdrop-blur-sm border border-white/5">
      <span className="text-[11px] text-[#8888aa]">{label}</span>
      <span className="text-[14px] font-bold" style={{ color }}>
        {Math.round(value)}
      </span>
      <span className="text-[10px] text-[#666688]">{unit}</span>
    </div>
  )
}

/** 运势弹窗 */
function FortuneModal({
  fortune,
  onClose,
}: {
  fortune: FortuneInterpretation
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a14]/95 backdrop-blur-sm"
         onClick={onClose}>
      <div
        className="w-[92%] max-w-[420px] max-h-[85vh] overflow-y-auto
                    bg-[#14142a] border border-[#323258]/50 rounded-2xl
                    shadow-2xl p-5"
        onClick={e => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="text-center mb-4">
          <div className="text-[28px] mb-1">☯️</div>
          <h2 className="text-[18px] font-bold text-[#ffd700]">运势解读</h2>
          <p className="text-[11px] text-[#8888aa]">
            {new Date(fortune.generatedAt).toLocaleTimeString('zh-CN')} · 综合 {fortune.overall.score} 分
          </p>
        </div>

        <FortuneSection title="🌳 生命之树 · 脊柱" data={fortune.spine} />
        <FortuneSection title="✋ 掌中星辰 · 手相" data={fortune.palm} />
        <FortuneSection title="💀 面相透射 · 骨相" data={fortune.bone} />

        <div className="mt-4 p-3 rounded-xl bg-gradient-to-br from-[#ffd700]/10 to-[#ff66aa]/10
                        border border-[#ffd700]/20">
          <h3 className="text-[14px] font-bold text-[#ffd700] mb-2">✨ 综合运势</h3>
          <p className="text-[13px] text-[#ccccee] leading-relaxed">
            {fortune.overall.summary}
          </p>
          <div className="flex gap-4 mt-3">
            <span className="text-[12px] text-[#8888aa]">
              幸运元素：<span className="text-[#ffaa44]">{fortune.overall.luckyElement}</span>
            </span>
            <span className="text-[12px] text-[#8888aa]">
              幸运色：<span className="text-[#ff6699]">{fortune.overall.luckyColor}</span>
            </span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full py-2.5 rounded-xl text-[13px] text-[#8888aa]
                     border border-[#323258]/30 hover:text-white hover:border-white/30 transition-all"
        >
          关闭
        </button>
      </div>
    </div>
  )
}

function FortuneSection({
  title,
  data,
}: {
  title: string
  data: { summary: string; detail: string; advice: string; treatmentPlan: TreatmentPlan }
}) {
  const [showPlan, setShowPlan] = useState(false)
  const plan = data.treatmentPlan
  const hasPlan = plan && (plan.daily.length > 0 || plan.weekly.length > 0 || plan.tools.length > 0 || plan.medical)

  return (
    <div className="mb-3 rounded-xl bg-[#1a1a2e]/60 border border-white/5 overflow-hidden">
      {/* 运势摘要（始终可见） */}
      <div className="p-3">
        <h3 className="text-[14px] font-bold text-white/90 mb-1.5">{title}</h3>
        <p className="text-[16px] font-bold text-[#ffd700] mb-1">{data.summary}</p>
        <p className="text-[12px] text-[#a0a0c0] leading-relaxed mb-1.5">{data.detail}</p>
        <p className="text-[11px] text-[#f59e4b] leading-relaxed">💡 {data.advice}</p>
      </div>

      {/* 治疗方案（可折叠） */}
      {hasPlan && (
        <>
          <button
            onClick={() => setShowPlan(!showPlan)}
            className="w-full flex items-center justify-between px-3 py-2
                       border-t border-white/5 text-[11px] text-[#8888aa]
                       hover:text-[#ffd700] hover:bg-white/[0.02] transition-all"
          >
            <span>📋 个性化治疗方案</span>
            <span className="text-[10px] transition-transform duration-300"
                  style={{ transform: showPlan ? 'rotate(180deg)' : 'rotate(0deg)' }}>
              ▼
            </span>
          </button>

          {showPlan && (
            <div className="px-3 pb-3 space-y-2 animate-[fadeIn_0.3s_ease-out]">
              {/* 第一层：生活微调 */}
              {plan.daily.length > 0 && (
                <TreatmentTier
                  icon="🍵"
                  label="今日可做"
                  color="#66cc88"
                  items={plan.daily}
                />
              )}

              {/* 第二层：主动干预 */}
              {plan.weekly.length > 0 && (
                <TreatmentTier
                  icon="🧘"
                  label="本周养成"
                  color="#66aaff"
                  items={plan.weekly}
                />
              )}

              {/* 第三层：外部辅助 */}
              {plan.tools.length > 0 && (
                <TreatmentTier
                  icon="🔧"
                  label="试试这些"
                  color="#ffaa44"
                  items={plan.tools}
                />
              )}

              {/* 第四层：专业对接 */}
              {plan.medical && (
                <div className="flex items-start gap-2 p-2 rounded-lg bg-[#ff4444]/10 border border-[#ff4444]/20">
                  <span className="text-[14px] mt-0.5">🏥</span>
                  <div>
                    <span className="text-[10px] font-medium text-[#ff6644]">何时就医</span>
                    <p className="text-[11px] text-[#ddaaaa] leading-relaxed mt-0.5">{plan.medical}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** 治疗方案单层卡片 */
function TreatmentTier({
  icon,
  label,
  color,
  items,
}: {
  icon: string
  label: string
  color: string
  items: string[]
}) {
  return (
    <div className="flex items-start gap-2 p-2 rounded-lg bg-white/[0.03]">
      <span className="text-[14px] mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <span className="text-[10px] font-medium" style={{ color }}>{label}</span>
        <ul className="mt-1 space-y-1">
          {items.map((item, i) => (
            <li key={i} className="text-[11px] text-[#8888aa] leading-relaxed flex gap-1.5">
              <span className="text-[8px] mt-1" style={{ color }}>●</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** 运势加载中弹窗 */
function FortuneLoadingModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a14]/95 backdrop-blur-sm"
         onClick={onClose}>
      <div
        className="w-[92%] max-w-[380px] bg-[#14142a] border border-[#323258]/50 rounded-2xl
                    shadow-2xl p-8 text-center"
        onClick={e => e.stopPropagation()}
      >
        <div className="text-[48px] mb-4 animate-bounce">☯️</div>
        <h2 className="text-[18px] font-bold text-[#ffd700] mb-2">天机演算中...</h2>
        <p className="text-[13px] text-[#8888aa] leading-relaxed">
          AI 相术大师正在参悟你的<br />脊柱·掌纹·骨相
        </p>
        <div className="mt-4 flex justify-center gap-1.5">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-[#ffd700]"
              style={{ animation: `pulse 1.2s ${i * 0.2}s infinite` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/** 运势生成失败弹窗 */
function FortuneErrorModal({ error, onClose }: { error: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a14]/95 backdrop-blur-sm"
         onClick={onClose}>
      <div
        className="w-[92%] max-w-[380px] bg-[#14142a] border border-[#323258]/50 rounded-2xl
                    shadow-2xl p-8 text-center"
        onClick={e => e.stopPropagation()}
      >
        <div className="text-[36px] mb-3">🌧️</div>
        <h2 className="text-[16px] font-bold text-[#ff6644] mb-2">天机不可泄露</h2>
        <p className="text-[12px] text-[#8888aa] mb-4">{error}</p>
        <button
          onClick={onClose}
          className="px-6 py-2 rounded-full text-[13px] bg-[#323258]/50 text-white
                     hover:bg-[#323258] transition-colors"
        >
          关闭
        </button>
      </div>
    </div>
  )
}
