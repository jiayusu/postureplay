import React from 'react';

interface CameraViewProps {
  mirrored?: boolean;
  className?: string;
}

/**
 * CameraView — 摄像头画面展示组件
 *
 * 纯 video 元素透传，无 wrapper div。
 * 由父组件负责布局容器（absolute inset-0）和状态 UI。
 */
const CameraView = React.forwardRef<HTMLVideoElement, CameraViewProps>(
  ({ mirrored = true, className = '' }, ref) => {
    return (
      <video
        ref={ref}
        autoPlay
        playsInline
        muted
        className={`${mirrored ? '-scale-x-100' : ''} ${className}`}
      />
    );
  });

CameraView.displayName = 'CameraView';

export default CameraView;
