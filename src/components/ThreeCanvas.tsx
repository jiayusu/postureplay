/**
 * ThreeCanvas 组件
 * 承载 Three.js WebGL 渲染器的 Canvas 容器
 * 替换原来的 Canvas 2D overlay 组件
 */
import React, { forwardRef } from 'react'

export interface ThreeCanvasProps {
  /** 是否可见 */
  visible: boolean
  /** 传递给 hook 的 canvas ref */
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  /** 子元素（可选的 UI overlay） */
  children?: React.ReactNode
}

/**
 * ThreeCanvas 提供一个 WebGL Canvas 容器，
 * ThreeRenderer 将在此 canvas 上完成所有 GPU 渲染。
 * 可选的 children 作为 HTML overlay 叠加在 Canvas 上方。
 */
const ThreeCanvas = forwardRef<HTMLDivElement, ThreeCanvasProps>(
  function ThreeCanvas({ visible, canvasRef, children }, ref) {
    return (
      <div
        ref={ref}
        className="absolute inset-0 overflow-hidden"
        style={{ display: visible ? 'block' : 'none' }}
      >
        {/* WebGL Canvas */}
        <canvas
          ref={(el) => { (canvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = el }}
          className="absolute inset-0 w-full h-full"
          style={{ pointerEvents: 'none' }}
        />

        {/* HTML UI Overlay（如模式切换按钮、状态指示器等） */}
        {children && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="pointer-events-auto">{children}</div>
          </div>
        )}
      </div>
    )
  },
)

export default ThreeCanvas
