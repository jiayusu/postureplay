import * as THREE from 'three'
import { PARTICLE_VERT, PARTICLE_FRAG } from './shaders'

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface ParticleData {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  life: number      // 0~1, 1 = full life
  maxLife: number
  size: number
  alpha: number
  color: [number, number, number] // RGB 0~1
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const DEFAULT_MAX_PARTICLES = 10000

// ──────────────────────────────────────────────
// InstancedParticleSystem
// ──────────────────────────────────────────────

export class InstancedParticleSystem {
  private readonly maxParticles: number
  private readonly scene: THREE.Object3D
  private readonly particles: ParticleData[]
  private readonly freeIndices: number[]
  private activeCount: number

  private readonly mesh: THREE.InstancedMesh
  private readonly dummy: THREE.Object3D
  private readonly sizeAttr: THREE.InstancedBufferAttribute
  private readonly alphaAttr: THREE.InstancedBufferAttribute
  private readonly colorAttr: THREE.InstancedBufferAttribute

  constructor(maxParticles: number = DEFAULT_MAX_PARTICLES, scene: THREE.Object3D) {
    this.maxParticles = maxParticles
    this.scene = scene
    this.activeCount = 0

    // ── Object pool ──
    this.particles = new Array<ParticleData>(maxParticles)
    this.freeIndices = []
    for (let i = 0; i < maxParticles; i++) {
      this.freeIndices.push(i)
    }

    // ── Geometry: a single point for instancing ──
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3),
    )

    // Per-instance attributes
    this.sizeAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(maxParticles),
      1,
    )
    this.alphaAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(maxParticles),
      1,
    )
    this.colorAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(maxParticles * 3),
      3,
    )

    geometry.setAttribute('aSize', this.sizeAttr)
    geometry.setAttribute('aAlpha', this.alphaAttr)
    geometry.setAttribute('aColor', this.colorAttr)

    // ── Material with custom shaders ──
    const material = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    })

    // ── InstancedMesh ──
    this.mesh = new THREE.InstancedMesh(geometry, material, maxParticles)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    scene.add(this.mesh)

    // ── Reusable dummy for instance-matrix updates ──
    this.dummy = new THREE.Object3D()
    this.dummy.matrixAutoUpdate = false
  }

  // ────────────────────────────────────────────
  // emit – spawn a particle into the pool
  // ────────────────────────────────────────────

  emit(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number,
    color: [number, number, number],
  ): number {
    if (this.freeIndices.length === 0) {
      return -1
    }

    const index = this.freeIndices.pop()!

    const particle: ParticleData = {
      x,
      y,
      z,
      vx,
      vy,
      vz,
      life,
      maxLife: life,
      size,
      alpha: 1,
      color,
    }

    this.particles[index] = particle
    this.activeCount++

    return index
  }

  // ────────────────────────────────────────────
  // update – step simulation forward by dt
  // ────────────────────────────────────────────

  update(dt: number): void {
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i]
      if (!p) continue

      // Integration
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt

      // Life decay
      p.life -= dt / p.maxLife
      p.alpha = Math.max(0, p.life)

      // Recycle dead particles
      if (p.life <= 0) {
        ;(this.particles as any)[i] = undefined
        this.freeIndices.push(i)
        this.activeCount--
      }
    }

    this.updateBufferAttributes()
  }

  // ────────────────────────────────────────────
  // updateBufferAttributes – compact & write to GPU
  // ────────────────────────────────────────────

  updateBufferAttributes(): void {
    const sizeAttr = this.mesh.geometry.getAttribute(
      'aSize',
    ) as THREE.InstancedBufferAttribute
    const alphaAttr = this.mesh.geometry.getAttribute(
      'aAlpha',
    ) as THREE.InstancedBufferAttribute
    const colorAttr = this.mesh.geometry.getAttribute(
      'aColor',
    ) as THREE.InstancedBufferAttribute

    let instanceIndex = 0

    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i]
      if (!p) continue

      // Instance matrix (position)
      this.dummy.position.set(p.x, p.y, p.z)
      this.dummy.updateMatrix()
      this.mesh.setMatrixAt(instanceIndex, this.dummy.matrix)

      // Per-instance vertex attributes
      sizeAttr.setX(instanceIndex, p.size)
      alphaAttr.setX(instanceIndex, p.alpha)
      colorAttr.setXYZ(instanceIndex, p.color[0], p.color[1], p.color[2])

      instanceIndex++
    }

    sizeAttr.needsUpdate = true
    alphaAttr.needsUpdate = true
    colorAttr.needsUpdate = true
    this.mesh.instanceMatrix.needsUpdate = true
    this.mesh.count = this.activeCount
  }

  // ────────────────────────────────────────────
  // setVisible – toggle mesh visibility
  // ────────────────────────────────────────────

  setVisible(visible: boolean): void {
    this.mesh.visible = visible
  }

  // ────────────────────────────────────────────
  // clear – reset the entire system
  // ────────────────────────────────────────────

  clear(): void {
    for (let i = 0; i < this.maxParticles; i++) {
      ;(this.particles as any)[i] = undefined
    }

    this.freeIndices.length = 0
    for (let i = 0; i < this.maxParticles; i++) {
      this.freeIndices.push(i)
    }

    this.activeCount = 0
    this.mesh.count = 0

    this.sizeAttr.needsUpdate = true
    this.alphaAttr.needsUpdate = true
    this.colorAttr.needsUpdate = true
    this.mesh.instanceMatrix.needsUpdate = true
  }

  // ────────────────────────────────────────────
  // dispose – release all GPU + CPU resources
  // ────────────────────────────────────────────

  dispose(): void {
    this.scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.ShaderMaterial).dispose()
    this.particles.length = 0
    this.freeIndices.length = 0
  }
}
