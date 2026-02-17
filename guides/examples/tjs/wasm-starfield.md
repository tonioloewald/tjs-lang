<!--{"section":"tjs","type":"example","group":"featured","order":0}-->

# Starfield

Interactive space flythrough with parallax stars and nebula clouds. Uses `wasmBuffer()` for zero-copy WASM memory and SIMD-accelerated particle movement.

```tjs
/*#
# Space Flythrough Demo

A Star Trek-style starfield with parallax depth and nebula clouds.
Uses `wasmBuffer()` to allocate particle arrays directly in WASM memory —
no copy-in/copy-out overhead. SIMD processes 4 particles per instruction.

**Controls:**
- Move mouse **left/right** to steer laterally
- Move mouse **up/down** to steer vertically
- **Scroll wheel** to control speed
- **Click** to pause/resume
*/

// Configuration
const NUM_STARS = 50000
const NUM_NEBULA = 5000
const MAX_DEPTH = 1000
const BASE_SPEED = 8

// Particle arrays in WASM memory (zero-copy when passed to wasm blocks)
const starX = wasmBuffer(Float32Array, NUM_STARS)
const starY = wasmBuffer(Float32Array, NUM_STARS)
const starZ = wasmBuffer(Float32Array, NUM_STARS)

const nebulaX = wasmBuffer(Float32Array, NUM_NEBULA)
const nebulaY = wasmBuffer(Float32Array, NUM_NEBULA)
const nebulaZ = wasmBuffer(Float32Array, NUM_NEBULA)
const nebulaR = new Float32Array(NUM_NEBULA)
const nebulaG = new Float32Array(NUM_NEBULA)
const nebulaB = new Float32Array(NUM_NEBULA)

// Initialize stars
for (let i = 0; i < NUM_STARS; i++) {
  starX[i] = (Math.random() - 0.5) * 2000
  starY[i] = (Math.random() - 0.5) * 2000
  starZ[i] = Math.random() * MAX_DEPTH
}

// Initialize nebula with random positions and colors
for (let i = 0; i < NUM_NEBULA; i++) {
  nebulaX[i] = (Math.random() - 0.5) * 1500
  nebulaY[i] = (Math.random() - 0.5) * 1500
  nebulaZ[i] = Math.random() * MAX_DEPTH
  nebulaR[i] = 0.3 + Math.random() * 0.7
  nebulaG[i] = 0.2 + Math.random() * 0.6
  nebulaB[i] = 0.4 + Math.random() * 0.6
}

// Move particles — SIMD accelerated with wasmBuffer (zero-copy)
// Moves along Z (forward) and applies XY drift from steering
function moveParticles(! xs: Float32Array, ys: Float32Array, zs: Float32Array, len: 0, dx: 0.0, dy: 0.0, dz: 0.0) {
  wasm {
    let vdx = f32x4_splat(dx)
    let vdy = f32x4_splat(dy)
    let vdz = f32x4_splat(dz)
    for (let i = 0; i < len; i += 4) {
      let off = i * 4
      f32x4_store(xs, off, f32x4_add(f32x4_load(xs, off), vdx))
      f32x4_store(ys, off, f32x4_add(f32x4_load(ys, off), vdy))
      f32x4_store(zs, off, f32x4_sub(f32x4_load(zs, off), vdz))
    }
  } fallback {
    for (let i = 0; i < len; i++) {
      xs[i] += dx
      ys[i] += dy
      zs[i] -= dz
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

// Respawn nebula particles
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

// Create canvas
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

  const speed = BASE_SPEED * speedMultiplier
  // Steering: mouse offset from center generates lateral drift
  const dx = (mouseX - 0.5) * speed * 3
  const dy = (mouseY - 0.5) * speed * 3

  // Clear
  ctx.fillStyle = '#08080f'
  ctx.fillRect(0, 0, width, height)

  // Update particles
  moveParticles(starX, starY, starZ, NUM_STARS, dx, dy, speed)
  respawnStars(starX, starY, starZ, NUM_STARS, MAX_DEPTH)
  moveParticles(nebulaX, nebulaY, nebulaZ, NUM_NEBULA, dx * 0.25, dy * 0.25, speed * 0.25)
  respawnNebula(nebulaX, nebulaY, nebulaZ, NUM_NEBULA, MAX_DEPTH)

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

  // Subtle vignette
  const vignette = ctx.createRadialGradient(halfW, halfH, height * 0.3, halfW, halfH, height * 0.8)
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(0,0,0,0.4)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, width, height)

  // HUD
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 16px monospace'
  const simdLabel = typeof globalThis.__tjs_wasm_0 === 'function' ? 'SIMD' : 'JS'
  ctx.fillText(`FPS: ${fps} | ${simdLabel} | Stars: ${NUM_STARS.toLocaleString()} | Speed: ${speedMultiplier.toFixed(1)}x`, 10, 24)
  ctx.font = '14px monospace'
  ctx.fillText('Steer: mouse | Speed: scroll/click', 10, height - 12)

  requestAnimationFrame(animate)
}

animate()
```
