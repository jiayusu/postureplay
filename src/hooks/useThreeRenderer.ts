/**
 * Three.js 渲染器 React Hook
 * 管理 ThreeRenderer 的生命周期、自适应尺寸和帧驱动
 */
import { useRef, useCallback, useEffect } from 'react'
import { ThreeRenderer } from '../rendering'
import type {
  ViewMode,
  LayerVisibility,
  SpineTreeParams,
  PalmStarsParams,
  BonePhysiognomyParams,
} from '../rendering'

interface UseThreeRendererOptions {
  /** canvas 元素 ref */
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  /** 当前视图模式（控制层可见性） */
  viewMode: ViewMode
  /** 是否启用 */
  enabled: boolean
  /** 每帧回调（用于驱动外部数据更新） */
  onFrame?: (dt: number) => void
}

interface UseThreeRendererReturn {
  /** 渲染器实例 ref */
  rendererRef: React.RefObject<ThreeRenderer | null>
  /** 绑定视频元素 */
  bindVideo: (video: HTMLVideoElement) => void
  /** 更新脊柱仿真 */
  updateSpineTree: (params: SpineTreeParams) => void
  /** 更新手相仿真 */
  updatePalmStars: (params: PalmStarsParams) => void
  /** 更新骨相仿真 */
  updateBoneGlow: (params: BonePhysiognomyParams) => void
}

/** 根据视图模式计算层可见性 */
function getLayerVisibility(mode: ViewMode): LayerVisibility {
  switch (mode) {
    case 'spine':
      return { spine: true, palm: false, bone: false }
    case 'palm':
      return { spine: false, palm: true, bone: false }
    case 'bone':
      return { spine: false, palm: false, bone: true }
    case 'combined':
      return { spine: true, palm: true, bone: true }
  }
}

export function useThreeRenderer(
  options: UseThreeRendererOptions,
): UseThreeRendererReturn {
  const { canvasRef, viewMode, enabled, onFrame } = options
  const rendererRef = useRef<ThreeRenderer | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const initializedRef = useRef(false)

  // ── 初始化 / 销毁 ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !enabled) return

    // 获取容器尺寸
    const container = canvas.parentElement as HTMLDivElement
    if (!container) return

    containerRef.current = container
    const { clientWidth: w, clientHeight: h } = container

    // 避免重复初始化
    if (initializedRef.current) return
    initializedRef.current = true

    const renderer = new ThreeRenderer(canvas, w, h)
    rendererRef.current = renderer
    renderer.start()

    // 自适应窗口尺寸
    const handleResize = (): void => {
      const { clientWidth, clientHeight } = container
      renderer.resize(clientWidth, clientHeight)
    }

    // ResizeObserver 比 window.resize 更精确（跟踪容器尺寸）
    const resizeObserver = new ResizeObserver(() => {
      handleResize()
    })
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      renderer.stop()
      renderer.dispose()
      rendererRef.current = null
      initializedRef.current = false
    }
  }, [canvasRef, enabled])

  // ── 层可见性随 viewMode 变化 ──
  useEffect(() => {
    if (!rendererRef.current) return
    const visibility = getLayerVisibility(viewMode)
    rendererRef.current.setLayerVisibility(visibility)
  }, [viewMode])

  // ── 帧回调 ──
  useEffect(() => {
    if (!rendererRef.current) return
    rendererRef.current.setFrameCallback(onFrame ?? (() => {}))
  }, [onFrame])

  // ── 公共方法 ──

  const bindVideo = useCallback((video: HTMLVideoElement) => {
    rendererRef.current?.setVideo(video)
  }, [])

  const updateSpineTree = useCallback((params: SpineTreeParams) => {
    rendererRef.current?.updateSpineTree(params)
  }, [])

  const updatePalmStars = useCallback((params: PalmStarsParams) => {
    rendererRef.current?.updatePalmStars(params)
  }, [])

  const updateBoneGlow = useCallback((params: BonePhysiognomyParams) => {
    rendererRef.current?.updateBoneGlow(params)
  }, [])

  return {
    rendererRef,
    bindVideo,
    updateSpineTree,
    updatePalmStars,
    updateBoneGlow,
  }
}
