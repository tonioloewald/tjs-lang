<!--{"section":"tjs","type":"example","group":"featured","order":0}-->

# Starfield

Interactive space flythrough with SIMD-accelerated perspective rotation

```tjs
/*#
# Space Flythrough Demo

A Star Trek-style starfield with parallax depth, nebula clouds, and
**mouse-controlled steering** using WASM SIMD (f32x4) for perspective
rotation transforms on 50,000+ particles.

The `rotateParticles` function applies yaw/pitch rotations to all
particle positions using f32x4 SIMD intrinsics — processing 4 particles
per instruction. The scalar fallback does the same math one particle
at a time.

**Controls:**
- Move mouse **left/right** to steer (yaw)
- Move mouse **up/down** to pitch
- **Scroll wheel** or click to control speed
*/

// Configuration
const NUM_STARS = 50000
const NUM_NEBULA = 5000
const MAX_DEPTH = 1000
const BASE_SPEED = 8

// Particle arrays (Structure of Arrays — ideal for SIMD)
const starX = new Float32Array(NUM_STARS)
const starY = new Float32Array(NUM_STARS)
const starZ = new Float32Array(NUM_STARS)

const nebulaX = new Float32Array(NUM_NEBULA)
const nebulaY = new Float32Array(NUM_NEBULA)
const nebulaZ = new Float32Array(NUM_NEBULA)
const nebulaR = new Float32Array(NUM_NEBULA)
const nebulaG = new Float32Array(NUM_NEBULA)
const nebulaB = new Float32Array(NUM_NEBULA)

// Initialize stars
for (let i = 0; i < NUM_STARS; i++) {
  starX[i] = (Math.random() - 0.5) * 2000
  starY[i] = (Math.random() - 0.5) * 2000
  starZ[i] = Math.random() * MAX_DEPTH
}

// Initialize nebula
for (let i = 0; i < NUM_NEBULA; i++) {
  nebulaX[i] = (Math.random() - 0.5) * 1500
  nebulaY[i] = (Math.random() - 0.5) * 1500
  nebulaZ[i] = Math.random() * MAX_DEPTH
  nebulaR[i] = 0.3 + Math.random() * 0.7
  nebulaG[i] = 0.2 + Math.random() * 0.6
  nebulaB[i] = 0.4 + Math.random() * 0.6
}

// Move particles forward/back along Z
function moveParticles(xs: Float32Array, ys: Float32Array, zs: Float32Array, len: 0, speed: 0.0) {
  wasm {
    for (let i = 0; i < len; i++) {
      zs[i] -= speed
    }
  } fallback {
    for (let i = 0; i < len; i++) {
      zs[i] -= speed
    }
  }
}

// Rotate particles — SIMD accelerated (4 particles per instruction)
// Applies yaw (Y-axis) then pitch (X-axis) rotation
function rotateParticles(
  xs: Float32Array, ys: Float32Array, zs: Float32Array,
  len: 0, cosYaw: 0.0, sinYaw: 0.0, cosPitch: 0.0, sinPitch: 0.0
) {
  wasm {
    let vCosYaw = f32x4_splat(cosYaw)
    let vSinYaw = f32x4_splat(sinYaw)
    let vNegSinYaw = f32x4_neg(vSinYaw)
    let vCosPitch = f32x4_splat(cosPitch)
    let vSinPitch = f32x4_splat(sinPitch)
    let vNegSinPitch = f32x4_neg(vSinPitch)

    for (let i = 0; i < len; i += 4) {
      let off = i * 4

      let vx = f32x4_load(xs, off)
      let vy = f32x4_load(ys, off)
      let vz = f32x4_load(zs, off)

      // Yaw rotation (Y-axis): x' = x*cos + z*sin, z' = -x*sin + z*cos
      let nx = f32x4_add(f32x4_mul(vx, vCosYaw), f32x4_mul(vz, vSinYaw))
      let nz = f32x4_add(f32x4_mul(vx, vNegSinYaw), f32x4_mul(vz, vCosYaw))

      // Pitch rotation (X-axis): y' = y*cos - z*sin, z'' = y*sin + z*cos
      let ny = f32x4_add(f32x4_mul(vy, vCosPitch), f32x4_mul(nz, vNegSinPitch))
      let nz2 = f32x4_add(f32x4_mul(vy, vSinPitch), f32x4_mul(nz, vCosPitch))

      f32x4_store(xs, off, nx)
      f32x4_store(ys, off, ny)
      f32x4_store(zs, off, nz2)
    }
  } fallback {
    for (let i = 0; i < len; i++) {
      let x = xs[i], y = ys[i], z = zs[i]
      let nx = x * cosYaw + z * sinYaw
      let nz = -x * sinYaw + z * cosYaw
      let ny = y * cosPitch - nz * sinPitch
      let nz2 = y * sinPitch + nz * cosPitch
      xs[i] = nx
      ys[i] = ny
      zs[i] = nz2
    }
  }
}

// Respawn stars that passed camera or went too far
function respawnStars(xs, ys, zs, len, maxDepth) {
  for (let i = 0; i < len; i++) {
    if (zs[i] < 1 || zs[i] > maxDepth) {
      if (zs[i] < 1) {
        zs[i] = maxDepth * (0.7 + Math.random() * 0.3)
      } else {
        zs[i] = 10 + Math.random() * 50
      }
      xs[i] = (Math.random() - 0.5) * 2000
      ys[i] = (Math.random() - 0.5) * 2000
    }
  }
}

// Respawn nebula
function respawnNebula(xs, ys, zs, len, maxDepth) {
  for (let i = 0; i < len; i++) {
    if (zs[i] < 1 || zs[i] > maxDepth) {
      if (zs[i] < 1) {
        zs[i] = maxDepth * (0.5 + Math.random() * 0.5)
      } else {
        zs[i] = 50 + Math.random() * 100
      }
      xs[i] = (Math.random() - 0.5) * 1500
      ys[i] = (Math.random() - 0.5) * 1500
    }
  }
}

// Canvas setup
const canvas = document.createElement('canvas')
canvas.style.background = '#000'
canvas.style.display = 'block'
canvas.style.cursor = 'crosshair'
canvas.style.width = '100%'
canvas.style.height = '100%'
canvas.style.position = 'absolute'
canvas.style.top = '0'
canvas.style.left = '0'

const ctx = canvas.getContext('2d')

let width, height, halfW, halfH, fov

function resize() {
  width = canvas.width = canvas.offsetWidth || 800
  height = canvas.height = canvas.offsetHeight || 500
  halfW = width / 2
  halfH = height / 2
  fov = width * 0.7
}

document.body.appendChild(canvas)
resize()
window.addEventListener('resize', resize)

// Mouse state — position controls steering, scroll controls speed
let mouseX = 0.5, mouseY = 0.5
let speedMultiplier = 1.0

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect()
  mouseX = (e.clientX - rect.left) / width
  mouseY = (e.clientY - rect.top) / height
})

canvas.addEventListener('wheel', (e) => {
  e.preventDefault()
  speedMultiplier = Math.max(0.1, Math.min(4.0, speedMultiplier - e.deltaY * 0.002))
}, { passive: false })

canvas.addEventListener('click', () => {
  speedMultiplier = speedMultiplier > 0.5 ? 0.0 : 1.0
})

// FPS tracking
let frameCount = 0
let fps = 0
let lastFpsTime = performance.now()

function animate() {
  frameCount++
  const now = performance.now()
  if (now - lastFpsTime > 1000) {
    fps = frameCount
    frameCount = 0
    lastFpsTime = now
  }

  // Steering from mouse position (small rotation per frame)
  const yaw = (mouseX - 0.5) * 0.015
  const pitch = (mouseY - 0.5) * 0.015
  const cosYaw = Math.cos(yaw)
  const sinYaw = Math.sin(yaw)
  const cosPitch = Math.cos(pitch)
  const sinPitch = Math.sin(pitch)

  const speed = BASE_SPEED * speedMultiplier

  // Clear
  ctx.fillStyle = '#08080f'
  ctx.fillRect(0, 0, width, height)

  // Rotate particles (SIMD: 4 at a time)
  rotateParticles(starX, starY, starZ, NUM_STARS, cosYaw, sinYaw, cosPitch, sinPitch)
  rotateParticles(nebulaX, nebulaY, nebulaZ, NUM_NEBULA, cosYaw, sinYaw, cosPitch, sinPitch)

  // Move forward/back
  moveParticles(nebulaX, nebulaY, nebulaZ, NUM_NEBULA, speed * 0.25)
  respawnNebula(nebulaX, nebulaY, nebulaZ, NUM_NEBULA, MAX_DEPTH)
  moveParticles(starX, starY, starZ, NUM_STARS, speed)
  respawnStars(starX, starY, starZ, NUM_STARS, MAX_DEPTH)

  // Draw nebula (behind stars)
  for (let i = 0; i < NUM_NEBULA; i++) {
    const z = nebulaZ[i]
    if (z < 1) continue

    const x = (nebulaX[i] / z) * fov + halfW
    const y = (nebulaY[i] / z) * fov + halfH

    if (x < -100 || x > width + 100 || y < -100 || y > height + 100) continue

    const depth = 1 - z / MAX_DEPTH
    const alpha = depth * depth * 0.08
    const size = depth * 60 + 30

    const r = Math.floor(nebulaR[i] * 255)
    const g = Math.floor(nebulaG[i] * 255)
    const b = Math.floor(nebulaB[i] * 255)

    const gradient = ctx.createRadialGradient(x, y, 0, x, y, size)
    gradient.addColorStop(0, `rgba(${r},${g},${b},${alpha})`)
    gradient.addColorStop(0.5, `rgba(${r},${g},${b},${alpha * 0.3})`)
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(x, y, size, 0, Math.PI * 2)
    ctx.fill()
  }

  // Draw stars
  for (let i = 0; i < NUM_STARS; i++) {
    const z = starZ[i]
    if (z < 1) continue

    const x = (starX[i] / z) * fov + halfW
    const y = (starY[i] / z) * fov + halfH

    if (x < 0 || x > width || y < 0 || y > height) continue

    const depth = 1 - z / MAX_DEPTH
    const brightness = depth * depth
    const size = brightness * 2 + 0.5

    const c = Math.floor(180 + brightness * 75)
    ctx.fillStyle = `rgba(${c},${c},255,${0.6 + brightness * 0.4})`
    ctx.beginPath()
    ctx.arc(x, y, size, 0, Math.PI * 2)
    ctx.fill()

    if (brightness > 0.5) {
      ctx.fillStyle = `rgba(220,230,255,${(brightness - 0.5) * 0.4})`
      ctx.beginPath()
      ctx.arc(x, y, size * 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Vignette
  const vignette = ctx.createRadialGradient(halfW, halfH, height * 0.3, halfW, halfH, height * 0.8)
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(0,0,0,0.4)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, width, height)

  // HUD
  ctx.fillStyle = 'rgba(100,180,255,0.5)'
  ctx.font = '11px monospace'
  const simdLabel = typeof globalThis.__tjs_wasm_0 === 'function' ? 'SIMD' : 'JS'
  ctx.fillText(`FPS: ${fps} | ${simdLabel} | Stars: ${NUM_STARS.toLocaleString()} | Speed: ${speedMultiplier.toFixed(1)}x`, 10, 18)
  ctx.fillText('Steer: mouse | Speed: scroll/click', 10, height - 10)

  requestAnimationFrame(animate)
}

animate()
```
