export { ThreeRenderer } from './ThreeRenderer'
export type {
  ViewMode,
  LayerVisibility,
  SpineTreeParams,
  PalmStarsParams,
  BonePhysiognomyParams,
  BloomParams,
  EnergyParams,
  OutlineParams,
} from './ThreeRenderer'
export { PostProcessingPipeline } from './PostProcessing'
export { InstancedParticleSystem } from './InstancedParticleSystem'

// GPU 流体特效
export { FluidSolver } from './FluidSolver'
export type { FluidSource, FluidConfig } from './FluidSolver'
export { spineToFlowSources, palmToFlowSources, boneToFlowSources } from './EnergyFlowField'
export type { SpineFlowInput, PalmFlowInput, BoneFlowInput } from './EnergyFlowField'
export { FluidRenderer } from './FluidRenderer'
export type { FluidRenderConfig } from './FluidRenderer'
export { GPUWireframeRelief } from './GPUWireframeRelief'
export type { ReliefConfig } from './GPUWireframeRelief'

// Taichi 风格特效
export { ReactionDiffusion } from './ReactionDiffusion'
export type { RDConfig, RDSeed } from './ReactionDiffusion'
export { NBodyField } from './NBodyField'
export type { NBodyConfig, NBodySource } from './NBodyField'

// LIC 流线 + 三元合成器
export { LICFlowRenderer } from './LICFlowRenderer'
export type { LICConfig } from './LICFlowRenderer'
export { EffectCompositor } from './EffectCompositor'
export type { CompositorConfig } from './EffectCompositor'

// C/D/E/F 新特效
export { GPUParticleAdvection } from './GPUParticleAdvection'
export type { ParticleAdvectionConfig } from './GPUParticleAdvection'
export { MeridianForceLines } from './MeridianForceLines'
export type { MeridianCharge, MeridianConfig } from './MeridianForceLines'
export { BreathingWarp } from './BreathingWarp'
export type { BreathingWarpConfig } from './BreathingWarp'
export { ChakraOrbs } from './ChakraOrbs'
export type { ChakraConfig } from './ChakraOrbs'
export { MultiLayerCompositor } from './MultiLayerCompositor'
export type { CompositorLayerConfig } from './MultiLayerCompositor'
