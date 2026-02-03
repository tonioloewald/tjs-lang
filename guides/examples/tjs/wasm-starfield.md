<!--{"section":"tjs","type":"example","group":"featured","order":0}-->

# Starfield

Interactive space flythrough with parallax stars and nebula clouds

```tjs
/*#
# Space Flythrough Demo

A Star Trek-style starfield with parallax depth and nebula clouds.
Particle position updates use `wasm { } fallback { }` blocks.

**Controls:**
- Move mouse left/right to steer
- Mouse up/down to control speed
- Toggle the **WASM** checkbox to compare WASM vs JS fallback
*/

// Configuration - high particle count to stress test WASM vs JS
const NUM_STARS = 50000
const NUM_NEBULA = 5000
const MAX_DEPTH = 1000
const BASE_SPEED = 12

// Particle arrays (passed to WASM)
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

// Initialize nebula clusters
const clusters = [
  { cx: -200, cy: 100, r: 0.8, g: 0.2, b: 0.6 },
  { cx: 300, cy: -150, r: 0.2, g: 0.5, b: 0.9 },
  { cx: -100, cy: -200, r: 0.9, g: 0.4, b: 0.2 },
  { cx: 200, cy: 200, r: 0.3, g: 0.8, b: 0.5 },
]

for (let i = 0; i < NUM_NEBULA; i++) {
  const cluster = clusters[i % clusters.length]
  const spread = 200
  nebulaX[i] = cluster.cx + (Math.random() - 0.5) * spread * 2
  nebulaY[i] = cluster.cy + (Math.random() - 0.5) * spread * 2
  nebulaZ[i] = Math.random() * MAX_DEPTH
  nebulaR[i] = Math.min(1, Math.max(0, cluster.r + (Math.random() - 0.5) * 0.3))
  nebulaG[i] = Math.min(1, Math.max(0, cluster.g + (Math.random() - 0.5) * 0.3))
  nebulaB[i] = Math.min(1, Math.max(0, cluster.b + (Math.random() - 0.5) * 0.3))
}

// Move particles - WASM accelerated (just motion, no respawn)
function moveParticles(xs: Float32Array, ys: Float32Array, zs: Float32Array, len: 0, speed: 0.0, driftX: 0.0, driftY: 0.0) {
  wasm {
    for (let i = 0; i < len; i++) {
      zs[i] -= speed
      xs[i] += driftX
      ys[i] += driftY
    }
  } fallback {
    for (let i = 0; i < len; i++) {
      zs[i] -= speed
      xs[i] += driftX
      ys[i] += driftY
    }
  }
}

// Respawn stars that passed camera (JS only - needs Math.random)
function respawnStars(xs, ys, zs, len, maxDepth) {
  for (let i = 0; i < len; i++) {
    if (zs[i] < 1) {
      // Respawn at back with random Z for natural distribution
      zs[i] = maxDepth * (0.7 + Math.random() * 0.3)
      xs[i] = (Math.random() - 0.5) * 2000
      ys[i] = (Math.random() - 0.5) * 2000
    }
  }
}

// Respawn nebula particles (JS only)
function respawnNebula(xs, ys, zs, len, maxDepth) {
  for (let i = 0; i < len; i++) {
    if (zs[i] < 1) {
      // Respawn with varied Z so nebulae appear at different depths
      zs[i] = maxDepth * (0.5 + Math.random() * 0.5)
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

// Dynamic sizing
let width, height, halfW, halfH, fov

function resize() {
  width = canvas.width = canvas.offsetWidth || 800
  height = canvas.height = canvas.offsetHeight || 500
  halfW = width / 2
  halfH = height / 2
  fov = width * 0.7
}

// Add canvas to document first so offsetWidth/Height work
document.body.appendChild(canvas)

resize()
window.addEventListener('resize', resize)

// Mouse state
let mouseX = halfW
let mouseY = halfH

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect()
  mouseX = e.clientX - rect.left
  mouseY = e.clientY - rect.top
})

// FPS tracking
let frameCount = 0
let fps = 0
let lastFpsTime = performance.now()

// Animation
function animate() {
  // FPS
  frameCount++
  const now = performance.now()
  if (now - lastFpsTime > 1000) {
    fps = frameCount
    frameCount = 0
    lastFpsTime = now
  }

  // Speed and drift from mouse
  const speed = BASE_SPEED + (halfH - mouseY) * 0.08
  const driftX = (mouseX - halfW) * 0.015
  const driftY = (mouseY - halfH) * 0.008

  // Clear
  ctx.fillStyle = '#08080f'
  ctx.fillRect(0, 0, width, height)

  // Update particles - WASM handles motion, JS handles respawn
  moveParticles(nebulaX, nebulaY, nebulaZ, NUM_NEBULA, speed * 0.25, driftX * 0.3, driftY * 0.3)
  respawnNebula(nebulaX, nebulaY, nebulaZ, NUM_NEBULA, MAX_DEPTH)
  moveParticles(starX, starY, starZ, NUM_STARS, speed, driftX, driftY)
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

    // Brighter stars
    const c = Math.floor(180 + brightness * 75)
    ctx.fillStyle = `rgba(${c},${c},255,${0.6 + brightness * 0.4})`
    ctx.beginPath()
    ctx.arc(x, y, size, 0, Math.PI * 2)
    ctx.fill()

    // Glow for close stars
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
  ctx.fillStyle = 'rgba(100,180,255,0.5)'
  ctx.font = '11px monospace'
  ctx.fillText(`FPS: ${fps} | Stars: ${NUM_STARS} | Nebulae: ${NUM_NEBULA}`, 10, 18)
  ctx.fillText('Move mouse to steer', 10, height - 10)

  // Crosshair
  ctx.strokeStyle = 'rgba(100,180,255,0.25)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(halfW, halfH, 15, 0, Math.PI * 2)
  ctx.moveTo(halfW - 25, halfH)
  ctx.lineTo(halfW - 10, halfH)
  ctx.moveTo(halfW + 10, halfH)
  ctx.lineTo(halfW + 25, halfH)
  ctx.moveTo(halfW, halfH - 25)
  ctx.lineTo(halfW, halfH - 10)
  ctx.moveTo(halfW, halfH + 10)
  ctx.lineTo(halfW, halfH + 25)
  ctx.stroke()

  requestAnimationFrame(animate)
}

animate()
```
