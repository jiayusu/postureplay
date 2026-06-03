import React from 'react';
import { usePostureStore } from '@/stores';
import { useEyeStore } from '@/stores/eyeStore';

interface EmotionConfig {
  label: string;
  color: string;
  emoji: string;
}

const emotionMap: Record<string, EmotionConfig> = {
  ten: { label: '绷紧', color: '#c084fc', emoji: '⚡' },
  relaxed: { label: '松弛', color: '#4ade80', emoji: '🌿' },
  fatigued: { label: '倦怠', color: '#9ca3af', emoji: '😴' },
  focused: { label: '专注', color: '#fbbf24', emoji: '🎯' },
  unknown: { label: '?', color: '#6b7280', emoji: '?' },
};

/** 眼疲劳等级样式 */
function getEyeFatigueStyle(score: number): { color: string; label: string } {
  if (score > 75) return { color: '#ef4444', label: '极度疲劳' }
  if (score > 50) return { color: '#f59e4b', label: '较疲劳' }
  if (score > 25) return { color: '#fbbf24', label: '轻度疲劳' }
  return { color: '#4ade80', label: '眼睛舒适' }
}

const EmotionHUD: React.FC = () => {
  const postureMetrics = usePostureStore((s) => s.metrics)
  const eyeMetrics = useEyeStore((s) => s.eyeMetrics)

  const emotionalState = postureMetrics?.emotionalState ?? 'unknown'
  const rawConfidence = postureMetrics?.confidence
  const confidencePercent =
    rawConfidence != null ? Math.round(rawConfidence * 100) : null

  const emotion = emotionMap[emotionalState] ?? emotionMap.unknown
  const hasPostureMetrics = postureMetrics != null && emotionalState !== 'unknown'

  // 眼疲劳信息
  const fatigueScore = eyeMetrics?.fatigueScore
  const blinkRate = eyeMetrics?.blinkRate
  const eyeFatigue = fatigueScore != null ? getEyeFatigueStyle(fatigueScore) : null

  return (
    <div className="flex flex-col gap-1 absolute top-4 left-4 z-10">
      {/* 体态情绪 */}
      <div
        className="bg-[#1a1a2e]/50 backdrop-blur-[8px] rounded-[8px] px-3 py-1.5 transition-colors duration-300"
        style={{ color: emotion.color }}
      >
        <span className="text-sm font-medium">
          {emotion.emoji} {emotion.label}
          {hasPostureMetrics && confidencePercent != null && (
            <span className="opacity-80">
              {' '}&middot;{' '}{confidencePercent}%
            </span>
          )}
        </span>
      </div>

      {/* 眼疲劳状态 */}
      {eyeFatigue && (
        <div
          className="bg-[#1a1a2e]/50 backdrop-blur-[8px] rounded-[8px] px-3 py-1 transition-colors duration-300"
          style={{ color: eyeFatigue.color }}
        >
          <span className="text-sm font-medium">
            👁 {eyeFatigue.label}
          </span>
          {blinkRate != null && (
            <span className="text-[11px] opacity-70 ml-1">
              {Math.round(blinkRate)} blink/min
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default EmotionHUD;
