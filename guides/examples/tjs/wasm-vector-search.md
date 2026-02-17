<!--{"section":"tjs","type":"example","group":"featured","order":1}-->

# Vector Search Benchmark

WASM SIMD vs scalar JavaScript cosine similarity

```tjs
/*#
# WASM SIMD Vector Search Benchmark

Compares **WASM SIMD** (f32x4) cosine similarity against **scalar JavaScript**
for vector search workloads. This is the core operation behind semantic search,
RAG pipelines, and embedding-based retrieval.

SIMD processes 4 vector dimensions per instruction using `f32x4_load`,
`f32x4_mul`, and `f32x4_add` — the same building blocks used in real
vector databases.

Click **Run Benchmark** to generate random vectors and measure throughput.
*/

// SIMD cosine similarity — processes 4 dimensions per iteration
function simdCosineSimilarity(vecA: Float32Array, vecB: Float32Array, len: 0) {
  wasm {
    let dotAcc = f32x4_splat(0.0)
    let magAAcc = f32x4_splat(0.0)
    let magBAcc = f32x4_splat(0.0)

    for (let i = 0; i < len; i += 4) {
      let off = i * 4
      let a = f32x4_load(vecA, off)
      let b = f32x4_load(vecB, off)

      dotAcc = f32x4_add(dotAcc, f32x4_mul(a, b))
      magAAcc = f32x4_add(magAAcc, f32x4_mul(a, a))
      magBAcc = f32x4_add(magBAcc, f32x4_mul(b, b))
    }

    // Horizontal sum: extract all 4 lanes
    let dot = f32x4_extract_lane(dotAcc, 0) + f32x4_extract_lane(dotAcc, 1)
            + f32x4_extract_lane(dotAcc, 2) + f32x4_extract_lane(dotAcc, 3)
    let magA = f32x4_extract_lane(magAAcc, 0) + f32x4_extract_lane(magAAcc, 1)
             + f32x4_extract_lane(magAAcc, 2) + f32x4_extract_lane(magAAcc, 3)
    let magB = f32x4_extract_lane(magBAcc, 0) + f32x4_extract_lane(magBAcc, 1)
             + f32x4_extract_lane(magBAcc, 2) + f32x4_extract_lane(magBAcc, 3)

    let mA = Math.sqrt(magA)
    let mB = Math.sqrt(magB)
    if (mA < 0.000001) { return 0.0 }
    if (mB < 0.000001) { return 0.0 }
    return dot / (mA * mB)
  } fallback {
    let dot = 0.0, magA = 0.0, magB = 0.0
    for (let i = 0; i < len; i++) {
      dot += vecA[i] * vecB[i]
      magA += vecA[i] * vecA[i]
      magB += vecB[i] * vecB[i]
    }
    magA = Math.sqrt(magA)
    magB = Math.sqrt(magB)
    if (magA === 0.0 || magB === 0.0) return 0.0
    return dot / (magA * magB)
  }
}

// Scalar JS cosine similarity (baseline)
function jsCosineSimilarity(vecA, vecB) {
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i]
    magA += vecA[i] * vecA[i]
    magB += vecB[i] * vecB[i]
  }
  magA = Math.sqrt(magA)
  magB = Math.sqrt(magB)
  if (magA === 0 || magB === 0) return 0
  return dot / (magA * magB)
}

// Generate random Float32Array vector
function randomVector(dim) {
  const v = new Float32Array(dim)
  for (let i = 0; i < dim; i++) v[i] = Math.random() * 2 - 1
  return v
}

// Canvas + UI
const canvas = document.createElement('canvas')
canvas.style.display = 'block'
canvas.style.width = '100%'
canvas.style.height = '100%'
canvas.style.position = 'absolute'
canvas.style.top = '0'
canvas.style.left = '0'
canvas.style.background = '#0a0a14'
document.body.appendChild(canvas)

const ctx = canvas.getContext('2d')
let width, height

function resize() {
  width = canvas.width = canvas.offsetWidth || 800
  height = canvas.height = canvas.offsetHeight || 600
}
resize()
window.addEventListener('resize', resize)

// Benchmark state
const configs = [
  { dim: 128, count: 10000, label: '10K x 128d' },
  { dim: 512, count: 10000, label: '10K x 512d' },
  { dim: 128, count: 100000, label: '100K x 128d' },
  { dim: 512, count: 100000, label: '100K x 512d' },
]
let results = []
let running = false
let currentConfig = -1

// Run a single benchmark config
async function runConfig(cfg) {
  // Generate corpus + query
  const corpus = []
  for (let i = 0; i < cfg.count; i++) corpus.push(randomVector(cfg.dim))
  const query = randomVector(cfg.dim)

  // Warm up
  for (let i = 0; i < Math.min(100, corpus.length); i++) {
    simdCosineSimilarity(query, corpus[i], cfg.dim)
    jsCosineSimilarity(query, corpus[i])
  }

  // Time SIMD
  const simdStart = performance.now()
  let simdBest = -1, simdBestIdx = 0
  for (let i = 0; i < corpus.length; i++) {
    const score = simdCosineSimilarity(query, corpus[i], cfg.dim)
    if (score > simdBest) { simdBest = score; simdBestIdx = i }
  }
  const simdTime = performance.now() - simdStart

  // Time JS
  const jsStart = performance.now()
  let jsBest = -1, jsBestIdx = 0
  for (let i = 0; i < corpus.length; i++) {
    const score = jsCosineSimilarity(query, corpus[i])
    if (score > jsBest) { jsBest = score; jsBestIdx = i }
  }
  const jsTime = performance.now() - jsStart

  return {
    label: cfg.label,
    simdTime,
    jsTime,
    speedup: jsTime / simdTime,
    match: simdBestIdx === jsBestIdx,
  }
}

async function runBenchmarks() {
  if (running) return
  running = true
  results = []
  for (let i = 0; i < configs.length; i++) {
    currentConfig = i
    draw()
    // Yield to allow rendering
    await new Promise(r => setTimeout(r, 50))
    results.push(await runConfig(configs[i]))
    draw()
  }
  currentConfig = -1
  running = false
  draw()
}

// Drawing
function draw() {
  ctx.fillStyle = '#0a0a14'
  ctx.fillRect(0, 0, width, height)

  const pad = 40
  const barAreaTop = 120
  const barAreaBottom = height - 80
  const barAreaHeight = barAreaBottom - barAreaTop

  // Title
  ctx.fillStyle = '#c0d8ff'
  ctx.font = 'bold 18px monospace'
  ctx.fillText('Vector Search: WASM SIMD vs JS Scalar', pad, 35)

  ctx.font = '12px monospace'
  ctx.fillStyle = '#6090c0'
  ctx.fillText('Cosine similarity over Float32Array embeddings', pad, 55)

  // Button
  const btnX = width - 180, btnY = 18, btnW = 150, btnH = 32
  ctx.fillStyle = running ? '#334' : '#2060a0'
  ctx.fillRect(btnX, btnY, btnW, btnH)
  ctx.fillStyle = '#fff'
  ctx.font = '13px monospace'
  ctx.fillText(running ? 'Running...' : 'Run Benchmark', btnX + 15, btnY + 21)

  if (results.length === 0 && !running) {
    ctx.fillStyle = '#4070a0'
    ctx.font = '14px monospace'
    ctx.fillText('Click "Run Benchmark" to start', pad, barAreaTop + 60)
    return
  }

  // Draw bars
  const numConfigs = configs.length
  const groupWidth = (width - pad * 2) / numConfigs
  const barWidth = groupWidth * 0.3

  // Find max time for scale
  let maxTime = 1
  for (const r of results) maxTime = Math.max(maxTime, r.simdTime, r.jsTime)

  for (let i = 0; i < numConfigs; i++) {
    const cx = pad + groupWidth * i + groupWidth / 2
    const r = results[i]

    // Label
    ctx.fillStyle = '#6090c0'
    ctx.font = '11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(configs[i].label, cx, barAreaBottom + 20)

    if (!r) {
      if (i === currentConfig) {
        ctx.fillStyle = '#3060a0'
        ctx.fillText('Running...', cx, barAreaTop + barAreaHeight / 2)
      }
      ctx.textAlign = 'left'
      continue
    }

    // SIMD bar (blue)
    const simdH = (r.simdTime / maxTime) * (barAreaHeight - 30)
    ctx.fillStyle = '#2070d0'
    ctx.fillRect(cx - barWidth - 2, barAreaBottom - simdH, barWidth, simdH)

    // JS bar (orange)
    const jsH = (r.jsTime / maxTime) * (barAreaHeight - 30)
    ctx.fillStyle = '#d07020'
    ctx.fillRect(cx + 2, barAreaBottom - jsH, barWidth, jsH)

    // Time labels
    ctx.font = '10px monospace'
    ctx.fillStyle = '#80b0e0'
    ctx.fillText(`${r.simdTime.toFixed(0)}ms`, cx - barWidth - 2, barAreaBottom - simdH - 5)
    ctx.fillStyle = '#e0a060'
    ctx.fillText(`${r.jsTime.toFixed(0)}ms`, cx + 2, barAreaBottom - jsH - 5)

    // Speedup
    ctx.font = 'bold 13px monospace'
    ctx.fillStyle = r.speedup >= 1 ? '#40d080' : '#d04040'
    ctx.fillText(`${r.speedup.toFixed(1)}x`, cx, barAreaBottom + 38)

    ctx.textAlign = 'left'
  }

  // Legend
  const legY = height - 30
  ctx.fillStyle = '#2070d0'
  ctx.fillRect(pad, legY, 14, 14)
  ctx.fillStyle = '#80b0e0'
  ctx.font = '11px monospace'
  ctx.fillText('SIMD', pad + 20, legY + 11)

  ctx.fillStyle = '#d07020'
  ctx.fillRect(pad + 80, legY, 14, 14)
  ctx.fillStyle = '#e0a060'
  ctx.fillText('JS Scalar', pad + 100, legY + 11)

  if (results.length === configs.length) {
    const avgSpeedup = results.reduce((s, r) => s + r.speedup, 0) / results.length
    ctx.fillStyle = '#40d080'
    ctx.font = 'bold 12px monospace'
    ctx.fillText(`Avg speedup: ${avgSpeedup.toFixed(1)}x`, pad + 220, legY + 11)
  }
}

// Click handler for button
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const btnX = width - 180, btnY = 18, btnW = 150, btnH = 32
  if (x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH) {
    runBenchmarks()
  }
})

draw()
```
