/**
 * Canvas 2D Rutt/Etra 线框浮雕渲染器
 *
 * 灵感来源：C-Trend Live (yufengzhao.com)
 * 核心技术：从视频帧逐行采样亮度 → 映射为垂直位移 → 绘制线框表面
 * 纯 Canvas 2D 实现，无需 GPU/WebGL
 *
 * 原始艺术：
 *   - Woody Vasulka, C-Trend (1974)
 *   - Rutt/Etra 视频合成器：每条扫描线的亮度转为 CRT 垂直偏转
 *   - 亮像素上升，暗像素保持平坦 → 形成三维线框浮雕
 *
 * 移植到 Canvas 2D 的等价操作：
 *   1. source → offscreen canvas → ImageData
 *   2. for each row (scanline): 采样亮度，计算位移
 *   3. ctx.beginPath() → moveTo/lineTo → stroke()
 *   4. 多 Pass 叠加：底层粗线(辉光) + 顶层细线(结构)
 */

// ──────────────────────────────────────────────
// 类型
// ──────────────────────────────────────────────

/** 亮度/位移采样参数 */
export interface ReliefParams {
  /** 水平采样间隔 (px)，越小越密 */
  sampleGapX: number
  /** 垂直扫描线间隔 (px) */
  sampleGapY: number
  /** 位移振幅 (最大像素位移) */
  amplitude: number
  /** 垂直基准偏移 (从画布顶部下移多少开始绘制) */
  baseYOffset: number
  /** 采样区域：归一化裁剪 [0-1] */
  crop: { x: number; y: number; w: number; h: number }
}

/** 线框层配置 */
export interface WireframeLayer {
  /** 线条颜色 */
  color: string
  /** 线条宽度 */
  lineWidth: number
  /** 全局透明度 */
  globalAlpha: number
  /** 辉光 (shadowBlur) */
  glow: number
  /** 辉光颜色 */
  glowColor: string
  /** 水平偏移 (用于层间错位) */
  offsetX: number
  /** 垂直偏移 */
  offsetY: number
  /** 是否只用水平线 (不连接相邻点) */
  horizontalOnly: boolean
  /** 位移衰减系数 (0~1, 1=全位移) */
  displacementScale: number
}

/** 渲染选项 */
export interface WireframeReliefOptions {
  params: ReliefParams
  layers: WireframeLayer[]
  /** 水平线是否填充 (连接相邻采样点形成连续线) */
  connectHorizontal: boolean
  /** 垂直线是否连接 (纵向连接相邻扫描线) */
  connectVertical: boolean
  /** 垂直连接间隔 (每 N 列连接一条) */
  verticalConnectGap: number
}

/** 亮度样本 */
interface Sample {
  x: number
  y: number
  brightness: number
  r: number
  g: number
  b: number
}

// ──────────────────────────────────────────────
// 默认参数
// ──────────────────────────────────────────────

export const DEFAULT_RELIEF_PARAMS: ReliefParams = {
  sampleGapX: 6,
  sampleGapY: 3,
  amplitude: 80,
  baseYOffset: 200,
  crop: { x: 0, y: 0, w: 1, h: 1 },
}

// ──────────────────────────────────────────────
// 核心渲染
// ──────────────────────────────────────────────

/** 计算 RGB 亮度 (感知亮度，非简单平均) */
function luminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

/**
 * 从 ImageData 采样亮度网格
 * @returns 二维样本数组 [rowIndex][colIndex]
 */
function sampleBrightness(
  imageData: ImageData,
  params: ReliefParams,
  srcWidth: number,
  srcHeight: number,
): Sample[][] {
  const data = imageData.data
  const { sampleGapX, sampleGapY, crop } = params

  const startX = Math.floor(crop.x * srcWidth)
  const startY = Math.floor(crop.y * srcHeight)
  const endX = Math.floor((crop.x + crop.w) * srcWidth)
  const endY = Math.floor((crop.y + crop.h) * srcHeight)

  const rows: Sample[][] = []
  let rowIdx = 0

  for (let sy = startY; sy < endY; sy += sampleGapY) {
    const row: Sample[] = []
    let colIdx = 0

    for (let sx = startX; sx < endX; sx += sampleGapX) {
      const idx = (sy * srcWidth + sx) * 4
      const r = data[idx]
      const g = data[idx + 1]
      const b = data[idx + 2]
      const brightness = luminance(r, g, b)

      row.push({ x: sx, y: sy, brightness, r, g, b })
      colIdx++
    }
    rows.push(row)
    rowIdx++
  }

  return rows
}

/**
 * 渲染线框浮雕到目标 canvas
 *
 * @param ctx 目标 Canvas 2D 上下文
 * @param imageData 源图像数据 (来自 video 或 canvas)
 * @param srcWidth 源图像宽度
 * @param srcHeight 源图像高度
 * @param destWidth 目标画布宽度
 * @param destHeight 目标画布高度
 * @param options 设置
 */
export function renderWireframeRelief(
  ctx: CanvasRenderingContext2D,
  imageData: ImageData,
  srcWidth: number,
  srcHeight: number,
  destWidth: number,
  _destHeight: number,
  options: WireframeReliefOptions,
): void {
  const { params, layers, connectHorizontal, connectVertical, verticalConnectGap } = options

  // 计算缩放比
  const scaleX = destWidth / ((params.crop.w) * srcWidth)

  const rows = sampleBrightness(imageData, params, srcWidth, srcHeight)

  if (rows.length < 2) return

  const colCount = rows[0]?.length ?? 0
  if (colCount < 2) return

  // ── 逐层渲染 ──
  for (const layer of layers) {
    ctx.save()
    ctx.globalAlpha = layer.globalAlpha

    // ── 辉光 Pass ──
    if (layer.glow > 0) {
      renderLayer(ctx, rows, layer, scaleX,
        destWidth, params, connectHorizontal, connectVertical, verticalConnectGap, true)
    }

    // ── 结构 Pass ──
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.globalAlpha = layer.globalAlpha
    renderLayer(ctx, rows, layer, scaleX,
      destWidth, params, connectHorizontal, connectVertical, verticalConnectGap, false)
    ctx.restore()
  }
}

/** 渲染单片层 */
function renderLayer(
  ctx: CanvasRenderingContext2D,
  rows: Sample[][],
  layer: WireframeLayer,
  scaleX: number,
  _destW: number,
  params: ReliefParams,
  connectHorizontal: boolean,
  connectVertical: boolean,
  verticalConnectGap: number,
  isGlowPass: boolean,
): void {
  ctx.strokeStyle = isGlowPass ? layer.glowColor : layer.color
  ctx.lineWidth = isGlowPass ? layer.lineWidth + layer.glow : layer.lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (isGlowPass && layer.glow > 0) {
    ctx.shadowColor = layer.glowColor
    ctx.shadowBlur = layer.glow
  }

  const baseY = params.baseYOffset
  const amp = params.amplitude * layer.displacementScale
  const ox = layer.offsetX
  const oy = layer.offsetY

  // ── 水平扫描线: 每行绘制一条波形曲线 ──
  if (connectHorizontal) {
    for (const row of rows) {
      if (row.length < 2) continue

      ctx.beginPath()
      let first = true

      for (const sample of row) {
        const sx = (sample.x - params.crop.x * (_destW / scaleX)) * scaleX + ox
        const displaceY = (1 - sample.brightness) * amp
        const sy = baseY - displaceY + oy

        if (first) {
          ctx.moveTo(sx, sy)
          first = false
        } else {
          ctx.lineTo(sx, sy)
        }
      }
      ctx.stroke()
    }
  }

  // ── 垂直线 (纵向连接相邻扫描线，模拟网格结构) ──
  if (connectVertical && rows.length >= 2) {
    const colCount = rows[0]?.length ?? 0

    for (let col = 0; col < colCount; col += verticalConnectGap) {
      ctx.beginPath()
      let first = true

      for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
        const sample = rows[rowIdx][col]
        if (!sample) continue

        const sx = (sample.x - params.crop.x * (_destW / scaleX)) * scaleX + ox
        const displaceY = (1 - sample.brightness) * amp
        const sy = baseY - displaceY + oy

        if (first) {
          ctx.moveTo(sx, sy)
          first = false
        } else {
          ctx.lineTo(sx, sy)
        }
      }
      ctx.stroke()
    }
  }
}

/**
 * 从 video 元素获取 ImageData (高效: 不创建临时 canvas)
 */
export function getVideoImageData(
  video: HTMLVideoElement,
  offscreen: HTMLCanvasElement,
  crop?: { x: number; y: number; w: number; h: number },
): { data: ImageData; width: number; height: number } | null {
  if (video.readyState < 2) return null

  const vw = video.videoWidth
  const vh = video.videoHeight
  if (vw === 0 || vh === 0) return null

  // 计算裁剪区域
  let sx = 0, sy = 0, sw = vw, sh = vh
  if (crop) {
    sx = Math.floor(crop.x * vw)
    sy = Math.floor(crop.y * vh)
    sw = Math.floor(crop.w * vw)
    sh = Math.floor(crop.h * vh)
  }

  if (sw <= 0 || sh <= 0) return null

  offscreen.width = sw
  offscreen.height = sh
  const ctx = offscreen.getContext('2d')
  if (!ctx) return null

  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh)
  return {
    data: ctx.getImageData(0, 0, sw, sh),
    width: sw,
    height: sh,
  }
}
