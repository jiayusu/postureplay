/**
 * 轻量粒子引擎 — 适用于掌中星辰能量粒子、脊柱能量上涌
 *
 * 无依赖，纯 Canvas 2D 绘制。
 */

export interface Particle {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
}

let _nextParticleId = 0

const PARTICLE_MAX_COUNT = 300

/**
 * 在原点周围生成一批粒子。
 *
 * @param count       生成数量
 * @param originX     原点 X
 * @param originY     原点 Y
 * @param spreadRadius 扩散半径
 * @param colors      颜色候选列表（随机选择）
 * @param maxLife     最大生命周期 (秒)
 * @param speed       初始速度系数
 */
export function spawnParticles(
  count: number,
  originX: number,
  originY: number,
  spreadRadius: number,
  colors: string[],
  maxLife: number,
  speed: number = 1,
): Particle[] {
  const particles: Particle[] = []
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const dist = Math.random() * spreadRadius
    const spd = (0.5 + Math.random()) * speed * 60
    particles.push({
      id: _nextParticleId++,
      x: originX + Math.cos(angle) * dist,
      y: originY + Math.sin(angle) * dist,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      life: Math.random() * maxLife,
      maxLife,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 1.5 + Math.random() * 3,
    })
  }
  return particles
}

/**
 * 更新粒子状态。移除死亡粒子。
 *
 * @param particles 当前粒子列表
 * @param dt        帧间隔 (秒)
 * @param gravity    重力系数 (向下为正)
 * @param maxCount  最大保留粒子数
 */
export function updateParticles(
  particles: Particle[],
  dt: number,
  gravity: number = 0,
  maxCount: number = PARTICLE_MAX_COUNT,
): Particle[] {
  const alive: Particle[] = []

  for (const p of particles) {
    p.life -= dt
    if (p.life <= 0) continue

    p.vy += gravity * dt * 60
    p.x += p.vx * dt
    p.y += p.vy * dt

    alive.push(p)
  }

  // 超出上限时淘汰最老粒子
  if (alive.length > maxCount) {
    alive.sort((a, b) => a.life - b.life)
    return alive.slice(alive.length - maxCount)
  }

  return alive
}

/**
 * 将粒子绘制到画布上。
 * 生命周期越接近结束，size 和 alpha 越低（淡出）。
 *
 * @param ctx       目标 2D 上下文
 * @param particles 粒子列表
 * @param glow      辉光模糊半径（0 则不添加辉光）
 */
export function renderParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  glow: number = 0,
): void {
  ctx.save()
  for (const p of particles) {
    const ratio = Math.max(0, p.life / p.maxLife)
    const alpha = ratio * 0.8

    ctx.globalAlpha = alpha
    if (glow > 0) {
      ctx.shadowColor = p.color
      ctx.shadowBlur = glow * ratio
    } else {
      ctx.shadowBlur = 0
    }

    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size * ratio, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
