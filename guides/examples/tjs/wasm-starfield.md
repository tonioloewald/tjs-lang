<!--{"section":"tjs","type":"example","group":"featured","order":0}-->

# Starfield

Interactive space flythrough with parallax stars and nebula clouds

```tjs
/*#
# Space Flythrough Demo

A Star Trek-style starfield with parallax depth and nebula clouds.
Particle position updates use `wasm { } fallback { }` blocks.

**Note:** This is a proof-of-concept for the WASM compilation pipeline.
Without SIMD, scalar WASM operations show no meaningful speedup vs JS JIT.
SIMD support (v128) is planned, which will enable real performance gains
for workloads like vector search, audio processing, and physics.

**Controls:**
- Mouse up = fast forward
- Mouse down = slow/reverse
- Toggle **WASM** to compare (similar performance expected)
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

// Initialize nebula with random positions and colors
for (let i = 0; i < NUM_NEBULA; i++) {
  nebulaX[i] = (Math.random() - 0.5) * 1500
  nebulaY[i] = (Math.random() - 0.5) * 1500
  nebulaZ[i] = Math.random() * MAX_DEPTH
  // Random pastel-ish colors
  nebulaR[i] = 0.3 + Math.random() * 0.7
  nebulaG[i] = 0.2 + Math.random() * 0.6
  nebulaB[i] = 0.4 + Math.random() * 0.6
}

// Move particles - WASM accelerated (just motion, no respawn)
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

// Respawn stars that passed camera or went too far (JS only - needs Math.random)
function respawnStars(xs, ys, zs, len, maxDepth) {
  for (let i = 0; i < len; i++) {
    if (zs[i] < 1 || zs[i] > maxDepth) {
      // Respawn at opposite end depending on direction
      if (zs[i] < 1) {
        // Passed camera - respawn at back
        zs[i] = maxDepth * (0.7 + Math.random() * 0.3)
      } else {
        // Too far (going backwards) - respawn near camera
        zs[i] = 10 + Math.random() * 50
      }
      xs[i] = (Math.random() - 0.5) * 2000
      ys[i] = (Math.random() - 0.5) * 2000
    }
  }
}

// Respawn nebula particles (JS only)
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

// Mouse state - vertical position controls speed
let speedMultiplier = 1.0

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect()
  const mouseY = (e.clientY - rect.top) / height
  // Top = fast forward, bottom = reverse
  speedMultiplier = 2.0 - mouseY * 3.0
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

  // Speed from mouse position
  const speed = BASE_SPEED * speedMultiplier

  // Clear
  ctx.fillStyle = '#08080f'
  ctx.fillRect(0, 0, width, height)

  // Update particles - WASM handles motion, JS handles respawn
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
  ctx.fillText(`FPS: ${fps} | Stars: ${NUM_STARS.toLocaleString()} | Nebulae: ${NUM_NEBULA.toLocaleString()}`, 10, 18)
  ctx.fillText('Mouse up/down to control speed', 10, height - 10)

  requestAnimationFrame(animate)
}

animate()
```
