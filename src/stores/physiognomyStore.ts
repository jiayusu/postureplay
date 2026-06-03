/**
 * 相术体态分析 Zustand Store
 */
import { create } from 'zustand'
import type {
  SpineMetrics,
  SpineEnergy,
  PalmStarsMetrics,
  BonePhysiognomyMetrics,
  FortuneInterpretation,
} from '../types/physiognomy'
import type { Keypoint } from '../types'
import {
  computeSpineMetrics,
  computeSpineEnergy,
  computePalmStarsMetrics,
  computeBonePhysiognomyMetrics,
  generateFortuneInterpretation,
  fetchMimoFortune,
} from '../services/physiognomy'

interface PhysiognomyState {
  // 脊柱
  spineMetrics: SpineMetrics | null
  spineEnergy: SpineEnergy | null

  // 手相
  palmStars: PalmStarsMetrics | null

  // 骨相
  boneMetrics: BonePhysiognomyMetrics | null

  // 运势
  fortune: FortuneInterpretation | null
  fortuneLoading: boolean
  fortuneError: string | null

  // 活跃面板
  activePanel: 'spine' | 'palm' | 'bone' | 'combined'

  // 是否正在播放特写特效
  isShowcasing: boolean
  showcaseTarget: 'spine' | 'palm' | 'bone' | null

  // 动作
  computeSpine: (keypoints: Keypoint[], timestamp: number) => void
  computePalm: (
    keypoints: Array<{ x: number; y: number; z?: number }>,
    hand: 'left' | 'right',
    timestamp: number,
  ) => void
  computeBone: (
    faceKeypoints: Array<{ x: number; y: number; z?: number; visibility?: number }>,
    timestamp: number,
  ) => void
  generateFortune: () => Promise<void>
  setActivePanel: (panel: PhysiognomyState['activePanel']) => void
  setShowcasing: (target: PhysiognomyState['showcaseTarget']) => void
  clearShowcase: () => void
  reset: () => void
}

const initialState = {
  spineMetrics: null,
  spineEnergy: null,
  palmStars: null,
  boneMetrics: null,
  fortune: null,
  fortuneLoading: false,
  fortuneError: null,
  activePanel: 'combined' as const,
  isShowcasing: false,
  showcaseTarget: null as PhysiognomyState['showcaseTarget'],
}

export const usePhysiognomyStore = create<PhysiognomyState>((set, get) => ({
  ...initialState,

  computeSpine: (keypoints: Keypoint[], timestamp: number) => {
    const metrics = computeSpineMetrics(keypoints, timestamp)
    const energy = computeSpineEnergy(metrics)
    set({ spineMetrics: metrics, spineEnergy: energy })
  },

  computePalm: (
    keypoints: Array<{ x: number; y: number; z?: number }>,
    hand: 'left' | 'right',
    timestamp: number,
  ) => {
    const metrics = computePalmStarsMetrics(keypoints, hand, timestamp)
    set({ palmStars: metrics })
  },

  computeBone: (
    faceKeypoints: Array<{ x: number; y: number; z?: number; visibility?: number }>,
    timestamp: number,
  ) => {
    const metrics = computeBonePhysiognomyMetrics(faceKeypoints, timestamp)
    set({ boneMetrics: metrics })
  },

  generateFortune: async () => {
    const { spineMetrics, palmStars, boneMetrics } = get()
    if (!spineMetrics || !palmStars || !boneMetrics) {
      const missing: string[] = []
      if (!spineMetrics) missing.push('脊柱体态')
      if (!palmStars) missing.push('手相')
      if (!boneMetrics) missing.push('骨相')
      set({
        fortuneLoading: false,
        fortuneError: `数据未就绪：${missing.join('、')}未检测到。请确保身体、手部和面部都在摄像头范围内。`,
      })
      return
    }

    // 给骨相填入一些默认区域（如果还没有的话）
    const bone = boneMetrics.regions.length === 0
      ? {
          ...boneMetrics,
          regions: [
            {
              name: 'forehead' as const,
              prominence: boneMetrics.foreheadFullness,
              contour: [],
              judgment: boneMetrics.foreheadFullness > 0.55 ? 'auspicious' as const : 'neutral' as const,
              judgmentLabel: boneMetrics.foreheadFullness > 0.55 ? '天庭饱满' : '额头平正',
            },
          ],
        }
      : boneMetrics

    set({ fortuneLoading: true, fortuneError: null })

    try {
      console.log('[MIMO] 🚀 开始请求AI运势...')
      const fortune = await fetchMimoFortune(spineMetrics, palmStars, bone)
      console.log('[MIMO] ✅ AI运势生成成功, overall.score=', fortune.overall?.score)
      set({ fortune, fortuneLoading: false })
    } catch (err) {
      console.warn('[MIMO] ❌ API调用失败，回退到本地模板:', err)
      // 回退到纯前端模板生成
      const fortune = generateFortuneInterpretation(spineMetrics, palmStars, bone)
      console.log('[MIMO] 📋 已使用本地模板生成运势')
      set({ fortune, fortuneLoading: false, fortuneError: null })
    }
  },

  setActivePanel: (panel) => set({ activePanel: panel }),
  setShowcasing: (target) => set({ isShowcasing: true, showcaseTarget: target }),
  clearShowcase: () => set({ isShowcasing: false, showcaseTarget: null }),
  reset: () => set(initialState),
}))
