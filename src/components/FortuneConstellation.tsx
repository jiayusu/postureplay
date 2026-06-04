/**
 * FortuneConstellation — 运势星座粒子爆发效果
 *
 * 当「解读运势」按钮点击后，在全屏展示金色星座粒子：
 *   - 粒子从屏幕中心向外爆发
 *   - 随机形成星座连线（三角/四角星）
 *   - 粒子渐隐 → 收缩回中心
 *   - 生命周期 ~5s，自动销毁
 */
import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'

interface Star {
  pos: THREE.Vector3
  vel: THREE.Vector3
  life: number       // 0→1→0
  size: number
  hue: number        // 0.08~0.18 (金~橙)
}

interface ConstelLine {
  a: number          // 粒子索引
  b: number
  opacity: number
}

const STAR_COUNT = 80
const LINE_COUNT = 25

export const FortuneConstellation: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // ── Three.js 初始化 ──
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)

    const w = canvas.clientWidth
    const h = canvas.clientHeight
    renderer.setSize(w, h, false)

    const camera = new THREE.OrthographicCamera(0, w, h, 0, -10, 10)
    const scene = new THREE.Scene()

    // ── 粒子 ──
    const stars: Star[] = []
    const cx = w / 2
    const cy = h / 2

    for (let i = 0; i < STAR_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 60 + Math.random() * 200

      stars.push({
        pos: new THREE.Vector3(cx, cy, 0),
        vel: new THREE.Vector3(
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          0,
        ),
        life: 0,        // 从 0 开始渐入
        size: 1 + Math.random() * 5,
        hue: 0.1 + Math.random() * 0.08,
      })
    }

    // 星座连线
    const lines: ConstelLine[] = []
    for (let i = 0; i < LINE_COUNT; i++) {
      const a = Math.floor(Math.random() * STAR_COUNT)
      let b = Math.floor(Math.random() * STAR_COUNT)
      while (b === a) b = Math.floor(Math.random() * STAR_COUNT)
      lines.push({ a: b > a ? a : b, b: b > a ? b : a, opacity: 0.2 + Math.random() * 0.5 })
    }

    // ── Points 几何 ──
    const geo = new THREE.BufferGeometry()
    const posAttr = new Float32Array(STAR_COUNT * 3)
    const sizeAttr = new Float32Array(STAR_COUNT)
    const hueAttr = new Float32Array(STAR_COUNT)
    geo.setAttribute('position', new THREE.BufferAttribute(posAttr, 3))
    geo.setAttribute('size', new THREE.BufferAttribute(sizeAttr, 1))
    geo.setAttribute('hue', new THREE.BufferAttribute(hueAttr, 1))

    // ── 光晕点 ──
    const pointsMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute float hue;
        varying float vSize;
        varying float vHue;
        varying vec3 vColor;

        vec3 hsl2rgb(float h, float s, float l) {
          vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0.0,4.0,2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
          return l + s * (rgb - 0.5) * (1.0 - abs(2.0 * l - 1.0));
        }

        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (200.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
          vSize = size;
          vHue = hue;
          vColor = hsl2rgb(hue, 0.9, 0.55);
        }`,
      fragmentShader: /* glsl */ `
        varying float vSize;
        varying float vHue;
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float glow = exp(-d * d * 2.5);
          float crisp = smoothstep(0.0, 0.6, 1.0 - d);
          float alpha = glow * crisp * 0.8;
          if (alpha < 0.02) discard;

          // 四角星芒
          float angle = atan(gl_PointCoord.y - 0.5, gl_PointCoord.x - 0.5);
          float spike = abs(sin(angle * 2.0));
          float star = 1.0 - smoothstep(0.3, 0.7, d) * (1.0 - spike * 0.6);

          gl_FragColor = vec4(vColor * star * 1.3, alpha);
        }`,
      depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending,
      transparent: true,
    })

    const points = new THREE.Points(geo, pointsMat)
    scene.add(points)

    // ── 连线 ──
    const lineGeo = new THREE.BufferGeometry()
    const linePosArr = new Float32Array(LINE_COUNT * 6)
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePosArr, 3))

    const lineMat = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `void main() { gl_FragColor = vec4(0.95, 0.7, 0.2, 0.15); }`,
      depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending,
      transparent: true,
    })
    const lineMesh = new THREE.LineSegments(lineGeo, lineMat)
    scene.add(lineMesh)

    // ── 动画循环 ──
    let elapsed = 0
    let animId = 0
    const DURATION = 5.0       // 总生命周期
    const EXPAND_END = 1.5     // 爆发阶段结束
    const SHRINK_START = 3.5   // 收缩阶段开始

    const loop = (dt: number) => {
      animId = requestAnimationFrame(loop)
      elapsed += dt

      const t = elapsed / DURATION

      // 更新粒子
      for (let i = 0; i < STAR_COUNT; i++) {
        const s = stars[i]

        if (elapsed < EXPAND_END) {
          // 爆发阶段：life 0→1
          s.life = Math.min(1, elapsed / EXPAND_END)
          const expandT = s.life
          s.pos.x = cx + s.vel.x * expandT * (0.5 + expandT * 0.5)
          s.pos.y = cy + s.vel.y * expandT * (0.5 + expandT * 0.5)
        } else if (elapsed < SHRINK_START) {
          // 悬浮阶段
          s.life = 1.0
        } else {
          // 收缩阶段
          s.life = Math.max(0, 1 - (elapsed - SHRINK_START) / (DURATION - SHRINK_START))
          const shrinkT = 1 - s.life
          s.pos.x = cx + (s.pos.x - cx) * (1 - shrinkT)
          s.pos.y = cy + (s.pos.y - cy) * (1 - shrinkT)
        }

        const i3 = i * 3
        posAttr[i3] = s.pos.x
        posAttr[i3 + 1] = s.pos.y
        sizeAttr[i] = s.size * s.life * (1 + Math.sin(elapsed * 4 + i * 0.7) * 0.2)
        hueAttr[i] = s.hue
      }
      geo.attributes.position.needsUpdate = true
      geo.attributes.size.needsUpdate = true

      // 更新连线（仅活跃阶段）
      if (elapsed < SHRINK_START + 0.5) {
        for (let i = 0; i < LINE_COUNT; i++) {
          const l = lines[i]
          const a = stars[l.a].pos
          const b = stars[l.b].pos
          const i6 = i * 6
          linePosArr[i6] = a.x; linePosArr[i6 + 1] = a.y; linePosArr[i6 + 2] = 0
          linePosArr[i6 + 3] = b.x; linePosArr[i6 + 4] = b.y; linePosArr[i6 + 5] = 0
        }
        lineMesh.visible = true
        lineMat.opacity = 0.15 * Math.min(1, elapsed / 0.5) * stars[0].life
      } else {
        lineMesh.visible = false
      }
      lineGeo.attributes.position.needsUpdate = true

      points.material.opacity = Math.min(1, elapsed / 0.3) * stars[0].life
      pointsMat.uniforms.uTime.value = elapsed

      renderer.render(scene, camera)

      if (t >= 1) {
        cancelAnimationFrame(animId)
        // 销毁
        geo.dispose()
        pointsMat.dispose()
        lineGeo.dispose()
        lineMat.dispose()
        renderer.dispose()
      }
    }

    animId = requestAnimationFrame(loop)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-[20] pointer-events-none"
      style={{ width: '100%', height: '100%' }}
    />
  )
}

export default FortuneConstellation
