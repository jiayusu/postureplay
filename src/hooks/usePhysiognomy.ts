/**
 * 相术分析驱动 Hook
 * 从 Pose / Face / Hand Store 读取数据，计算相术指标
 */
import { useEffect, useRef, useCallback } from 'react'
import { usePostureStore } from '../stores/postureStore'
import { useEyeStore } from '../stores/eyeStore'
import { useHandStore } from '../stores/handStore'
import { usePhysiognomyStore } from '../stores/physiognomyStore'

/** 计算间隔（帧数） */
const PHYSIOGNOMY_COMPUTE_INTERVAL = 10

export function usePhysiognomy(enabled: boolean) {
  const frameCountRef = useRef(0)
  const animFrameRef = useRef<number>(0)
  const lastSpineTimeRef = useRef(0)
  const lastPalmTimeRef = useRef(0)
  const lastBoneTimeRef = useRef(0)

  const postureKeypoints = usePostureStore(s => s.keypoints)
  const faceLandmarks = useEyeStore(s => s.faceLandmarks)
  const detectedHands = useHandStore(s => s.detectedHands)

  const computeSpine = usePhysiognomyStore(s => s.computeSpine)
  const computePalm = usePhysiognomyStore(s => s.computePalm)
  const computeBone = usePhysiognomyStore(s => s.computeBone)
  const reset = usePhysiognomyStore(s => s.reset)

  const loop = useCallback(() => {
    frameCountRef.current++

    if (frameCountRef.current % PHYSIOGNOMY_COMPUTE_INTERVAL === 0) {
      const now = Date.now()

      // 脊柱分析（基于体态关键点）
      if (postureKeypoints && postureKeypoints.length >= 25) {
        computeSpine(postureKeypoints, now)
        lastSpineTimeRef.current = now
      }

      // 手相分析（基于手部关键点）
      if (detectedHands && detectedHands.length > 0) {
        const hand = detectedHands[0]
        if (hand.landmarks && hand.landmarks.length >= 21) {
          computePalm(hand.landmarks, hand.handedness === 'Right' ? 'right' : 'left', now)
          lastPalmTimeRef.current = now
        }
      }

      // 骨相分析（基于面部关键点）
      if (faceLandmarks && faceLandmarks.length >= 200) {
        computeBone(faceLandmarks, now)
        lastBoneTimeRef.current = now
      }
    }

    animFrameRef.current = requestAnimationFrame(loop)
  }, [postureKeypoints, faceLandmarks, detectedHands, computeSpine, computePalm, computeBone])

  useEffect(() => {
    if (!enabled) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      return
    }

    animFrameRef.current = requestAnimationFrame(loop)

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [enabled, loop])

  useEffect(() => {
    return () => {
      reset()
    }
  }, [reset])
}
