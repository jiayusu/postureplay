/**
 * MIMO AI 运势解读服务
 *
 * 接入 `mimo-v2.5-pro` 模型，基于实时体态检测数据生成趣味伪占卜文案。
 * API: OpenAI-compatible chat completions
 */

import {
  MIMO_API_BASE_URL,
  MIMO_API_KEY,
  MIMO_MODEL,
  MIMO_FORTUNE_TIMEOUT_MS,
} from '../../constants/config'
import type { FortuneInterpretation } from '../../types/physiognomy'

// ============================================================
// 类型
// ============================================================

/** 传给 MIMO 的体态数据摘要（不包含完整关键点坐标） */
interface PhysiognomySnapshot {
  spine: {
    overallScore: number
    cervical: { angle: number; deviation: number }
    thoracic: { angle: number; deviation: number }
    lumbar: { angle: number; deviation: number }
    shoulderAsymmetry: number
    lateralCurvature: number
  }
  palm: {
    vitalityScore: number
    venusMountFullness: number
    regionScores: Array<{ sector: string; organ: string; energyScore: number }>
  }
  bone: {
    overallScore: number
    foreheadFullness: number
    cheekboneProminence: number
    jawAngle: number
    noseBridgeStraightness: number
    faceShape: string
  }
}

// ============================================================
// 格式化
// ============================================================

function buildSnapshot(
  spineMetrics: any,
  palmStars: any,
  boneMetrics: any,
): PhysiognomySnapshot {
  return {
    spine: {
      overallScore: spineMetrics.overallScore,
      cervical: { angle: spineMetrics.cervical.angle, deviation: spineMetrics.cervical.deviation },
      thoracic: { angle: spineMetrics.thoracic.angle, deviation: spineMetrics.thoracic.deviation },
      lumbar: { angle: spineMetrics.lumbar.angle, deviation: spineMetrics.lumbar.deviation },
      shoulderAsymmetry: spineMetrics.shoulderAsymmetry,
      lateralCurvature: spineMetrics.lateralCurvature,
    },
    palm: {
      vitalityScore: palmStars.vitalityScore,
      venusMountFullness: palmStars.venusMountFullness,
      regionScores: (palmStars.regions ?? []).map((r: any) => ({
        sector: r.sector,
        organ: r.organ,
        energyScore: r.energyScore,
      })),
    },
    bone: {
      overallScore: boneMetrics.overallScore,
      foreheadFullness: boneMetrics.foreheadFullness,
      cheekboneProminence: boneMetrics.cheekboneProminence,
      jawAngle: boneMetrics.jawAngle,
      noseBridgeStraightness: boneMetrics.noseBridgeStraightness ?? 0.5,
      faceShape: boneMetrics.faceShape,
    },
  }
}

function buildPrompt(snapshot: PhysiognomySnapshot): string {
  const s = JSON.stringify(snapshot, null, 2)
  return `你是一个风趣幽默的AI相术大师，专精面相、手相、骨相和脊柱分析。请根据以下实时体态检测数据，生成一份"今日运势解读"。

## 体态数据
${s}

## 解读要求
1. **脊柱分析（生命之树）**：根据 overallScore 和颈椎/胸椎/腰椎偏差值，判断体态健康度。挺拔→"龙骨稳固"，驼背前倾→"能量淤堵"，侧弯→"气息失衡"。用中医/道家术语包装，幽默化表达。
2. **手相分析（掌中星辰）**：根据 vitalityScore 和 venusMountFullness 判断生命力，各宫位 energyScore 判断脏腑虚实。引用金星丘、生命线、智慧线、感情线等掌纹概念，夸张化解读。
3. **骨相分析（面相透射）**：根据 foreheadFullness、cheekboneProminence、jawAngle 判断面相。额饱满→天庭饱满/旭日东升；颧骨高→掌控力强/防孤傲；下颌角>130→国字脸磐石/毅力与晚运；脸型对应传统面相学说法。
4. **趣味风格**：不要严肃算命腔调，用"你今天的身体在闹脾气"、"颈椎说它想放假"这类幽默口吻。每段80-120字。
5. **综合运势**：综合三维度给出0-100评分和一个趣味总结。从金木水火土中随机挑一个幸运元素，从翡翠绿/朱砂红/琥珀黄/孔雀蓝/玄铁灰中随机挑一个幸运色。

请直接返回JSON对象（不要markdown代码块包裹），字段名严格按下面格式：

{
  "spine": { "summary": "12字以内总结", "detail": "80-120字风趣解读", "advice": "15字以内养生建议" },
  "palm": { "summary": "12字以内总结", "detail": "80-120字风趣解读", "advice": "15字以内养生建议" },
  "bone": { "summary": "12字以内总结", "detail": "80-120字风趣解读", "advice": "15字以内养生建议" },
  "overall": { "score": 0-100整数, "summary": "30字以内趣味总评", "luckyElement": "木/火/土/金/水之一", "luckyColor": "翡翠绿/朱砂红/琥珀黄/孔雀蓝/玄铁灰之一" }
}`
}

// ============================================================
// API 调用
// ============================================================

interface MimoResponse {
  spine: { summary: string; detail: string; advice: string }
  palm: { summary: string; detail: string; advice: string }
  bone: { summary: string; detail: string; advice: string }
  overall: { score: number; summary: string; luckyElement: string; luckyColor: string }
}

export async function fetchMimoFortune(
  spineMetrics: any,
  palmStars: any,
  boneMetrics: any,
): Promise<FortuneInterpretation> {
  const snapshot = buildSnapshot(spineMetrics, palmStars, boneMetrics)
  const prompt = buildPrompt(snapshot)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), MIMO_FORTUNE_TIMEOUT_MS)

  try {
    const resp = await fetch(`${MIMO_API_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MIMO_API_KEY}`,
      },
      body: JSON.stringify({
        model: MIMO_MODEL,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.9,
        max_tokens: 1200,
      }),
      signal: controller.signal,
    })

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      throw new Error(`MIMO API ${resp.status}: ${errText.slice(0, 200)}`)
    }

    const json = await resp.json()
    const content = json?.choices?.[0]?.message?.content?.trim()

    if (!content) {
      throw new Error('MIMO API 返回空内容')
    }

    // 尝试解析 JSON — 可能被 markdown 代码块包裹
    let parsed: MimoResponse
    try {
      parsed = JSON.parse(content)
    } catch {
      // 尝试提取 ```json ... ``` 块
      const codeBlock = content.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (codeBlock) {
        parsed = JSON.parse(codeBlock[1].trim())
      } else {
        throw new Error(`无法解析 MIMO 返回的 JSON: ${content.slice(0, 200)}`)
      }
    }

    return {
      spine: parsed.spine,
      palm: parsed.palm,
      bone: parsed.bone,
      overall: parsed.overall,
      generatedAt: Date.now(),
    }
  } finally {
    clearTimeout(timeoutId)
  }
}
