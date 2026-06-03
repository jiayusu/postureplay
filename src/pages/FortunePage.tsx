// ============================================================
// 体态游乐场 PosturePlay — FortunePage
//
// 每日运势展示页：
//   - 缓存优先加载今日运势
//   - 无数据时显示预览 / 占位
//   - 综合评分、亮点、运势文案、趋势指示
// ============================================================

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFortuneStore } from '@/stores/fortuneStore'
import type { DailyFortune } from '@/types'

// ---- 评分颜色 ----
function getScoreColor(score: number): string {
  if (score >= 70) return '#4ade80'
  if (score >= 40) return '#f59e4b'
  return '#c084fc'
}

// ---- 趋势指示 ----
function getTrendIndicator(trend: DailyFortune['trend']): { char: string; color: string } {
  switch (trend) {
    case 'up':
      return { char: '\u2191', color: '#4ade80' }
    case 'down':
      return { char: '\u2193', color: '#c084fc' }
    case 'stable':
      return { char: '\u2192', color: '#6b7280' }
  }
}

export default function FortunePage() {
  const navigate = useNavigate()

  const todayFortune = useFortuneStore((s) => s.todayFortune)
  const isGenerating = useFortuneStore((s) => s.isGenerating)
  const loadToday = useFortuneStore((s) => s.loadToday)

  // ---- mount: 加载今日运势 ----
  useEffect(() => {
    loadToday()
  }, [loadToday])

  // ---- 生成中骨架屏 ----
  if (isGenerating) {
    return (
      <div className="h-screen w-screen bg-[#0f0f1a] flex flex-col items-center justify-center">
        <div className="bg-[#1a1a2e] rounded-[16px] p-6 max-w-[380px] w-[90%] border border-white/5">
          <div className="animate-pulse space-y-4">
            <div className="h-[13px] bg-[#252540] rounded w-1/3" />
            <div className="flex justify-center">
              <div className="w-[80px] h-[80px] rounded-full bg-[#252540]" />
            </div>
            <div className="h-[18px] bg-[#252540] rounded w-2/3 mx-auto" />
            <div className="h-[13px] bg-[#252540] rounded w-full" />
            <div className="h-[13px] bg-[#252540] rounded w-4/5" />
          </div>
        </div>

        <div className="mt-auto pb-8">
          <button
            onClick={() => navigate('/mirror')}
            className="bg-[#f59e4b] text-white rounded-[8px] px-8 py-2.5 text-[15px] font-medium
                       hover:brightness-110 transition-all duration-150"
          >
            返回镜像
          </button>
        </div>
      </div>
    )
  }

  // ---- 无数据（预览态） ----
  if (!todayFortune) {
    return (
      <div className="h-screen w-screen bg-[#0f0f1a] flex flex-col items-center justify-center">
        <div className="bg-[#1a1a2e] rounded-[16px] p-6 max-w-[380px] w-[90%] border border-white/5 text-center">
          {/* 日期 */}
          <span className="text-[13px] text-[#323258] mb-4 block">
            {new Date().toLocaleDateString('zh-CN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </span>

          {/* 占位评分 */}
          <div className="flex justify-center mb-4">
            <div
              className="w-[80px] h-[80px] rounded-full border-2 border-[#252540]
                         flex items-center justify-center"
            >
              <span className="text-[48px] font-light text-[#323258]">?</span>
            </div>
          </div>

          {/* 文案 */}
          <p className="text-[18px] text-white font-semibold mt-4">
            明天这个时候
          </p>
          <p className="text-[15px] text-[#323258] leading-relaxed mt-3 whitespace-pre-line">
            你的尾巴就能说话了...
          </p>

          {/* 建议 */}
          <p className="text-[13px] text-[#323258] mt-4">
            明天开始追踪你的体态变化
          </p>
        </div>

        <div className="mt-auto pb-8 flex flex-col items-center">
          <button
            onClick={() => navigate('/mirror')}
            className="bg-[#f59e4b] text-white rounded-[8px] px-8 py-2.5 text-[15px] font-medium
                       hover:brightness-110 transition-all duration-150"
          >
            返回镜像
          </button>
        </div>
      </div>
    )
  }

  // ---- 运势数据态 ----
  const scoreColor = getScoreColor(todayFortune.postureScore)
  const trend = getTrendIndicator(todayFortune.trend)

  return (
    <div className="h-screen w-screen bg-[#0f0f1a] flex flex-col items-center justify-center">
      {/* 运势卡片 */}
      <div className="bg-[#1a1a2e] rounded-[16px] p-6 max-w-[380px] w-[90%] border border-white/5 text-center">
        {/* 日期 */}
        <span className="text-[13px] text-[#323258] mb-4 block">
          {todayFortune.date}
        </span>

        {/* 评分圆环 */}
        <div className="flex justify-center mb-4">
          <div
            className="w-[80px] h-[80px] rounded-full border-2 flex items-center justify-center"
            style={{ borderColor: scoreColor }}
          >
            <span
              className="text-[48px] font-light"
              style={{ color: scoreColor }}
            >
              {todayFortune.postureScore}
            </span>
          </div>
        </div>

        {/* 亮点 */}
        <p className="text-[18px] text-white font-semibold mt-4">
          {todayFortune.highlight}
        </p>

        {/* 运势正文 */}
        <p className="text-[15px] text-[#323258] leading-relaxed mt-3 whitespace-pre-line">
          {todayFortune.fortuneText}
        </p>

        {/* 趋势指示 */}
        <div className="flex items-center justify-center gap-1 mt-3">
          <span
            className="text-[18px]"
            style={{ color: trend.color }}
          >
            {trend.char}
          </span>
          <span
            className="text-[13px]"
            style={{ color: trend.color }}
          >
            {todayFortune.trend === 'up'
              ? '运势上升'
              : todayFortune.trend === 'down'
                ? '需要加油'
                : '趋于平稳'}
          </span>
        </div>

        {/* 建议 */}
        {todayFortune.tip && (
          <p className="text-[13px] text-[#323258] mt-4 border-t border-white/5 pt-4">
            {todayFortune.tip}
          </p>
        )}
      </div>

      {/* 底部按钮 */}
      <div className="mt-auto pb-8 flex flex-col items-center">
        <button
          onClick={() => navigate('/mirror')}
          className="bg-[#f59e4b] text-white rounded-[8px] px-8 py-2.5 text-[15px] font-medium
                     hover:brightness-110 transition-all duration-150"
        >
          返回镜像
        </button>

        <span className="text-[13px] text-[#323258] hover:text-[#ffb478] mt-3 cursor-pointer transition-colors">
          运势说明
        </span>
      </div>
    </div>
  )
}
