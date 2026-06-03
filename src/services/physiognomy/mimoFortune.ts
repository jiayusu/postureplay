/**
 * MIMO AI 运势解读 + 四层治疗方案服务
 *
 * 接入 `mimo-v2.5-pro` 模型，基于实时体态检测数据生成：
 *   1. 趣味伪占卜文案（运势）
 *   2. 四层个性化可执行治疗方案
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

/** 传给 MIMO 的体态数据摘要 */
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

interface MimoResponse {
  spine: MimoDimensionResponse
  palm: MimoDimensionResponse
  bone: MimoDimensionResponse
  overall: { score: number; summary: string; luckyElement: string; luckyColor: string }
}

interface MimoDimensionResponse {
  summary: string
  detail: string
  advice: string
  treatmentPlan: {
    daily: string[]        // 第一层
    weekly: string[]       // 第二层
    tools: string[]        // 第三层
    medical: string | null // 第四层
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

  // 数据异常提示：当所有评分接近默认值，说明无真人检测
  const isNoFace = snapshot.bone.overallScore >= 49 && snapshot.bone.overallScore <= 51
  const dataWarning = isNoFace
    ? '\n⚠️ 当前数据来自无真人摄像头的回退默认值。骨相指标不可用。骨相版块仅输出通用保健建议，不要假装检测到了面部特征。'
    : ''

  return `你是「体态游乐场」的AI相术大师。你的输出分两个独立部分。两部分之间用"---"的风格切换：前半段是幽默段子手，后半段是专业养生顾问。不要混淆两种语气。

## 体态检测数据
${s}${dataWarning}

## 第一部分：运势段子（幽默风趣，像朋友聊天）

用中医/道家术语包装检测数据逗用户开心：
- 脊柱：挺拔="龙骨稳固得可以去走T台"；前倾="你的颈椎正在策划一场罢工"；侧弯="脊椎偷偷练了个S曲线"
- 手相：金星丘饱满="掌中藏了一颗元气弹"；各区 energyScore<45="某脏腑在举白旗"
- 骨相：额饱满="天庭亮得能当灯泡"；下颌宽="下巴像磐石，吵架稳赢"
- 输出：summary（≤12字）、detail（80-120字）、advice（一句话总结treatmentPlan的核心，≤15字）

## 第二部分：四层治疗方案（专业严肃，可执行）

### 每条必须基于具体数据偏差！不要给泛泛的"多喝水早睡觉"。

第一层 daily（2-3条）：
即时可做。具体到时间/食材/次数。如"电脑垫高至视线水平；9点脾经当令喝温姜茶"
第二层 weekly（2-3条）：
本周养成习惯。具体的经络/穴位/动作。如"每日YTWL操T动作8次×2组；睡前热敷大椎穴10分钟"
第三层 tools（1-3条）：
实体物品+预算。如"十字拉力带（20-30元）";如无合适项可为空数组[]
第四层 medical：
仅当 deviation>0.4 或两段以上指标异常时给出就医建议，否则必须输出 JSON null（不是字符串"null"）。

## 输出规范

1. 只输出纯JSON，不要任何解释文字，不要 markdown 代码块（\`\`\`）
2. 三个维度各自独立：spine只看脊柱数据，palm只看手相数据，bone只看骨相数据
3. 每个维度的advice必须是其treatmentPlan的概括，不能矛盾

## JSON Schema

{
  "spine": {
    "summary": "≤12字",
    "detail": "80-120字",
    "advice": "≤15字，概括本维度方案",
    "treatmentPlan": { "daily": [], "weekly": [], "tools": [], "medical": null }
  },
  "palm": {
    "summary": "≤12字",
    "detail": "80-120字",
    "advice": "≤15字，概括本维度方案",
    "treatmentPlan": { "daily": [], "weekly": [], "tools": [], "medical": null }
  },
  "bone": {
    "summary": "≤12字",
    "detail": "80-120字",
    "advice": "≤15字，概括本维度方案",
    "treatmentPlan": { "daily": [], "weekly": [], "tools": [], "medical": null }
  },
  "overall": {
    "score": 50,
    "summary": "≤30字总评",
    "luckyElement": "木",
    "luckyColor": "翡翠绿"
  }
}

关键规则：
- medical 只有两种值：一段就医建议字符串 或 JSON null
- 如果数据接近正常范围不要强行制造问题
- 三个 treatmentPlan 必须各有针对性，不能三份复制粘贴
- luckyElement 从 金/木/水/火/土 中随机选
- luckyColor 从 翡翠绿/朱砂红/琥珀黄/孔雀蓝/玄铁灰 中随机选`
}

// ============================================================
// API 调用
// ============================================================

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
        temperature: 0.85,
        max_tokens: 4000,
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

    // 确保 treatmentPlan 各字段不为空，并修正字符串 "null"
    const ensurePlan = (p: MimoDimensionResponse['treatmentPlan']) => ({
      daily: p?.daily ?? [],
      weekly: p?.weekly ?? [],
      tools: p?.tools ?? [],
      medical: (p?.medical && p.medical !== 'null') ? p.medical : null,
    })

    return {
      spine: {
        summary: parsed.spine.summary,
        detail: parsed.spine.detail,
        advice: parsed.spine.advice,
        treatmentPlan: ensurePlan(parsed.spine.treatmentPlan),
      },
      palm: {
        summary: parsed.palm.summary,
        detail: parsed.palm.detail,
        advice: parsed.palm.advice,
        treatmentPlan: ensurePlan(parsed.palm.treatmentPlan),
      },
      bone: {
        summary: parsed.bone.summary,
        detail: parsed.bone.detail,
        advice: parsed.bone.advice,
        treatmentPlan: ensurePlan(parsed.bone.treatmentPlan),
      },
      overall: {
        score: parsed.overall.score,
        summary: parsed.overall.summary,
        luckyElement: parsed.overall.luckyElement,
        luckyColor: parsed.overall.luckyColor,
      },
      generatedAt: Date.now(),
    }
  } finally {
    clearTimeout(timeoutId)
  }
}
