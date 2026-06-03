/**
 * 运势解读生成服务
 * 基于相术指标生成传统文化风格的运势文本
 */
import type { SpineMetrics, PalmStarsMetrics, BonePhysiognomyMetrics, FortuneInterpretation, TreatmentPlan } from '../../types/physiognomy'

// ============================================================
// 工具
// ============================================================

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function emptyPlan(): TreatmentPlan {
  return { daily: [], weekly: [], tools: [], medical: null }
}

// ============================================================
// 脊柱运势解读
// ============================================================

const SPINE_TEMPLATES = {
  excellent: {
    summary: ['脊柱如松，龙骨挺拔', '身姿端正，气脉通畅', '脊正神明，形气兼备'],
    detail: [
      '脊柱挺拔如松，主"龙骨"稳固，精气充盈。颈椎、胸椎、腰椎三关通透，气息顺畅无阻，阴阳平衡得宜。',
      '身姿端正若磐石，肩平胯正，显示此人根基牢固，有担当，不畏艰难。',
    ],
    advice: ['继续保持良好坐姿，守护龙骨之气', '宜练习八段锦或太极，养气固本'],
  },
  good: {
    summary: ['脊柱稳健，根基尚固', '气脉微滞，尚可调养'],
    detail: [
      '脊柱整体尚可，但偶有偏斜。如能多加注意，龙骨可复归正中，精气充盈指日可待。',
    ],
    advice: ['建议每小时起身活动，舒展龙骨', '可做靠墙站立练习，校正微小偏斜'],
  },
  warning: {
    summary: ['龙骨有倾，气血不畅', '脊柱失衡，能量淤堵', '形不正则气不顺'],
    detail: [
      '脊柱出现明显偏斜，能量通道受阻。颈椎前探则"天门不开"，胸椎弯曲则"膻中堵塞"，腰椎侧倾则"命门失守"。',
      '含胸驼背之势已成，肺气不宣，心气受阻，长此以往恐影响精气神的凝聚。',
    ],
    advice: ['急需重视脊柱健康，建议每日拉伸', '可练习"靠墙山式"站姿矫正', '脊椎侧弯者宜就医检查，辅以导引术'],
  },
}

function generateSpineFortune(metrics: SpineMetrics): FortuneInterpretation['spine'] {
  const score = metrics.overallScore
  let templates: typeof SPINE_TEMPLATES.excellent

  if (score >= 80) templates = SPINE_TEMPLATES.excellent
  else if (score >= 50) templates = SPINE_TEMPLATES.good
  else templates = SPINE_TEMPLATES.warning

  // 添加段特定提示
  let detailExtra = ''
  const plan = emptyPlan()

  if (metrics.cervical.deviation > 0.4) {
    detailExtra += '颈椎前探明显，提示"天门受堵"，需注意肩颈劳损与头晕之虞。'
    plan.daily.push('电脑垫高至视线平视，每45分钟做"下巴后缩"动作（5次×3组）')
    plan.weekly.push('每日YTWL肩背操，重点T动作（肩胛后夹）8次×2组')
    plan.tools.push('电脑增高架（20-50元），务必调至视线水平')
    plan.medical = '若伴随手麻或头晕，建议康复科就诊拍颈椎正侧位片'
  }
  if (metrics.thoracic.deviation > 0.4) {
    detailExtra += '胸椎弯曲（含胸驼背），"膻中"气机不畅，易致胸闷气短，心情郁结。'
    plan.daily.push('靠墙站5分钟（后脑/肩/臀/脚跟四点贴墙），每日两次')
    plan.weekly.push('俯卧"超人式"核心训练（每次15秒×5组），强化背部')
    plan.tools.push('瑜伽弹力带（15-25元），每日扩胸15次')
  }
  if (metrics.lumbar.deviation > 0.4) {
    detailExtra += '腰椎失衡，"命门之火"不稳，提示腰部劳损可能，需注意肾脏养护。'
    plan.daily.push('坐姿保持腰部自然前凸，腰后垫毛巾卷支撑')
    plan.weekly.push('每日平板支撑40秒×3组 + 猫牛式脊柱灵活性训练')
    plan.tools.push('腰部支撑靠垫（30-60元），替换办公椅靠背')
  }
  if (Math.abs(metrics.shoulderAsymmetry) > 0.03) {
    detailExtra += '两肩不平，阴阳失衡之象，提示单侧用力过度，宜调息对称运动。'
    plan.daily.push('注意双侧均衡用力：背包换肩背，鼠标左右手交替')
    plan.weekly.push('每日耸肩-沉肩练习（10次×2组）+ 弹力带水平外展')
  }
  if (metrics.lateralCurvature > 0.15) {
    plan.daily.push('朝弯曲反方向侧卧5分钟，利用重力辅助矫正')
    plan.weekly.push('每日侧桥支撑（凸侧向上）30秒×2组')
    plan.tools.push('十字拉力带（20-30元），每日双侧均衡扩胸')
  }

  // 无特别偏差 → 通用保健
  if (plan.daily.length === 0) {
    plan.daily.push('保持每小时起身活动2分钟，眺望远方')
    plan.weekly.push('每日八段锦"两手托天理三焦"一式（10次）')
  }

  const detail = pickRandom(templates.detail) + (detailExtra ? ' ' + detailExtra : '')

  return {
    summary: pickRandom(templates.summary),
    detail,
    advice: pickRandom(templates.advice),
    treatmentPlan: plan,
  }
}

// ─── 手相运势解读 ───

const PALM_TEMPLATES = {
  excellent: {
    summary: ['掌中气色红润，元气充盈', '金星丘饱满，人缘运旺'],
    detail: [
      '掌中金星丘（大拇指根部）丰隆泛红，近期人缘运上升，多利合作。掌色红润有光，显示气血充盈，脏腑调和。',
    ],
    advice: ['宜积极社交，把握合作机遇', '保持手心温暖，忌食生冷伤脾胃'],
  },
  good: {
    summary: ['掌色平和，运势稳健', '线条清晰，思路分明'],
    detail: [
      '掌色正常，手掌线条尚算清晰。智慧线连贯，显示思维清晰、决断有方。感情线顺畅，人际关系平稳。',
    ],
    advice: ['多揉按大鱼际，助升元气', '保持手掌温暖，忌寒凉之物'],
  },
  warning: {
    summary: ['掌色晦暗，精气不足', '掌中能量涣散，需注意调养'],
    detail: [
      '掌色偏暗或苍白，显示气血不足，精力耗损。生命线能量粒子涣散，提示需要重视身体保养，调整作息。',
    ],
    advice: ['建议增加蛋白质摄入，补益气血', '可用艾灸温养手心劳宫穴', '减少熬夜，养护肾气'],
  },
}

function generatePalmFortune(metrics: PalmStarsMetrics): FortuneInterpretation['palm'] {
  const score = metrics.vitalityScore
  let templates: typeof PALM_TEMPLATES.excellent

  if (score >= 75) templates = PALM_TEMPLATES.excellent
  else if (score >= 45) templates = PALM_TEMPLATES.good
  else templates = PALM_TEMPLATES.warning

  let detailExtra = ''
  const plan = emptyPlan()

  if (metrics.venusMountFullness > 0.7) {
    detailExtra += '金星丘丰隆饱满，主生命力旺盛，人缘佳，多贵人相助。'
    plan.daily.push('保持手心温暖，忌寒凉食物（冰饮/生食）伤脾胃')
    plan.weekly.push('每日揉按大鱼际（拇指根部）顺时针36圈，助升元气')
  } else if (metrics.venusMountFullness < 0.3) {
    detailExtra += '金星丘略显平坦，提示生命力有待加强，宜多活动大拇指经络。'
    plan.daily.push('早餐加山药/莲子/红枣（各15克煮粥），补脾益气')
    plan.weekly.push('每日敲打肺经（胸前到拇指，从上往下轻敲3遍）')
    plan.tools.push('握力球（10-20元），每日挤压50次增强手部气血')
  }

  const weakRegions = metrics.regions.filter(r => r.energyScore < 40)
  if (weakRegions.length > 0) {
    const names = weakRegions.map(r => `${r.organ}（${r.sector}宫）`).join('、')
    detailExtra += `${names}区域能量偏弱，提示相关脏腑需关注调理。`

    for (const r of weakRegions) {
      if (r.organ === '心' || r.sector === 'li') {
        plan.daily.push('午时（11-13点心经当令）小憩15分钟，红色食物（红枣/枸杞）养心')
        plan.tools.push('左侧桌面放暖色台灯（增强心阳），卧室加红色元素')
      }
      if (r.organ === '肾' || r.sector === 'kan') {
        plan.daily.push('戌时（19-21点）用热水泡脚15分钟，水中加少许盐')
        plan.weekly.push('每日搓后腰肾俞穴（命门两侧）各36次，温补肾阳')
      }
      if (r.organ === '肝' || r.sector === 'zhen') {
        plan.daily.push('睡前勿怒，23点前入睡（肝经当令时段深度睡眠）')
        plan.weekly.push('每日敲打大腿内侧肝经（从大腿根到膝内侧）3遍')
      }
      if (r.organ === '肺') {
        plan.daily.push('晨起深呼吸：鼻吸4秒 → 憋气2秒 → 嘴呼6秒 → 循环5次')
        plan.weekly.push('每日敲打肺经3遍 + 百合银耳羹（每周2次）')
      }
    }
  }

  if (plan.daily.length === 0) {
    plan.daily.push('保持手心温暖，多搓手促进末梢循环')
    plan.weekly.push('每日敲打掌中线（劳宫穴→中冲穴），助心包经通畅')
    plan.tools.push('白玉或白水晶手串（心理暗示增强金行能量）')
  }

  return {
    summary: pickRandom(templates.summary),
    detail: pickRandom(templates.detail) + (detailExtra ? ' ' + detailExtra : ''),
    advice: pickRandom(templates.advice),
    treatmentPlan: plan,
  }
}

// ─── 骨相运势解读 ───

const BONE_TEMPLATES = {
  excellent: {
    summary: ['天庭饱满，福泽深厚', '鼻骨直挺，运势亨通'],
    detail: [
      '天庭饱满开阔，主早年运佳，智慧通达。鼻骨直起连眉骨，主"运势亨通"，做事有主见，中年财运佳。面相端正，气度不凡。',
    ],
    advice: ['保持谦逊之心，福泽自会长久', '宜发挥领导才能，把握事业良机'],
  },
  good: {
    summary: ['面相端和，运道平稳', '骨骼端正，根基稳固'],
    detail: [
      '面相各部位均衡，骨骼端正，显示此人行事稳重，不激进不退缩，运势平缓向好。',
    ],
    advice: ['保持内心平和，顺势而为', '可适当锻炼面部肌肉，保持气色红润'],
  },
  controversial: {
    summary: ['颧高腮宽，个性刚强', '骨骼出众，命格独特'],
    detail: [
      '颧骨高耸，显示掌控欲强，行事果断，有领导之才。然需防孤傲之心，多倾听他人意见。',
    ],
    advice: ['刚柔并济，方为上策', '多听逆耳忠言，防偏执之弊'],
  },
  warning: {
    summary: ['面相有待调养', '骨骼之象需留意'],
    detail: [
      '面部骨相出现不均衡之象，提示需注意对应脏腑的调养。相由心生，保持良好心态亦能改善面相。',
    ],
    advice: ['保持良好姿态和心态', '适当面部按摩，促进气血循环'],
  },
}

function generateBoneFortune(metrics: BonePhysiognomyMetrics): FortuneInterpretation['bone'] {
  const score = metrics.overallScore
  let templates: typeof BONE_TEMPLATES.excellent

  if (score >= 80) templates = BONE_TEMPLATES.excellent
  else if (score >= 55) templates = BONE_TEMPLATES.good
  else if (score >= 35) templates = BONE_TEMPLATES.controversial
  else templates = BONE_TEMPLATES.warning

  let detailExtra = ''
  const plan = emptyPlan()

  if (metrics.foreheadFullness > 0.6) {
    detailExtra += '天庭（额头）饱满开阔，早年运势得助，智慧超群。'
    plan.daily.push('保持额头区域温暖（忌冷风直吹），宜梳头百会穴区域')
  } else if (metrics.foreheadFullness < 0.3) {
    plan.daily.push('多读书养气，每日朗读10分钟（调动面肌气血）')
    plan.weekly.push('每日面部按摩：从眉心→发际线推按（循督脉）36次')
  }
  if (metrics.cheekboneProminence > 0.65) {
    detailExtra += '颧骨高耸，主"权柄在握"，中年事业发展有力。但需防刚愎自用，宜广纳贤言。'
    plan.daily.push('每日自省时刻：写下当日所有自己可能判断出错的事')
    plan.weekly.push('每周找一位不同背景的朋友聊聊天，多听少说')
  }
  if (metrics.jawAngle > 125) {
    detailExtra += `腮骨宽大（${Math.round(metrics.jawAngle)}°），象征"毅力与晚运"，晚年福气深厚，为人重信守诺。`
    plan.daily.push('利用你的持久力优势，每日坚持一项微习惯（如3分钟冥想）')
  }
  if (metrics.noseBridgeStraightness > 0.65) {
    detailExtra += '鼻骨直挺通达，主中年财运亨通，做事有主见不随波逐流。'
  }

  if (plan.daily.length === 0) {
    plan.daily.push('保持良好面部表情习惯，经常微笑促进面部气血循环')
    plan.weekly.push('每日面部瑜伽：金鱼嘴（10次） + 狮子式（5次）锻炼面肌')
  }

  return {
    summary: pickRandom(templates.summary),
    detail: pickRandom(templates.detail) + (detailExtra ? ' ' + detailExtra : ''),
    advice: pickRandom(templates.advice),
    treatmentPlan: plan,
  }
}

// ─── 综合运势 ───

const LUCKY_ELEMENTS = ['木', '火', '土', '金', '水']
const LUCKY_COLORS = ['翡翠绿', '朱砂红', '明黄', '鎏金', '黛蓝', '月白', '绛紫', '檀色']

function generateOverallFortune(
  _spine: FortuneInterpretation['spine'],
  _palm: FortuneInterpretation['palm'],
  _bone: FortuneInterpretation['bone'],
  spineScore: number,
  palmScore: number,
  boneScore: number,
): FortuneInterpretation['overall'] {
  const avgScore = Math.round((spineScore + palmScore + boneScore) / 3)

  let summary: string
  if (avgScore >= 80) {
    summary = '身姿端正如松，掌中元气充盈，面相骨正肉匀——整体运势亨通，贵人运旺。近期事业有望突破，感情平稳，宜积极进取。'
  } else if (avgScore >= 55) {
    summary = '整体运势平稳，偶有小波折但不足为虑。保持良好习惯，运势自会稳步上升。'
  } else {
    summary = '运势有待调理。身姿、手掌、面相皆有失衡之处，建议从脊柱矫正入手，兼顾作息调理，半月之内必有改善。'
  }

  return {
    score: avgScore,
    summary,
    luckyElement: pickRandom(LUCKY_ELEMENTS),
    luckyColor: pickRandom(LUCKY_COLORS),
  }
}

/**
 * 生成完整运势解读
 */
export function generateFortuneInterpretation(
  spine: SpineMetrics,
  palm: PalmStarsMetrics,
  bone: BonePhysiognomyMetrics,
): FortuneInterpretation {
  const spineFortune = generateSpineFortune(spine)
  const palmFortune = generatePalmFortune(palm)
  const boneFortune = generateBoneFortune(bone)
  const overall = generateOverallFortune(
    spineFortune,
    palmFortune,
    boneFortune,
    spine.overallScore,
    palm.vitalityScore,
    bone.overallScore,
  )

  return {
    spine: spineFortune,
    palm: palmFortune,
    bone: boneFortune,
    overall,
    generatedAt: Date.now(),
  }
}
