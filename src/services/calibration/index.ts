/**
 * CalibrationService 模块统一导出
 */

export { CalibrationService, getCalibrationService } from './CalibrationService'
export type { CalibrationServiceInterface, CalibrationData } from './types'
export {
  calcMedian,
  isFrameValid,
  filterValidFrames,
  validateCalibrationSamples,
  hasMinValidSamples,
  computeCalibrationConfidence,
  computeBaselineKeypoints,
} from './validation'
