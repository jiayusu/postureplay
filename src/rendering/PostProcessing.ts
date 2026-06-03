import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import {
  LUMINANCE_EXTRACT_VERT,
  LUMINANCE_EXTRACT_FRAG,
  GAUSSIAN_BLUR_VERT,
  GAUSSIAN_BLUR_FRAG,
  BLOOM_COMPOSITE_VERT,
  BLOOM_COMPOSITE_FRAG,
  ENERGY_NOISE_VERT,
  ENERGY_NOISE_FRAG,
  SOBEL_OUTLINE_VERT,
  SOBEL_OUTLINE_FRAG,
  LUT_VERT,
  LUT_FRAG,
} from './shaders';

// ──────────────────────────────────────────────
// Parameter interfaces
// ──────────────────────────────────────────────

export interface BloomParams {
  threshold: number;
  strength: number;
  radius: number;
}

export interface EnergyParams {
  level: number;
  center: THREE.Vector2;
}

export interface OutlineParams {
  enabled: boolean;
  strength: number;
  inkColor: THREE.Color;
  noiseAmount: number;
}

export interface LUTParams {
  intensity: number;
}

// ──────────────────────────────────────────────
// PostProcessingPipeline
// ──────────────────────────────────────────────

export class PostProcessingPipeline {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;

  private composer: EffectComposer;
  private renderPass: RenderPass;

  // Internal render targets for bloom ping-pong
  private bloomRT1: THREE.WebGLRenderTarget;
  private bloomRT2: THREE.WebGLRenderTarget;
  private sceneRT: THREE.WebGLRenderTarget;

  // Bloom sub-passes (run manually, outside composer chain)
  private luminancePass: ShaderPass;
  private blurHPass: ShaderPass;
  private blurVPass: ShaderPass;

  // Passes registered in the composer chain
  private compositePass: ShaderPass;
  private energyPass: ShaderPass;
  private sobelPass: ShaderPass;
  private lutPass: ShaderPass;

  // Pass collection for indexed access
  private allPasses: ShaderPass[];

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    _width: number,
    _height: number,
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    // ── Shared render-target options ──
    const rtOptions: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
    };

    // ── Three internal RenderTargets for bloom ping-pong ──
    this.bloomRT1 = new THREE.WebGLRenderTarget(_width, _height, rtOptions);
    this.bloomRT2 = new THREE.WebGLRenderTarget(_width, _height, rtOptions);
    this.sceneRT = new THREE.WebGLRenderTarget(_width, _height, rtOptions);

    // ── EffectComposer ──
    this.composer = new EffectComposer(renderer);

    // ── RenderPass: basic scene pass ──
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // ────────────────────────────────────────
    // Bloom sub-passes (manual, not in composer)
    // ────────────────────────────────────────

    // Pass 1: Luminance-extract (threshold pass)
    this.luminancePass = new ShaderPass(
      new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: null },
          uThreshold: { value: 0.6 },
        },
        vertexShader: LUMINANCE_EXTRACT_VERT,
        fragmentShader: LUMINANCE_EXTRACT_FRAG,
      }),
    );

    // Pass 2: Gaussian blur — horizontal
    this.blurHPass = new ShaderPass(
      new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: null },
          uDirection: { value: new THREE.Vector2(1 / _width, 0) },
          uRadius: { value: 1.0 },
        },
        vertexShader: GAUSSIAN_BLUR_VERT,
        fragmentShader: GAUSSIAN_BLUR_FRAG,
      }),
    );

    // Pass 3: Gaussian blur — vertical
    this.blurVPass = new ShaderPass(
      new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: null },
          uDirection: { value: new THREE.Vector2(0, 1 / _height) },
          uRadius: { value: 1.0 },
        },
        vertexShader: GAUSSIAN_BLUR_VERT,
        fragmentShader: GAUSSIAN_BLUR_FRAG,
      }),
    );

    // ────────────────────────────────────────
    // Composer-chain passes
    // ────────────────────────────────────────

    // Pass 4: Bloom composite (mix original + bloom)
    this.compositePass = new ShaderPass(
      new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: null },
          tBloom: { value: null },
          uBloomStrength: { value: 1.0 },
        },
        vertexShader: BLOOM_COMPOSITE_VERT,
        fragmentShader: BLOOM_COMPOSITE_FRAG,
      }),
    );
    this.composer.addPass(this.compositePass);

    // Pass 5: Energy noise (fBm pulsating energy field)
    this.energyPass = new ShaderPass(
      new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: null },
          uTime: { value: 0 },
          uEnergyLevel: { value: 0.0 },
          uCenter: { value: new THREE.Vector2(0.5, 0.5) },
        },
        vertexShader: ENERGY_NOISE_VERT,
        fragmentShader: ENERGY_NOISE_FRAG,
      }),
    );
    this.composer.addPass(this.energyPass);

    // Pass 6: Sobel outline (ink-wash edge detection)
    this.sobelPass = new ShaderPass(
      new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: null },
          uTexelSize: { value: new THREE.Vector2(1 / _width, 1 / _height) },
          uEdgeStrength: { value: 1.0 },
          uInkColor: { value: new THREE.Color(0.1, 0.1, 0.1) },
          uNoiseAmount: { value: 0.0 },
        },
        vertexShader: SOBEL_OUTLINE_VERT,
        fragmentShader: SOBEL_OUTLINE_FRAG,
      }),
    );
    this.composer.addPass(this.sobelPass);

    // Pass 7: LUT color grading (national-trend palette)
    this.lutPass = new ShaderPass(
      new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: null },
          tLUT: { value: null },
          uIntensity: { value: 0.0 },
        },
        vertexShader: LUT_VERT,
        fragmentShader: LUT_FRAG,
      }),
    );
    this.lutPass.renderToScreen = true;
    this.composer.addPass(this.lutPass);

    // ── Build indexed pass array ──
    this.allPasses = [
      this.luminancePass,
      this.blurHPass,
      this.blurVPass,
      this.compositePass,
      this.energyPass,
      this.sobelPass,
      this.lutPass,
    ];
  }

  // ──────────────────────────────────────────────
  // Public parameter setters
  // ──────────────────────────────────────────────

  /** Configure bloom parameters. */
  setBloomParams({ threshold = 0.5, strength = 1.0, radius = 1.0 }: Partial<BloomParams> = {}): void {
    this.luminancePass.uniforms['uThreshold'].value = threshold;
    this.compositePass.uniforms['uBloomStrength'].value = strength;
    this.blurHPass.uniforms['uRadius'].value = radius;
    this.blurVPass.uniforms['uRadius'].value = radius;
  }

  /** Configure energy-noise parameters. */
  setEnergyParams({ level = 0.0, center }: Partial<EnergyParams> = {}): void {
    this.energyPass.uniforms['uEnergyLevel'].value = level;
    if (center) this.energyPass.uniforms['uCenter'].value.copy(center);
  }

  /** Configure Sobel outline parameters (enabled toggles the pass on/off). */
  setOutlineParams({ enabled = false, strength = 1.0, inkColor, noiseAmount = 0.0 }: Partial<OutlineParams> = {}): void {
    this.sobelPass.enabled = enabled;
    this.sobelPass.uniforms['uEdgeStrength'].value = strength;
    if (inkColor) (this.sobelPass.uniforms['uInkColor'].value as THREE.Color).copy(inkColor);
    this.sobelPass.uniforms['uNoiseAmount'].value = noiseAmount;
  }

  /** Configure LUT color-grading parameters. */
  setLUTParams({ intensity }: LUTParams): void {
    this.lutPass.uniforms['uIntensity'].value = intensity;
  }

  /** Set the LUT texture (32x32x32 flattened to 1024x32). */
  setLUTTexture(texture: THREE.Texture): void {
    this.lutPass.uniforms['tLUT'].value = texture;
  }

  // ──────────────────────────────────────────────
  // Time-uniform update
  // ──────────────────────────────────────────────

  /**
   * Update time-based uniforms for time-driven shaders.
   * @param time      Accumulated time in seconds.
   * @param passIndex Optional: update only a specific pass (0-6).
   *                  0=luminance 1=blurH 2=blurV 3=composite
   *                  4=energy   5=sobel  6=lut
   */
  updateTimeUniform(time: number, passIndex?: number): void {
    if (passIndex !== undefined) {
      const pass = this.allPasses[passIndex];
      if (pass && pass.uniforms['uTime'] !== undefined) {
        pass.uniforms['uTime'].value = time;
      }
      return;
    }

    // Update all passes that carry a uTime uniform
    for (const pass of this.allPasses) {
      if (pass.uniforms['uTime'] !== undefined) {
        pass.uniforms['uTime'].value = time;
      }
    }
  }

  // ──────────────────────────────────────────────
  // Resize
  // ──────────────────────────────────────────────

  /** Resize all render targets and update resolution-dependent uniforms. */
  setSize(width: number, height: number): void {
    // Resize custom render targets
    this.sceneRT.setSize(width, height);
    this.bloomRT1.setSize(width, height);
    this.bloomRT2.setSize(width, height);

    // Resize composer (internal ping-pong buffers)
    this.composer.setSize(width, height);

    // Update blur-direction uniforms
    this.blurHPass.uniforms['uDirection'].value.set(1 / width, 0);
    this.blurVPass.uniforms['uDirection'].value.set(0, 1 / height);

    // Update Sobel texel-size
    this.sobelPass.uniforms['uTexelSize'].value.set(1 / width, 1 / height);
  }

  // ──────────────────────────────────────────────
  // Main render
  // ──────────────────────────────────────────────

  /**
   * Execute the full post-processing pipeline for one frame.
   *
   * Pipeline order:
   *   1. Render scene to internal texture (sceneRT).
   *   2. Bloom: luminance extract → horizontal blur → vertical blur (ping-pong).
   *   3. Composer chain: RenderPass → BloomComposite → EnergyNoise → Sobel → LUT → screen.
   */
  render(deltaTime: number): void {
    // ── Update time-driven uniforms ──
    this.updateTimeUniform(deltaTime);

    const r = this.renderer;
    const { sceneRT, bloomRT1, bloomRT2 } = this;

    // ── Step 1: capture the scene into sceneRT ──
    r.setRenderTarget(sceneRT);
    r.render(this.scene, this.camera);
    r.setRenderTarget(null);

    // ── Step 2: bloom sub-passes (manual ping-pong) ──
    // 2a. Luminance extract:  sceneRT → bloomRT1
    this.luminancePass.render(r, bloomRT1, sceneRT, deltaTime, false);

    // 2b. Gaussian blur horizontal: bloomRT1 → bloomRT2
    this.blurHPass.render(r, bloomRT2, bloomRT1, deltaTime, false);

    // 2c. Gaussian blur vertical: bloomRT2 → bloomRT1 (final bloom)
    this.blurVPass.render(r, bloomRT1, bloomRT2, deltaTime, false);

    // 2d. Feed bloom texture into the composite pass uniform
    this.compositePass.uniforms['tBloom'].value = bloomRT1.texture;

    // ── Step 3: run the composer chain ──
    // RenderPass renders the scene a second time (ensures tDiffuse for
    // composite is the original scene). The overhead is acceptable and
    // keeps the pipeline decoupled.
    this.composer.render(deltaTime);
  }

  // ──────────────────────────────────────────────
  // Cleanup
  // ──────────────────────────────────────────────

  /** Dispose all GPU resources. */
  dispose(): void {
    this.sceneRT.dispose();
    this.bloomRT1.dispose();
    this.bloomRT2.dispose();
    this.luminancePass.dispose?.();
    this.blurHPass.dispose?.();
    this.blurVPass.dispose?.();
    this.compositePass.dispose?.();
    this.energyPass.dispose?.();
    this.sobelPass.dispose?.();
    this.lutPass.dispose?.();
    this.renderPass.dispose?.();
  }
}
