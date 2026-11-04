<!--{"section": "tjs", "type": "example", "group": "featured", "order": 2, "parent": "tjs-featured.md"}-->

# Vector Search Benchmark

> New to WASM in TJS? Start with the **[WASM Quick Start](https://github.com/tonioloewald/tjs-lang/blob/main/docs/WASM-QUICKSTART.md)**.

WASM SIMD vs scalar JavaScript cosine similarity

```tjs:inline
/#
# WASM SIMD Vector Search Benchmark

Compares **WASM SIMD** (f32x4) cosine similarity against **scalar JavaScript**
for vector search workloads. This is the core operation behind semantic search,
RAG pipelines, and embedding-based retrieval.

The corpus is packed into a single `wasmBuffer` — zero-copy shared memory
between JS and WASM. The SIMD search kernel processes 4 vector dimensions
per instruction and loops over the entire corpus in one WASM call.

Click **Run Benchmark** to generate random vectors and measure throughput.

**Cross-file equivalent:** today this example computes `dot`, `magA`, and `magB`
inline inside one `wasm {}` block. The same workload can also be expressed by
importing `tjs-lang/linalg` and using `dot` + `norm_sq` from a JS outer loop —
proven correct in `src/linalg/vector-search.bench.test.ts` (same `bestIdx`
across configs, composed-not-imported module shape verified).

**The honest perf tradeoff:** in the composed form the outer loop is JS, so
each corpus row costs 2 JS↔wasm boundary crossings (`dot` + `norm_sq`). The
inline form does the whole workload in one wasm call. So composed runs
roughly 1.5–10× slower for fine-grained kernel usage, even though the wasm
module shape is identical. For maximum throughput on hot inner loops, keep
this example's inline form; for modularity / reuse / correctness, the
imported form works fine. A `cosine_search` kernel in `tjs-lang/linalg` would
combine both wins — that's the natural next step. See
[`wasm-library-plan.md`](https://github.com/tonioloewald/tjs-lang/blob/main/wasm-library-plan.md)
§ "Canonical end-to-end demo" for the full story.
#/

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
// Render into the example's own box: the doc site gives an example a `preview` element (its
// page IS the doc page); the old playground ran each example in a page of its own.
const stage = typeof preview === 'undefined' ? document.body : preview
if (stage !== document.body) stage.style.cssText += ';position:relative;height:520px'
const container = document.createElement('div')
container.style.cssText = 'font-family:monospace;color:#c0d8ff;background:#0a0a14;padding:24px;position:absolute;inset:0;overflow:auto'
stage.appendChild(container)

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

// Measure per-call time robustly: run until at least minMs of wall-clock has
// elapsed, then divide by the iteration count. A single sub-millisecond pass
// can't be timed where performance.now() is coarse (Firefox clamps to ~1ms),
// which would make a fast SIMD result read as 0ms and the speedup Infinity.
function timePerOp(fn, minMs = 25) {
  let iters = 0
  let result
  const start = performance.now()
  do {
    result = fn()
    iters++
  } while (performance.now() - start < minMs)
  return { perOp: (performance.now() - start) / iters, result }
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

  // Time SIMD (pre-allocated wasmBuffer — zero copy) and JS, each averaged over
  // enough iterations to exceed coarse timer resolution (see timePerOp above).
  const simd = timePerOp(() => simdSearch(corpus, query, cfg.count, cfg.dim))
  const js = timePerOp(() => jsSearch(jsCorpus, jsQuery, cfg.count, cfg.dim))

  return {
    label: cfg.label,
    simdTime: simd.perOp,
    jsTime: js.perOp,
    speedup: simd.perOp > 0 ? js.perOp / simd.perOp : Infinity,
    match: simd.result === js.result,
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

<!-- TODO review -->
## What the benchmark measures

Vector search answers one question: of all the vectors in a corpus, which points most nearly
the same way as the query? The usual measure is **cosine similarity**, the dot product of the
two vectors divided by the product of their lengths. Every embedding search, from semantic
search to RAG, spends nearly all its time computing that, row after row.

`simdSearch` and `jsSearch` compute exactly the same thing and must agree on the winner; the
**match** column checks it on every run. The difference is how:

- **One WASM call for the whole corpus.** The loop over rows is inside the `wasm { }` block,
  so a search of 50,000 vectors crosses from JavaScript into WebAssembly once, not 50,000
  times.
- **Four dimensions per instruction.** The inner loop loads four floats of the query and four
  of the row, and keeps three running sums (the dot product and both squared lengths) in
  three `f32x4` registers.
- **The corpus is packed into one `wasmBuffer`.** Row `v` starts at element `v * dim`, so the
  kernel reaches any row by arithmetic, and nothing is copied per call. The buffers are sized
  for the largest configuration and allocated once, because `wasmBuffer` never frees.
- **The timing is honest.** Each search runs repeatedly for at least 25ms and the total is
  divided, after a warm-up, so neither a coarse browser clock nor a cold JIT decides the
  result.

The speed-up you see depends on your machine and browser, and it grows with `dim`, where more
of the time is spent in the SIMD inner loop.

<!-- TODO review -->
## The kernel on its own

Here is the same idea small enough to read and check by eye: four 4-dimensional rows, and
three queries whose nearest row is obvious. It also makes one improvement the benchmark
leaves out: the query's length is the same for every row, so it is computed once, before the
loop.

```tjs:inline
// The search kernel on its own: which of `count` packed vectors is most like `query`?
function nearest(! corpus: Float32Array, query: Float32Array, count: 0, dim: 0):! 0 {
  return wasm {
    // The query's length is the same for every row: compute it once
    let qAcc = f32x4_splat(0.0)
    for (let j = 0; j < dim; j += 4) {
      let q = f32x4_load(query, j * 4)
      qAcc = f32x4_add(qAcc, f32x4_mul(q, q))
    }
    let qLen = Math.sqrt(f32x4_extract_lane(qAcc, 0) + f32x4_extract_lane(qAcc, 1)
      + f32x4_extract_lane(qAcc, 2) + f32x4_extract_lane(qAcc, 3))

    let bestIdx = -1
    let bestScore = -2.0
    for (let v = 0; v < count; v++) {
      let dotAcc = f32x4_splat(0.0)
      let lenAcc = f32x4_splat(0.0)
      for (let j = 0; j < dim; j += 4) {
        let q = f32x4_load(query, j * 4)
        let c = f32x4_load(corpus, (v * dim + j) * 4)
        dotAcc = f32x4_add(dotAcc, f32x4_mul(q, c))
        lenAcc = f32x4_add(lenAcc, f32x4_mul(c, c))
      }
      let dot = f32x4_extract_lane(dotAcc, 0) + f32x4_extract_lane(dotAcc, 1)
        + f32x4_extract_lane(dotAcc, 2) + f32x4_extract_lane(dotAcc, 3)
      let cLen = Math.sqrt(f32x4_extract_lane(lenAcc, 0) + f32x4_extract_lane(lenAcc, 1)
        + f32x4_extract_lane(lenAcc, 2) + f32x4_extract_lane(lenAcc, 3))
      if (qLen * cLen > 0.0) {
        let score = dot / (qLen * cLen)
        if (score > bestScore) {
          bestScore = score
          bestIdx = v
        }
      }
    }
    return bestIdx
  }
}

// Four 4-dimensional vectors, packed row after row into one buffer
const rows = [
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0.7, 0.7, 0, 0],
  [0, 0, 0, 0],
]
const DIM = 4
const corpus = wasmBuffer(Float32Array, rows.length * DIM)
rows.forEach((row, v) => row.forEach((x, j) => (corpus[v * DIM + j] = x)))

const query = wasmBuffer(Float32Array, DIM)
for (const [label, q] of [['east', [1, 0.1, 0, 0]], ['north', [0.1, 1, 0, 0]], ['north-east', [1, 1, 0, 0]]]) {
  q.forEach((x, j) => (query[j] = x))
  console.log(`${label} is nearest to row`, nearest(corpus, query, rows.length, DIM))
}
```

The zero row never wins: its length is 0, so its score would divide by zero, and the kernel
skips it. `nearest` returns `-1` if no row has a usable length at all.

<!-- TODO review -->
## Inline block or library calls?

The same search can be written with `dot` and `norm_sq` from `tjs-lang/linalg`, with the loop
over rows in JavaScript:

```tjs:static
import { dot_at, norm_sq, norm_sq_at } from 'tjs-lang/linalg'

function search(! corpus: Float32Array, query: Float32Array, count: 0, dim: 0) {
  const qLen = Math.sqrt(norm_sq(query, dim))
  let bestIdx = -1
  let bestScore = -2
  for (let v = 0; v < count; v++) {
    const cLen = Math.sqrt(norm_sq_at(corpus, v * dim, dim))
    if (qLen * cLen > 0) {
      const score = dot_at(corpus, v * dim, query, dim) / (qLen * cLen)
      if (score > bestScore) {
        bestScore = score
        bestIdx = v
      }
    }
  }
  return bestIdx
}
```

That version is shorter and reuses tested kernels, but every row now costs two calls from
JavaScript into WebAssembly, and for small `dim` those crossings dominate: the
repository's benchmark measures it at roughly 1.5 to 10 times
slower than the single inline block. Prefer the library for clarity and reuse, and
move the loop into one kernel when the search itself is the hot path.

<!-- TODO review -->
## Limits

- **`dim` must be a multiple of 4.** Pad embeddings with zeros, which change neither dot
  products nor lengths.
- **This is exhaustive search.** It compares the query with every row, which is exact and
  simple and fine up to hundreds of thousands of vectors. Beyond that, approximate indexes
  (such as HNSW) trade exactness for speed.
- **Memory is finite.** The largest configuration uses 25.6MB of the file's 64MB of WASM
  memory, and that memory is never returned.
- **In `simdSearch`, `corpus: Float32Array` is not checked at the call.** TJS cannot turn `Float32Array` into a
  runtime type, so the transpiler warns that the annotation is unchecked; the integer `count`
  and `dim` are checked.
