<!--{"section":"tjs","type":"example","group":"featured","order":1}-->

# Vector Search Benchmark

WASM SIMD vs scalar JavaScript cosine similarity

```tjs
/*#
# WASM SIMD Vector Search Benchmark

Compares **WASM SIMD** (f32x4) cosine similarity against **scalar JavaScript**
for vector search workloads. This is the core operation behind semantic search,
RAG pipelines, and embedding-based retrieval.

The corpus is packed into a single `wasmBuffer` — zero-copy shared memory
between JS and WASM. The SIMD search kernel processes 4 vector dimensions
per instruction and loops over the entire corpus in one WASM call.

Click **Run Benchmark** to generate random vectors and measure throughput.
*/

// SIMD corpus search — single WASM call over entire corpus
// corpus is a flat Float32Array of count*dim elements
// Returns the index of the most similar vector
function simdSearch(corpus: Float32Array, query: Float32Array, count: 0, dim: 0) {
  return wasm {
    let bestIdx = 0
    let bestScore = -1.0

    for (let v = 0; v < count; v++) {
      let dotAcc = f32x4_splat(0.0)
      let magAAcc = f32x4_splat(0.0)
      let magBAcc = f32x4_splat(0.0)

      for (let j = 0; j < dim; j += 4) {
        let qOff = j * 4
        let cOff = (v * dim + j) * 4
        let a = f32x4_load(query, qOff)
        let b = f32x4_load(corpus, cOff)
        dotAcc = f32x4_add(dotAcc, f32x4_mul(a, b))
        magAAcc = f32x4_add(magAAcc, f32x4_mul(a, a))
        magBAcc = f32x4_add(magBAcc, f32x4_mul(b, b))
      }

      let dot = f32x4_extract_lane(dotAcc, 0) + f32x4_extract_lane(dotAcc, 1)
              + f32x4_extract_lane(dotAcc, 2) + f32x4_extract_lane(dotAcc, 3)
      let magA = f32x4_extract_lane(magAAcc, 0) + f32x4_extract_lane(magAAcc, 1)
               + f32x4_extract_lane(magAAcc, 2) + f32x4_extract_lane(magAAcc, 3)
      let magB = f32x4_extract_lane(magBAcc, 0) + f32x4_extract_lane(magBAcc, 1)
               + f32x4_extract_lane(magBAcc, 2) + f32x4_extract_lane(magBAcc, 3)

      let mA = Math.sqrt(magA)
      let mB = Math.sqrt(magB)
      if (mA > 0.000001) {
        if (mB > 0.000001) {
          let score = dot / (mA * mB)
          if (score > bestScore) {
            bestScore = score
            bestIdx = v
          }
        }
      }
    }
    return bestIdx
  } fallback {
    let bestIdx = 0
    let bestScore = -1
    for (let v = 0; v < count; v++) {
      let dot = 0, magA = 0, magB = 0
      for (let j = 0; j < dim; j++) {
        let ci = v * dim + j
        dot += query[j] * corpus[ci]
        magA += query[j] * query[j]
        magB += corpus[ci] * corpus[ci]
      }
      magA = Math.sqrt(magA)
      magB = Math.sqrt(magB)
      if (magA > 0 && magB > 0) {
        let score = dot / (magA * magB)
        if (score > bestScore) { bestScore = score; bestIdx = v }
      }
    }
    return bestIdx
  }
}

// Scalar JS search (baseline)
function jsSearch(corpus, query, count, dim) {
  let bestIdx = 0, bestScore = -1
  for (let v = 0; v < count; v++) {
    let dot = 0, magA = 0, magB = 0
    for (let j = 0; j < dim; j++) {
      const ci = v * dim + j
      dot += query[j] * corpus[ci]
      magA += query[j] * query[j]
      magB += corpus[ci] * corpus[ci]
    }
    magA = Math.sqrt(magA)
    magB = Math.sqrt(magB)
    if (magA > 0 && magB > 0) {
      const score = dot / (magA * magB)
      if (score > bestScore) { bestScore = score; bestIdx = v }
    }
  }
  return bestIdx
}

// UI setup
const container = document.createElement('div')
container.style.cssText = 'font-family:monospace;color:#c0d8ff;background:#0a0a14;padding:24px;position:absolute;inset:0;overflow:auto'
document.body.appendChild(container)

const title = document.createElement('h2')
title.textContent = 'Vector Search: WASM SIMD vs JS Scalar'
title.style.cssText = 'margin:0 0 4px 0;font-size:18px'
container.appendChild(title)

const subtitle = document.createElement('div')
subtitle.textContent = 'Cosine similarity over Float32Array embeddings (wasmBuffer = zero-copy)'
subtitle.style.cssText = 'color:#6090c0;font-size:12px;margin-bottom:16px'
container.appendChild(subtitle)

const btn = document.createElement('button')
btn.textContent = 'Run Benchmark'
btn.style.cssText = 'background:#2060a0;color:#fff;border:none;padding:8px 20px;font:bold 14px monospace;cursor:pointer;margin-bottom:16px'
container.appendChild(btn)

const status = document.createElement('div')
status.style.cssText = 'color:#6090c0;margin-bottom:12px;font-size:13px'
container.appendChild(status)

const table = document.createElement('table')
table.style.cssText = 'border-collapse:collapse;width:100%;max-width:700px'
container.appendChild(table)

const configs = [
  { dim: 128, count: 10000, label: '10K x 128d' },
  { dim: 256, count: 10000, label: '10K x 256d' },
  { dim: 512, count: 10000, label: '10K x 512d' },
  { dim: 128, count: 50000, label: '50K x 128d' },
]

// Pre-allocate max-sized buffers once (bump allocator never frees)
// Largest config: 50K x 128d = 6.4M floats = 25.6MB
const MAX_CORPUS = 50000 * 128
const MAX_DIM = 512
const corpus = wasmBuffer(Float32Array, MAX_CORPUS)
const query = wasmBuffer(Float32Array, MAX_DIM)

function renderTable(results) {
  const cellStyle = 'padding:8px 12px;border-bottom:1px solid #1a2a3a;text-align:right'
  const headerStyle = cellStyle + ';color:#6090c0;text-align:right;font-weight:bold'
  const labelStyle = cellStyle + ';text-align:left;color:#c0d8ff'

  let html = '<tr>'
  html += `<th style="${headerStyle};text-align:left">Config</th>`
  html += `<th style="${headerStyle}">SIMD (ms)</th>`
  html += `<th style="${headerStyle}">JS (ms)</th>`
  html += `<th style="${headerStyle}">Speedup</th>`
  html += `<th style="${headerStyle}">Match</th>`
  html += '</tr>'

  for (const r of results) {
    const color = r.speedup >= 1 ? '#40d080' : '#d04040'
    html += '<tr>'
    html += `<td style="${labelStyle}">${r.label}</td>`
    html += `<td style="${cellStyle};color:#80b0e0">${r.simdTime.toFixed(1)}</td>`
    html += `<td style="${cellStyle};color:#e0a060">${r.jsTime.toFixed(1)}</td>`
    html += `<td style="${cellStyle};color:${color};font-weight:bold">${r.speedup.toFixed(2)}x</td>`
    html += `<td style="${cellStyle};color:${r.match ? '#40d080' : '#d04040'}">${r.match ? 'yes' : 'no'}</td>`
    html += '</tr>'
  }

  if (results.length === configs.length) {
    const avg = results.reduce((s, r) => s + r.speedup, 0) / results.length
    const color = avg >= 1 ? '#40d080' : '#d04040'
    html += '<tr>'
    html += `<td style="${labelStyle};font-weight:bold">Average</td>`
    html += `<td style="${cellStyle}"></td><td style="${cellStyle}"></td>`
    html += `<td style="${cellStyle};color:${color};font-weight:bold">${avg.toFixed(2)}x</td>`
    html += `<td style="${cellStyle}"></td>`
    html += '</tr>'
  }

  table.innerHTML = html
}

async function runConfig(cfg) {
  const size = cfg.count * cfg.dim

  // Also create regular JS arrays for the scalar baseline
  const jsCorpus = new Float32Array(size)
  const jsQuery = new Float32Array(cfg.dim)

  // Fill pre-allocated wasmBuffer corpus + JS copy with same random data
  for (let i = 0; i < size; i++) {
    const v = Math.random() * 2 - 1
    corpus[i] = v
    jsCorpus[i] = v
  }
  for (let i = 0; i < cfg.dim; i++) {
    const v = Math.random() * 2 - 1
    query[i] = v
    jsQuery[i] = v
  }

  // Warm up (ensures WASM JIT is hot before timing)
  for (let w = 0; w < 3; w++) {
    simdSearch(corpus, query, Math.min(500, cfg.count), cfg.dim)
    jsSearch(jsCorpus, jsQuery, Math.min(500, cfg.count), cfg.dim)
  }

  // Time SIMD (uses pre-allocated wasmBuffer — zero copy)
  const simdStart = performance.now()
  const simdIdx = simdSearch(corpus, query, cfg.count, cfg.dim)
  const simdTime = performance.now() - simdStart

  // Time JS
  const jsStart = performance.now()
  const jsIdx = jsSearch(jsCorpus, jsQuery, cfg.count, cfg.dim)
  const jsTime = performance.now() - jsStart

  return {
    label: cfg.label,
    simdTime,
    jsTime,
    speedup: jsTime / simdTime,
    match: simdIdx === jsIdx,
  }
}

let running = false

btn.addEventListener('click', async () => {
  if (running) return
  running = true
  btn.textContent = 'Running...'
  btn.style.background = '#334'
  const results = []

  for (let i = 0; i < configs.length; i++) {
    status.textContent = `Running ${configs[i].label}...`
    await new Promise(r => setTimeout(r, 50))
    results.push(await runConfig(configs[i]))
    renderTable(results)
  }

  status.textContent = 'Done.'
  btn.textContent = 'Run Benchmark'
  btn.style.background = '#2060a0'
  running = false
})

status.textContent = 'Click "Run Benchmark" to start.'
```
