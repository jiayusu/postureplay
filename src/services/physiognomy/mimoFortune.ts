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
  return `你是一位风趣幽默的AI相术大师，同时精通中医养生、运动康复和现代健康管理。你需要根据实时体态检测数据，生成"运势解读"和"个性化治疗方案"两部分内容。

## 体态数据
${s}

## 第一部分：运势解读（保持幽默风格）

1. **脊柱分析（生命之树）**：根据 overallScore 和颈椎/胸椎/腰椎偏差值。挺拔→"龙骨稳固"，驼背前倾→"能量淤堵"，侧弯→"气息失衡"。用中医/道家术语包装，幽默化。
2. **手相分析（掌中星辰）**：根据 vitalityScore/venusMountFullness/各宫位 energyScore。低于45分的脏腑区重点提及。
3. **骨相分析（面相透射）**：根据 foreheadFullness/cheekboneProminence/jawAngle。额饱满→天庭饱满，颧骨高→掌控力强。
4. 每段 detail 80-120字，summary 12字以内，advice 15字以内。

## 第二部分：四层治疗方案（最关键，务必个性化！）

针对每个维度的具体检测数据，提供四个层级的方案，每层2-4条，用中医经络、节气养生、五行学说包装。

### 第一层：生活微调（daily）
即时可执行的饮食、作息、衣着提醒。要具体到时间、食材、动作。
示例：颈椎前探→"电脑垫高至视线平视；每45分钟做下巴后缩（5次×3组）"
示例：肺气虚→"早餐小米粥加山药；上午9点脾经当令喝温姜茶"

### 第二层：主动干预（weekly）  
本周可养成的动作、按摩、呼吸法习惯。
示例：含胸驼背→"每日YTWL肩背操，重点T动作（肩胛后夹）8次×2组"；"睡前热敷大椎穴10分钟"
示例：掌色暗淡→"每日敲肺经（胸前到拇指，从上往下轻敲3遍）"；"晨起深呼吸：吸气4秒呼气6秒"

### 第三层：外部辅助（tools）
实体工具、环境调整、饰品建议。给出具体预算和渠道。
示例：侧弯→"十字拉力带（20-30元），每日扩胸15次"；"腰部支撑靠垫替换办公椅"
示例：心区能量低→"左手侧放暖色台灯（增强心阳暗示）"；"佩戴红玛瑙手串"
示例：掌心暗淡→"白玉或白水晶镯子"；"卧室增加白色/金色元素"

### 第四层：专业对接（medical）
仅当数据明显异常时给出温和就医建议，否则为 null。
示例：手麻+头晕→"建议康复科就诊，拍颈椎正侧位片"
示例：大范围区域连续低分→null（暂不需要）

## 输出格式

直接返回JSON对象（不要markdown代码块包裹），严格按以下格式：

{
  "spine": {
    "summary": "12字以内",
    "detail": "80-120字风趣解读",
    "advice": "15字以内养生建议",
    "treatmentPlan": {
      "daily": ["即时可做的具体行动1", "行动2"],
      "weekly": ["本周可养成习惯1", "习惯2"],
      "tools": ["推荐工具1（附预算）", "工具2"],
      "medical": "就医建议或 null"
    }
  },
  "palm": {
    "summary": "...",
    "detail": "...",
    "advice": "...",
    "treatmentPlan": {
      "daily": ["..."],
      "weekly": ["..."],
      "tools": ["..."],
      "medical": "...或 null"
    }
  },
  "bone": {
    "summary": "...",
    "detail": "...",
    "advice": "...",
    "treatmentPlan": {
      "daily": ["..."],
      "weekly": ["..."],
      "tools": ["..."],
      "medical": "...或 null"
    }
  },
  "overall": {
    "score": 0-100整数,
    "summary": "30字以内总评",
    "luckyElement": "金/木/水/火/土之一",
    "luckyColor": "翡翠绿/朱砂红/琥珀黄/孔雀蓝/玄铁灰之一"
  }
}`
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

    // 确保 treatmentPlan 各字段不为空
    const ensurePlan = (p: MimoDimensionResponse['treatmentPlan']) => ({
      daily: p?.daily ?? [],
      weekly: p?.weekly ?? [],
      tools: p?.tools ?? [],
      medical: p?.medical ?? null,
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
