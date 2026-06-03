// ============================================================
// 体态游乐场 PosturePlay — useCameraSetup
//
// 摄像头初始化 Hook：将 cameraStore 的 MediaStream 绑定到
// <video ref>，管理自动播放、中断恢复和生命周期清理。
//
// 阶段十六更新：
//   - 监听 MediaStream track 的 ended 事件，自动触发重连
//   - 监听 visibilitychange，页面回到前台时检查 track 状态
//
// 用法：
//   const videoRef = useRef<HTMLVideoElement>(null)
//   useCameraSetup(videoRef)
// ============================================================

import { useEffect, useRef } from 'react'
import { useCameraStore } from '@/stores/cameraStore'
import { LIGHTING_THRESHOLD } from '@/constants/config'
import { getCameraService } from '@/services/camera'

/**
 * 将摄像头流绑定到 video 元素并启动自动播放。
 *
 * 生命周期：
 * - mount   → 调用 cameraStore.startCamera() 获取 stream
 * - stream 到达 → 赋值 video.srcObject 并 play()
 * - track ended / visibilitychange → 自动重连
 * - unmount → 调用 cameraStore.stopCamera() 释放硬件
 *
 * @param videoRef - 指向 <video> 元素的 React Ref
 */
export function useCameraSetup(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const startCamera = useCameraStore((s) => s.startCamera)
  const stopCamera = useCameraStore((s) => s.stopCamera)
  const stream = useCameraStore((s) => s.stream)
  const status = useCameraStore((s) => s.status)
  const updateLighting = useCameraStore((s) => s.updateLighting)
  const setReconnecting = useCameraStore((s) => s.setReconnecting)
  const mountedRef = useRef(true)

  // ---- mount / unmount ----
  useEffect(() => {
    mountedRef.current = true
    startCamera()

    return () => {
      mountedRef.current = false
      stopCamera()
    }
  }, [startCamera, stopCamera])

  // ---- stream 到达 → 绑定 video ----
  useEffect(() => {
    const video = videoRef.current
    if (!video || !stream) return

    // 防重复绑定
    if (video.srcObject === stream) return

    video.srcObject = stream
    video.playsInline = true

    const play = async () => {
      try {
        await video.play()
      } catch {
        // 浏览器可能阻止自动播放，静默处理
      }
    }
    play()
  }, [stream, videoRef])

  // ---- 阶段十六：监听 track ended 事件 ----
  useEffect(() => {
    if (!stream || status !== 'active') return

    const tracks = stream.getVideoTracks()
    if (tracks.length === 0) return

    const handleTrackEnded = () => {
      if (!mountedRef.current) return
      console.warn('[useCameraSetup] 摄像头 track 意外终止，尝试重连...')
      // 解绑当前 stream
      const video = videoRef.current
      if (video) {
        video.srcObject = null
      }
      setReconnecting()
    }

    for (const track of tracks) {
      track.addEventListener('ended', handleTrackEnded)
    }

    return () => {
      for (const track of tracks) {
        track.removeEventListener('ended', handleTrackEnded)
      }
    }
  }, [stream, status, videoRef, setReconnecting])

  // ---- 阶段十六：监听 visibilitychange，前台恢复时检查 track ----
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) return
      if (!mountedRef.current) return

      // 页面回到前台，检查摄像头 track 是否仍然 active
      const video = videoRef.current
      if (!video || !video.srcObject) return

      const mediaStream = video.srcObject as MediaStream
      const videoTracks = mediaStream.getVideoTracks()

      // 如果所有 track 都已结束，触发重连
      const allEnded = videoTracks.length > 0 && videoTracks.every((t) => t.readyState === 'ended')
      if (allEnded) {
        console.warn('[useCameraSetup] 页面恢复后摄像头 track 已失效，尝试重连...')
        video.srcObject = null
        setReconnecting()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [videoRef, setReconnecting])

  // ---- 定时光照检测（每 5s） ----
  useEffect(() => {
    const video = videoRef.current
    if (!video || !stream) return

    const svc = getCameraService()
    const interval = setInterval(() => {
      if (!mountedRef.current) return
      const lighting = svc.checkLighting(video)
      updateLighting(lighting)
    }, 5000)

    return () => clearInterval(interval)
  }, [stream, videoRef, updateLighting])
}
