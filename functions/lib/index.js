// node_modules/tjs-lang/src/vm/transpiler-slot.ts
var transpileImpl = null;
function setTranspiler(fn) {
  transpileImpl = fn;
}
function getTranspiler() {
  return transpileImpl;
}

// node_modules/tjs-lang/src/vm/admission.ts
var MAX_TIMER_MS = 2 ** 31 - 1;
var DEFAULT_MAX_SOURCE_BYTES = 8 * 1024;
var isBudget = (v) => typeof v === "number" && !Number.isNaN(v) && v >= 0;
var RUN_OPTION_KINDS = {
  fuel: "budget",
  timeoutMs: "budget",
  argsMaxBytes: "budget",
  membraneMaxBytes: "budget",
  maxHeapBytes: "budget",
  maxSourceBytes: "budget",
  costOverrides: "budgetTable",
  timeoutOverrides: "budgetTable",
  quotas: "budgetTable",
  quotaUsed: "counterTable",
  capabilities: "opaque",
  trace: "opaque",
  signal: "opaque",
  context: "opaque"
};
function readOnce(bag, name) {
  let depth = 0;
  for (let o = bag;o && o !== Object.prototype; ) {
    if (++depth > 64)
      return `Invalid run options: the prototype chain is deeper than 64 (or cyclic)`;
    const d = Object.getOwnPropertyDescriptor(o, name);
    if (d) {
      if (!("value" in d))
        return `Invalid run option ${name}: an accessor — run options must be data, read once`;
      return { value: d.value };
    }
    o = Object.getPrototypeOf(o);
  }
  return { value: undefined };
}
function admitRunOptions(options) {
  if (options !== undefined && (options === null || typeof options !== "object"))
    return `Invalid run options: ${describe(options)} — they must be an object`;
  const bag = options ?? {};
  const out = Object.create(null);
  for (const [name, kind] of Object.entries(RUN_OPTION_KINDS)) {
    const read = readOnce(bag, name);
    if (typeof read === "string")
      return read;
    const v = read.value;
    if (v === undefined)
      continue;
    if (kind === "opaque") {
      out[name] = v;
      continue;
    }
    if (kind === "budget") {
      if (!isBudget(v))
        return `Invalid run option ${name}: ${describe(v)} — it must be a non-negative number`;
      out[name] = v;
      continue;
    }
    const entries = tableEntries(v);
    if (typeof entries === "string")
      return `Invalid run option ${name}: ${entries}`;
    for (const [op, x] of entries) {
      if (kind === "budgetTable" && typeof x === "function" && name !== "quotas")
        continue;
      const ok = kind === "counterTable" ? isBudget(x) && Number.isFinite(x) : isBudget(x);
      if (!ok)
        return `Invalid run option ${name}.${op}: ${describe(x)} — it must be a ${kind === "counterTable" ? "finite " : ""}non-negative number`;
    }
    if (kind === "counterTable") {
      if (!Object.isExtensible(v))
        return `Invalid run option ${name}: it must be extensible — the VM writes counts back to it`;
      for (const key of Reflect.ownKeys(v)) {
        const d = Object.getOwnPropertyDescriptor(v, key);
        if (!d.writable)
          return `Invalid run option ${name}.${String(key)}: read-only — the VM writes counts back to it`;
      }
      out[name] = v;
      continue;
    }
    const table = Object.create(null);
    for (const [op, x] of entries)
      table[op] = x;
    out[name] = Object.freeze(table);
  }
  return Object.freeze(out);
}
function tableEntries(v) {
  if (!v || typeof v !== "object" || Array.isArray(v))
    return `${describe(v)} — it must be an object of per-op values`;
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null)
    return `it must be a plain object (a Map or class instance is read differently than it is checked)`;
  const out = [];
  for (const key of Reflect.ownKeys(v)) {
    if (typeof key === "symbol")
      return `symbol keys are not per-op values`;
    const d = Object.getOwnPropertyDescriptor(v, key);
    if (!("value" in d))
      return `'${key}' is an accessor — per-op values must be data, not getters`;
    out.push([key, d.value]);
  }
  return out;
}
function checkedQuota(quota, op) {
  if (!isBudget(quota))
    throw new Error(`Invalid quota for '${op}': ${describe(quota)} — it must be a non-negative number`);
  return quota;
}
function quotaCount(table, op) {
  const d = Object.getOwnPropertyDescriptor(table, op);
  if (!d)
    return 0;
  if (!("value" in d))
    throw new Error(`Invalid quotaUsed.${op}: an accessor — counts must be data`);
  const v = d.value;
  if (!(isBudget(v) && Number.isFinite(v)))
    throw new Error(`Invalid quotaUsed.${op}: ${describe(v)} — it must be a finite non-negative number`);
  return v;
}
function budgetOrFunction(name, value, fallback) {
  return typeof value === "function" ? value : budgetOption(name, value, fallback);
}
function sourceBytesOver(code, max) {
  if (!isBudget(max))
    throw new Error(`Invalid maxSourceBytes: ${describe(max)} — it must be a non-negative number (0 or Infinity disables the cap)`);
  if (max === Infinity || max === 0)
    return null;
  if (code.length > max)
    return code.length;
  const bytes = new TextEncoder().encode(code).length;
  return bytes > max ? bytes : null;
}
function timerMs(ms) {
  if (!isBudget(ms))
    throw new Error(`Invalid timeout: ${describe(ms)}`);
  if (ms === 0 || ms === Infinity)
    return;
  return Math.min(ms, MAX_TIMER_MS);
}
function checkedCost(cost, op) {
  if (!isBudget(cost))
    throw new Error(`Invalid fuel cost for '${op}': ${describe(cost)} — a cost must be a non-negative number`);
  return cost;
}
function budgetOption(name, value, fallback) {
  if (value === undefined)
    return fallback;
  if (!isBudget(value))
    throw new Error(`Invalid ${name}: ${describe(value)} — it must be a non-negative number`);
  return value;
}
function guestSourceCap(runMax) {
  const max = budgetOption("maxSourceBytes", runMax, DEFAULT_MAX_SOURCE_BYTES);
  return max > 0 && max < DEFAULT_MAX_SOURCE_BYTES ? max : DEFAULT_MAX_SOURCE_BYTES;
}
function describe(v) {
  if (typeof v === "number")
    return String(v);
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

// node_modules/tjs-lang/src/strip-comments.ts
function isEscapedAt(source, index) {
  let backslashes = 0;
  let k = index - 1;
  while (k >= 0 && source[k] === "\\") {
    backslashes++;
    k--;
  }
  return backslashes % 2 === 1;
}
function isRegexStart(emitted) {
  let j = emitted.length - 1;
  while (j >= 0 && /\s/.test(emitted[j]))
    j--;
  if (j < 0)
    return true;
  const c = emitted[j];
  if (/[)\]'"`]/.test(c))
    return false;
  if (/[A-Za-z0-9_$]/.test(c)) {
    const word = (emitted.slice(0, j + 1).match(/[A-Za-z_$][A-Za-z0-9_$]*$/) || [""])[0];
    return REGEX_PRECEDING_KEYWORDS.has(word);
  }
  return true;
}
var REGEX_PRECEDING_KEYWORDS = new Set([
  "return",
  "typeof",
  "instanceof",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "case",
  "do",
  "else",
  "yield",
  "await"
]);
function findRegexEnd(source, start, memo) {
  let k = start + 1;
  let inClass = false;
  const failed = memo ? memo.failed ??= new Uint8Array(source.length + 1) : null;
  const visited = [];
  const fail = () => {
    if (failed)
      for (const v of visited)
        failed[v >> 1] |= (v & 1) + 1;
    return -1;
  };
  while (k < source.length) {
    if (failed) {
      const state = inClass ? 2 : 1;
      if (failed[k] & state)
        return fail();
      visited.push(k * 2 + (inClass ? 1 : 0));
    }
    const c = source[k];
    if (c === "\\") {
      k += 2;
      continue;
    }
    if (c === `
`)
      return fail();
    if (inClass) {
      if (c === "]")
        inClass = false;
    } else if (c === "[") {
      inClass = true;
    } else if (c === "/") {
      return k;
    }
    k++;
  }
  return fail();
}
function stripLineComments(source) {
  return blankRegions(source, (r) => r.kind === "line-comment" ? [r.start, r.end] : null);
}
var SCAN_CACHE_MAX = 24;
var scanCache = new Map;
function scanLiterals(source) {
  const hit = scanCache.get(source);
  if (hit) {
    scanCache.delete(source);
    scanCache.set(source, hit);
    return hit;
  }
  const computed = Object.freeze(scanLiteralsUncached(source));
  if (scanCache.size >= SCAN_CACHE_MAX) {
    const oldest = scanCache.keys().next().value;
    if (oldest !== undefined)
      scanCache.delete(oldest);
  }
  scanCache.set(source, computed);
  return computed;
}
function templateEnd(source, start) {
  let k = start + 1;
  let inSubstitution = false;
  let braces = 0;
  while (k < source.length) {
    const c = source[k];
    if (c === "\\") {
      k += 2;
      continue;
    }
    if (!inSubstitution) {
      if (c === "`")
        return k;
      if (c === "$" && source[k + 1] === "{") {
        inSubstitution = true;
        braces = 0;
        k += 2;
        continue;
      }
      k++;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = k + 1;
      while (j < source.length) {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source[j] === c)
          break;
        j++;
      }
      k = j + 1;
      continue;
    }
    if (c === "`") {
      const nested = templateEnd(source, k);
      k = nested === -1 ? source.length : nested + 1;
      continue;
    }
    if (c === "/" && source[k + 1] === "/") {
      const nl = source.indexOf(`
`, k);
      k = nl === -1 ? source.length : nl;
      continue;
    }
    if (c === "/" && source[k + 1] === "*") {
      const close = source.indexOf("*/", k + 2);
      k = close === -1 ? source.length : close + 2;
      continue;
    }
    if (c === "{")
      braces++;
    else if (c === "}") {
      if (braces === 0)
        inSubstitution = false;
      else
        braces--;
    }
    k++;
  }
  return -1;
}
function scanLiteralsUncached(source) {
  const regions = [];
  const regexMemo = {};
  let i = 0;
  let sigTail = "";
  while (i < source.length) {
    const ch = source[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      let j;
      if (ch === "`") {
        const close = templateEnd(source, i);
        j = close === -1 ? source.length : close;
      } else {
        j = i + 1;
        while (j < source.length) {
          if (source[j] === "\\") {
            j += 2;
            continue;
          }
          if (source[j] === ch)
            break;
          j++;
        }
      }
      regions.push({
        kind: ch === "`" ? "template" : "string",
        start: i,
        end: Math.min(j + 1, source.length),
        innerStart: i + 1,
        innerEnd: j
      });
      i = j + 1;
      sigTail = (sigTail + ch).slice(-24);
      continue;
    }
    if (ch === "/" && source[i + 1] === "/") {
      const nl = source.indexOf(`
`, i);
      const end = nl === -1 ? source.length : nl;
      regions.push({
        kind: "line-comment",
        start: i,
        end,
        innerStart: i + 2,
        innerEnd: end
      });
      i = end;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      const close = source.indexOf("*/", i + 2);
      const end = close === -1 ? source.length : close + 2;
      regions.push({
        kind: "block-comment",
        start: i,
        end,
        innerStart: i + 2,
        innerEnd: close === -1 ? source.length : close
      });
      i = end;
      continue;
    }
    if (ch === "/" && isRegexStart(sigTail)) {
      const close = findRegexEnd(source, i, regexMemo);
      if (close !== -1) {
        regions.push({
          kind: "regex",
          start: i,
          end: close + 1,
          innerStart: i + 1,
          innerEnd: close
        });
        i = close + 1;
        sigTail = "/";
        continue;
      }
    }
    if (!/\s/.test(ch))
      sigTail = (sigTail + ch).slice(-24);
    i++;
  }
  return regions;
}
function splitTopLevel(source, sep = ",") {
  const masked = maskLiterals(source);
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0;i < masked.length; i++) {
    const c = masked[i];
    if (c === "(" || c === "[" || c === "{")
      depth++;
    else if (c === ")" || c === "]" || c === "}")
      depth--;
    else if (c === sep && depth === 0) {
      out.push(source.slice(start, i));
      start = i + 1;
    }
  }
  const tail = source.slice(start);
  if (tail.trim())
    out.push(tail);
  return out;
}
function splitTopLevelTrimmed(source, sep = ",") {
  return splitTopLevel(source, sep).map((p) => p.trim()).filter(Boolean);
}
var MASK_CACHE_MAX = 16;
var maskCaches = new Map;
function memoizedMask(flavour, source, compute) {
  let cache = maskCaches.get(flavour);
  if (!cache) {
    cache = new Map;
    maskCaches.set(flavour, cache);
  }
  const hit = cache.get(source);
  if (hit !== undefined) {
    cache.delete(source);
    cache.set(source, hit);
    return hit;
  }
  const computed = compute();
  if (cache.size >= MASK_CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined)
      cache.delete(oldest);
  }
  cache.set(source, computed);
  return computed;
}
function blankRegions(source, pick) {
  const out = source.split("");
  for (const r of scanLiterals(source)) {
    const range = pick(r);
    if (!range)
      continue;
    for (let k = range[0];k < range[1] && k < out.length; k++) {
      if (out[k] !== `
`)
        out[k] = " ";
    }
  }
  return out.join("");
}
var docScanWork = { steps: 0 };
function findDocCommentSpans(source) {
  const regions = scanLiterals(source);
  let cursor = 0;
  const insideLiteral = (offset) => {
    while (cursor < regions.length && regions[cursor].end <= offset) {
      cursor++;
      docScanWork.steps++;
    }
    const r = regions[cursor];
    return r !== undefined && offset >= r.start && offset < r.end;
  };
  const memo = new Map;
  const last = source.length - 1;
  const match = (start) => {
    if (memo.has(start))
      return memo.get(start);
    const stack = [
      { p: start, j: start, newline: false, closed: false, early: false }
    ];
    let result = null;
    let returning = false;
    while (stack.length) {
      const f = stack[stack.length - 1];
      if (returning) {
        returning = false;
        if (result === null) {
          memo.set(f.p, null);
          stack.pop();
          returning = true;
          continue;
        }
        if (!f.closed) {
          f.closed = true;
          f.early = !f.newline && result.earlyClose;
        }
        f.newline = f.newline || result.newline;
        f.j = result.end;
      }
      let pushed = false;
      while (f.j < last) {
        docScanWork.steps++;
        const c = source[f.j];
        if (c === `
`)
          f.newline = true;
        if (c === "/" && source[f.j + 1] === "#") {
          const sub = f.j + 2;
          if (memo.has(sub)) {
            result = memo.get(sub);
            returning = true;
            pushed = true;
            break;
          }
          stack.push({
            p: sub,
            j: sub,
            newline: false,
            closed: false,
            early: false
          });
          pushed = true;
          break;
        }
        if (c === "#" && source[f.j + 1] === "/") {
          if (!f.closed) {
            f.closed = true;
            f.early = !f.newline;
          }
          result = { end: f.j + 2, newline: f.newline, earlyClose: f.early };
          memo.set(f.p, result);
          stack.pop();
          returning = true;
          pushed = true;
          break;
        }
        f.j++;
      }
      if (!pushed) {
        result = null;
        memo.set(f.p, null);
        stack.pop();
        returning = true;
      }
    }
    return memo.get(start);
  };
  const spans = [];
  let i = 0;
  while (i < last) {
    docScanWork.steps++;
    if (source[i] !== "/" || source[i + 1] !== "#" || insideLiteral(i)) {
      i++;
      continue;
    }
    const m = match(i + 2);
    if (m === null || !m.newline || m.earlyClose) {
      i++;
      continue;
    }
    spans.push([i, m.end]);
    i = m.end;
  }
  return spans;
}
function blankDocComments(source) {
  const spans = findDocCommentSpans(source);
  if (!spans.length)
    return source;
  const parts = [];
  let at = 0;
  for (const [start, end] of spans) {
    docScanWork.steps += end - at;
    parts.push(source.slice(at, start), source.slice(start, end).replace(/[^\n]/g, " "));
    at = end;
  }
  parts.push(source.slice(at));
  return parts.join("");
}
function maskLiterals(source) {
  return memoizedMask("literals", source, () => blankRegions(source, (r) => r.kind === "line-comment" || r.kind === "block-comment" ? [r.start, r.end] : [r.innerStart, r.innerEnd]));
}
function hashbangOf(source) {
  if (!source.startsWith("#!"))
    return "";
  const nl = source.indexOf(`
`);
  return source.slice(0, nl === -1 ? source.length : nl);
}

// node_modules/acorn/dist/acorn.mjs
var astralIdentifierCodes = [509, 0, 227, 0, 150, 4, 294, 9, 1368, 2, 2, 1, 6, 3, 41, 2, 5, 0, 166, 1, 574, 3, 9, 9, 7, 9, 32, 4, 318, 1, 78, 5, 71, 10, 50, 3, 123, 2, 54, 14, 32, 10, 3, 1, 11, 3, 46, 10, 8, 0, 46, 9, 7, 2, 37, 13, 2, 9, 6, 1, 45, 0, 13, 2, 49, 13, 9, 3, 2, 11, 83, 11, 7, 0, 3, 0, 158, 11, 6, 9, 7, 3, 56, 1, 2, 6, 3, 1, 3, 2, 10, 0, 11, 1, 3, 6, 4, 4, 68, 8, 2, 0, 3, 0, 2, 3, 2, 4, 2, 0, 15, 1, 83, 17, 10, 9, 5, 0, 82, 19, 13, 9, 214, 6, 3, 8, 28, 1, 83, 16, 16, 9, 82, 12, 9, 9, 7, 19, 58, 14, 5, 9, 243, 14, 166, 9, 71, 5, 2, 1, 3, 3, 2, 0, 2, 1, 13, 9, 120, 6, 3, 6, 4, 0, 29, 9, 41, 6, 2, 3, 9, 0, 10, 10, 47, 15, 199, 7, 137, 9, 54, 7, 2, 7, 17, 9, 57, 21, 2, 13, 123, 5, 4, 0, 2, 1, 2, 6, 2, 0, 9, 9, 49, 4, 2, 1, 2, 4, 9, 9, 55, 9, 266, 3, 10, 1, 2, 0, 49, 6, 4, 4, 14, 10, 5350, 0, 7, 14, 11465, 27, 2343, 9, 87, 9, 39, 4, 60, 6, 26, 9, 535, 9, 470, 0, 2, 54, 8, 3, 82, 0, 12, 1, 19628, 1, 4178, 9, 519, 45, 3, 22, 543, 4, 4, 5, 9, 7, 3, 6, 31, 3, 149, 2, 1418, 49, 513, 54, 5, 49, 9, 0, 15, 0, 23, 4, 2, 14, 1361, 6, 2, 16, 3, 6, 2, 1, 2, 4, 101, 0, 161, 6, 10, 9, 357, 0, 62, 13, 499, 13, 245, 1, 2, 9, 233, 0, 3, 0, 8, 1, 6, 0, 475, 6, 110, 6, 6, 9, 4759, 9, 787719, 239];
var astralIdentifierStartCodes = [0, 11, 2, 25, 2, 18, 2, 1, 2, 14, 3, 13, 35, 122, 70, 52, 268, 28, 4, 48, 48, 31, 14, 29, 6, 37, 11, 29, 3, 35, 5, 7, 2, 4, 43, 157, 19, 35, 5, 35, 5, 39, 9, 51, 13, 10, 2, 14, 2, 6, 2, 1, 2, 10, 2, 14, 2, 6, 2, 1, 4, 51, 13, 310, 10, 21, 11, 7, 25, 5, 2, 41, 2, 8, 70, 5, 3, 0, 2, 43, 2, 1, 4, 0, 3, 22, 11, 22, 10, 30, 66, 18, 2, 1, 11, 21, 11, 25, 7, 25, 39, 55, 7, 1, 65, 0, 16, 3, 2, 2, 2, 28, 43, 28, 4, 28, 36, 7, 2, 27, 28, 53, 11, 21, 11, 18, 14, 17, 111, 72, 56, 50, 14, 50, 14, 35, 39, 27, 10, 22, 251, 41, 7, 1, 17, 5, 57, 28, 11, 0, 9, 21, 43, 17, 47, 20, 28, 22, 13, 52, 58, 1, 3, 0, 14, 44, 33, 24, 27, 35, 30, 0, 3, 0, 9, 34, 4, 0, 13, 47, 15, 3, 22, 0, 2, 0, 36, 17, 2, 24, 20, 1, 64, 6, 2, 0, 2, 3, 2, 14, 2, 9, 8, 46, 39, 7, 3, 1, 3, 21, 2, 6, 2, 1, 2, 4, 4, 0, 19, 0, 13, 4, 31, 9, 2, 0, 3, 0, 2, 37, 2, 0, 26, 0, 2, 0, 45, 52, 19, 3, 21, 2, 31, 47, 21, 1, 2, 0, 185, 46, 42, 3, 37, 47, 21, 0, 60, 42, 14, 0, 72, 26, 38, 6, 186, 43, 117, 63, 32, 7, 3, 0, 3, 7, 2, 1, 2, 23, 16, 0, 2, 0, 95, 7, 3, 38, 17, 0, 2, 0, 29, 0, 11, 39, 8, 0, 22, 0, 12, 45, 20, 0, 19, 72, 200, 32, 32, 8, 2, 36, 18, 0, 50, 29, 113, 6, 2, 1, 2, 37, 22, 0, 26, 5, 2, 1, 2, 31, 15, 0, 24, 43, 261, 18, 16, 0, 2, 12, 2, 33, 125, 0, 80, 921, 103, 110, 18, 195, 2637, 96, 16, 1071, 18, 5, 26, 3994, 6, 582, 6842, 29, 1763, 568, 8, 30, 18, 78, 18, 29, 19, 47, 17, 3, 32, 20, 6, 18, 433, 44, 212, 63, 33, 24, 3, 24, 45, 74, 6, 0, 67, 12, 65, 1, 2, 0, 15, 4, 10, 7381, 42, 31, 98, 114, 8702, 3, 2, 6, 2, 1, 2, 290, 16, 0, 30, 2, 3, 0, 15, 3, 9, 395, 2309, 106, 6, 12, 4, 8, 8, 9, 5991, 84, 2, 70, 2, 1, 3, 0, 3, 1, 3, 3, 2, 11, 2, 0, 2, 6, 2, 64, 2, 3, 3, 7, 2, 6, 2, 27, 2, 3, 2, 4, 2, 0, 4, 6, 2, 339, 3, 24, 2, 24, 2, 30, 2, 24, 2, 30, 2, 24, 2, 30, 2, 24, 2, 30, 2, 24, 2, 7, 1845, 30, 7, 5, 262, 61, 147, 44, 11, 6, 17, 0, 322, 29, 19, 43, 485, 27, 229, 29, 3, 0, 208, 30, 2, 2, 2, 1, 2, 6, 3, 4, 10, 1, 225, 6, 2, 3, 2, 1, 2, 14, 2, 196, 60, 67, 8, 0, 1205, 3, 2, 26, 2, 1, 2, 0, 3, 0, 2, 9, 2, 3, 2, 0, 2, 0, 7, 0, 5, 0, 2, 0, 2, 0, 2, 2, 2, 1, 2, 0, 3, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 1, 2, 0, 3, 3, 2, 6, 2, 3, 2, 3, 2, 0, 2, 9, 2, 16, 6, 2, 2, 4, 2, 16, 4421, 42719, 33, 4381, 3, 5773, 3, 7472, 16, 621, 2467, 541, 1507, 4938, 6, 8489];
var nonASCIIidentifierChars = "‌‍·̀-ͯ·҃-֑҇-ׇֽֿׁׂׅׄؐ-ًؚ-٩ٰۖ-ۜ۟-۪ۤۧۨ-ۭ۰-۹ܑܰ-݊ަ-ް߀-߉߫-߽߳ࠖ-࠙ࠛ-ࠣࠥ-ࠧࠩ-࡙࠭-࡛ࢗ-࢟࣊-ࣣ࣡-ःऺ-़ा-ॏ॑-ॗॢॣ०-९ঁ-ঃ়া-ৄেৈো-্ৗৢৣ০-৯৾ਁ-ਃ਼ਾ-ੂੇੈੋ-੍ੑ੦-ੱੵઁ-ઃ઼ા-ૅે-ૉો-્ૢૣ૦-૯ૺ-૿ଁ-ଃ଼ା-ୄେୈୋ-୍୕-ୗୢୣ୦-୯ஂா-ூெ-ைொ-்ௗ௦-௯ఀ-ఄ఼ా-ౄె-ైొ-్ౕౖౢౣ౦-౯ಁ-ಃ಼ಾ-ೄೆ-ೈೊ-್ೕೖೢೣ೦-೯ೳഀ-ഃ഻഼ാ-ൄെ-ൈൊ-്ൗൢൣ൦-൯ඁ-ඃ්ා-ුූෘ-ෟ෦-෯ෲෳัิ-ฺ็-๎๐-๙ັິ-ຼ່-໎໐-໙༘༙༠-༩༹༵༷༾༿ཱ-྄྆྇ྍ-ྗྙ-ྼ࿆ါ-ှ၀-၉ၖ-ၙၞ-ၠၢ-ၤၧ-ၭၱ-ၴႂ-ႍႏ-ႝ፝-፟፩-፱ᜒ-᜕ᜲ-᜴ᝒᝓᝲᝳ឴-៓៝០-៩᠋-᠍᠏-᠙ᢩᤠ-ᤫᤰ-᤻᥆-᥏᧐-᧚ᨗ-ᨛᩕ-ᩞ᩠-᩿᩼-᪉᪐-᪙᪰-᪽ᪿ-᫝᫠-᫫ᬀ-ᬄ᬴-᭄᭐-᭙᭫-᭳ᮀ-ᮂᮡ-ᮭ᮰-᮹᯦-᯳ᰤ-᰷᱀-᱉᱐-᱙᳐-᳔᳒-᳨᳭᳴᳷-᳹᷀-᷿‌‍‿⁀⁔⃐-⃥⃜⃡-⃰⳯-⵿⳱ⷠ-〪ⷿ-゙゚〯・꘠-꘩꙯ꙴ-꙽ꚞꚟ꛰꛱ꠂ꠆ꠋꠣ-ꠧ꠬ꢀꢁꢴ-ꣅ꣐-꣙꣠-꣱ꣿ-꤉ꤦ-꤭ꥇ-꥓ꦀ-ꦃ꦳-꧀꧐-꧙ꧥ꧰-꧹ꨩ-ꨶꩃꩌꩍ꩐-꩙ꩻ-ꩽꪰꪲ-ꪴꪷꪸꪾ꪿꫁ꫫ-ꫯꫵ꫶ꯣ-ꯪ꯬꯭꯰-꯹ﬞ︀-️︠-︯︳︴﹍-﹏０-９＿･";
var nonASCIIidentifierStartChars = "ªµºÀ-ÖØ-öø-ˁˆ-ˑˠ-ˤˬˮͰ-ʹͶͷͺ-ͽͿΆΈ-ΊΌΎ-ΡΣ-ϵϷ-ҁҊ-ԯԱ-Ֆՙՠ-ֈא-תׯ-ײؠ-يٮٯٱ-ۓەۥۦۮۯۺ-ۼۿܐܒ-ܯݍ-ޥޱߊ-ߪߴߵߺࠀ-ࠕࠚࠤࠨࡀ-ࡘࡠ-ࡪࡰ-ࢇࢉ-࢏ࢠ-ࣉऄ-हऽॐक़-ॡॱ-ঀঅ-ঌএঐও-নপ-রলশ-হঽৎড়ঢ়য়-ৡৰৱৼਅ-ਊਏਐਓ-ਨਪ-ਰਲਲ਼ਵਸ਼ਸਹਖ਼-ੜਫ਼ੲ-ੴઅ-ઍએ-ઑઓ-નપ-રલળવ-હઽૐૠૡૹଅ-ଌଏଐଓ-ନପ-ରଲଳଵ-ହଽଡ଼ଢ଼ୟ-ୡୱஃஅ-ஊஎ-ஐஒ-கஙசஜஞடணதந-பம-ஹௐఅ-ఌఎ-ఐఒ-నప-హఽౘ-ౚ౜ౝౠౡಀಅ-ಌಎ-ಐಒ-ನಪ-ಳವ-ಹಽ೜-ೞೠೡೱೲഄ-ഌഎ-ഐഒ-ഺഽൎൔ-ൖൟ-ൡൺ-ൿඅ-ඖක-නඳ-රලව-ෆก-ะาำเ-ๆກຂຄຆ-ຊຌ-ຣລວ-ະາຳຽເ-ໄໆໜ-ໟༀཀ-ཇཉ-ཬྈ-ྌက-ဪဿၐ-ၕၚ-ၝၡၥၦၮ-ၰၵ-ႁႎႠ-ჅჇჍა-ჺჼ-ቈቊ-ቍቐ-ቖቘቚ-ቝበ-ኈኊ-ኍነ-ኰኲ-ኵኸ-ኾዀዂ-ዅወ-ዖዘ-ጐጒ-ጕጘ-ፚᎀ-ᎏᎠ-Ᏽᏸ-ᏽᐁ-ᙬᙯ-ᙿᚁ-ᚚᚠ-ᛪᛮ-ᛸᜀ-ᜑᜟ-ᜱᝀ-ᝑᝠ-ᝬᝮ-ᝰក-ឳៗៜᠠ-ᡸᢀ-ᢨᢪᢰ-ᣵᤀ-ᤞᥐ-ᥭᥰ-ᥴᦀ-ᦫᦰ-ᧉᨀ-ᨖᨠ-ᩔᪧᬅ-ᬳᭅ-ᭌᮃ-ᮠᮮᮯᮺ-ᯥᰀ-ᰣᱍ-ᱏᱚ-ᱽᲀ-ᲊᲐ-ᲺᲽ-Ჿᳩ-ᳬᳮ-ᳳᳵᳶᳺᴀ-ᶿḀ-ἕἘ-Ἕἠ-ὅὈ-Ὅὐ-ὗὙὛὝὟ-ώᾀ-ᾴᾶ-ᾼιῂ-ῄῆ-ῌῐ-ΐῖ-Ίῠ-Ῥῲ-ῴῶ-ῼⁱⁿₐ-ₜℂℇℊ-ℓℕ℘-ℝℤΩℨK-ℹℼ-ℿⅅ-ⅉⅎⅠ-ↈⰀ-ⳤⳫ-ⳮⳲⳳⴀ-ⴥⴧⴭⴰ-ⵧⵯⶀ-ⶖⶠ-ⶦⶨ-ⶮⶰ-ⶶⶸ-ⶾⷀ-ⷆⷈ-ⷎⷐ-ⷖⷘ-ⷞ々-〇〡-〩〱-〵〸-〼ぁ-ゖ゛-ゟァ-ヺー-ヿㄅ-ㄯㄱ-ㆎㆠ-ㆿㇰ-ㇿ㐀-䶿一-ꒌꓐ-ꓽꔀ-ꘌꘐ-ꘟꘪꘫꙀ-ꙮꙿ-ꚝꚠ-ꛯꜗ-ꜟꜢ-ꞈꞋ-Ƛ꟱-ꠁꠃ-ꠅꠇ-ꠊꠌ-ꠢꡀ-ꡳꢂ-ꢳꣲ-ꣷꣻꣽꣾꤊ-ꤥꤰ-ꥆꥠ-ꥼꦄ-ꦲꧏꧠ-ꧤꧦ-ꧯꧺ-ꧾꨀ-ꨨꩀ-ꩂꩄ-ꩋꩠ-ꩶꩺꩾ-ꪯꪱꪵꪶꪹ-ꪽꫀꫂꫛ-ꫝꫠ-ꫪꫲ-ꫴꬁ-ꬆꬉ-ꬎꬑ-ꬖꬠ-ꬦꬨ-ꬮꬰ-ꭚꭜ-ꭩꭰ-ꯢ가-힣ힰ-ퟆퟋ-ퟻ豈-舘並-龎ﬀ-ﬆﬓ-ﬗיִײַ-ﬨשׁ-זּטּ-לּמּנּסּףּפּצּ-ﮱﯓ-ﴽﵐ-ﶏﶒ-ﷇﷰ-ﷻﹰ-ﹴﹶ-ﻼＡ-Ｚａ-ｚｦ-ﾾￂ-ￇￊ-ￏￒ-ￗￚ-ￜ";
var reservedWords = {
  3: "abstract boolean byte char class double enum export extends final float goto implements import int interface long native package private protected public short static super synchronized throws transient volatile",
  5: "class enum extends super const export import",
  6: "enum",
  strict: "implements interface let package private protected public static yield",
  strictBind: "eval arguments"
};
var ecma5AndLessKeywords = "break case catch continue debugger default do else finally for function if return switch throw try var while with null true false instanceof typeof void delete new in this";
var keywords$1 = {
  5: ecma5AndLessKeywords,
  "5module": ecma5AndLessKeywords + " export import",
  6: ecma5AndLessKeywords + " const class extends export import super"
};
var keywordRelationalOperator = /^in(stanceof)?$/;
var nonASCIIidentifierStart = new RegExp("[" + nonASCIIidentifierStartChars + "]");
var nonASCIIidentifier = new RegExp("[" + nonASCIIidentifierStartChars + nonASCIIidentifierChars + "]");
function isInAstralSet(code, set) {
  var pos = 65536;
  for (var i = 0;i < set.length; i += 2) {
    pos += set[i];
    if (pos > code) {
      return false;
    }
    pos += set[i + 1];
    if (pos >= code) {
      return true;
    }
  }
  return false;
}
function isIdentifierStart(code, astral) {
  if (code < 65) {
    return code === 36;
  }
  if (code < 91) {
    return true;
  }
  if (code < 97) {
    return code === 95;
  }
  if (code < 123) {
    return true;
  }
  if (code <= 65535) {
    return code >= 170 && nonASCIIidentifierStart.test(String.fromCharCode(code));
  }
  if (astral === false) {
    return false;
  }
  return isInAstralSet(code, astralIdentifierStartCodes);
}
function isIdentifierChar(code, astral) {
  if (code < 48) {
    return code === 36;
  }
  if (code < 58) {
    return true;
  }
  if (code < 65) {
    return false;
  }
  if (code < 91) {
    return true;
  }
  if (code < 97) {
    return code === 95;
  }
  if (code < 123) {
    return true;
  }
  if (code <= 65535) {
    return code >= 170 && nonASCIIidentifier.test(String.fromCharCode(code));
  }
  if (astral === false) {
    return false;
  }
  return isInAstralSet(code, astralIdentifierStartCodes) || isInAstralSet(code, astralIdentifierCodes);
}
var TokenType = function TokenType(label, conf) {
  if (conf === undefined)
    conf = {};
  this.label = label;
  this.keyword = conf.keyword;
  this.beforeExpr = !!conf.beforeExpr;
  this.startsExpr = !!conf.startsExpr;
  this.isLoop = !!conf.isLoop;
  this.isAssign = !!conf.isAssign;
  this.prefix = !!conf.prefix;
  this.postfix = !!conf.postfix;
  this.binop = conf.binop || null;
  this.updateContext = null;
};
function binop(name, prec) {
  return new TokenType(name, { beforeExpr: true, binop: prec });
}
var beforeExpr = { beforeExpr: true };
var startsExpr = { startsExpr: true };
var keywords = {};
function kw(name, options) {
  if (options === undefined)
    options = {};
  options.keyword = name;
  return keywords[name] = new TokenType(name, options);
}
var types$1 = {
  num: new TokenType("num", startsExpr),
  regexp: new TokenType("regexp", startsExpr),
  string: new TokenType("string", startsExpr),
  name: new TokenType("name", startsExpr),
  privateId: new TokenType("privateId", startsExpr),
  eof: new TokenType("eof"),
  bracketL: new TokenType("[", { beforeExpr: true, startsExpr: true }),
  bracketR: new TokenType("]"),
  braceL: new TokenType("{", { beforeExpr: true, startsExpr: true }),
  braceR: new TokenType("}"),
  parenL: new TokenType("(", { beforeExpr: true, startsExpr: true }),
  parenR: new TokenType(")"),
  comma: new TokenType(",", beforeExpr),
  semi: new TokenType(";", beforeExpr),
  colon: new TokenType(":", beforeExpr),
  dot: new TokenType("."),
  question: new TokenType("?", beforeExpr),
  questionDot: new TokenType("?."),
  arrow: new TokenType("=>", beforeExpr),
  template: new TokenType("template"),
  invalidTemplate: new TokenType("invalidTemplate"),
  ellipsis: new TokenType("...", beforeExpr),
  backQuote: new TokenType("`", startsExpr),
  dollarBraceL: new TokenType("${", { beforeExpr: true, startsExpr: true }),
  eq: new TokenType("=", { beforeExpr: true, isAssign: true }),
  assign: new TokenType("_=", { beforeExpr: true, isAssign: true }),
  incDec: new TokenType("++/--", { prefix: true, postfix: true, startsExpr: true }),
  prefix: new TokenType("!/~", { beforeExpr: true, prefix: true, startsExpr: true }),
  logicalOR: binop("||", 1),
  logicalAND: binop("&&", 2),
  bitwiseOR: binop("|", 3),
  bitwiseXOR: binop("^", 4),
  bitwiseAND: binop("&", 5),
  equality: binop("==/!=/===/!==", 6),
  relational: binop("</>/<=/>=", 7),
  bitShift: binop("<</>>/>>>", 8),
  plusMin: new TokenType("+/-", { beforeExpr: true, binop: 9, prefix: true, startsExpr: true }),
  modulo: binop("%", 10),
  star: binop("*", 10),
  slash: binop("/", 10),
  starstar: new TokenType("**", { beforeExpr: true }),
  coalesce: binop("??", 1),
  _break: kw("break"),
  _case: kw("case", beforeExpr),
  _catch: kw("catch"),
  _continue: kw("continue"),
  _debugger: kw("debugger"),
  _default: kw("default", beforeExpr),
  _do: kw("do", { isLoop: true, beforeExpr: true }),
  _else: kw("else", beforeExpr),
  _finally: kw("finally"),
  _for: kw("for", { isLoop: true }),
  _function: kw("function", startsExpr),
  _if: kw("if"),
  _return: kw("return", beforeExpr),
  _switch: kw("switch"),
  _throw: kw("throw", beforeExpr),
  _try: kw("try"),
  _var: kw("var"),
  _const: kw("const"),
  _while: kw("while", { isLoop: true }),
  _with: kw("with"),
  _new: kw("new", { beforeExpr: true, startsExpr: true }),
  _this: kw("this", startsExpr),
  _super: kw("super", startsExpr),
  _class: kw("class", startsExpr),
  _extends: kw("extends", beforeExpr),
  _export: kw("export"),
  _import: kw("import", startsExpr),
  _null: kw("null", startsExpr),
  _true: kw("true", startsExpr),
  _false: kw("false", startsExpr),
  _in: kw("in", { beforeExpr: true, binop: 7 }),
  _instanceof: kw("instanceof", { beforeExpr: true, binop: 7 }),
  _typeof: kw("typeof", { beforeExpr: true, prefix: true, startsExpr: true }),
  _void: kw("void", { beforeExpr: true, prefix: true, startsExpr: true }),
  _delete: kw("delete", { beforeExpr: true, prefix: true, startsExpr: true })
};
var lineBreak = /\r\n?|\n|\u2028|\u2029/;
var lineBreakG = new RegExp(lineBreak.source, "g");
function isNewLine(code) {
  return code === 10 || code === 13 || code === 8232 || code === 8233;
}
function nextLineBreak(code, from, end) {
  if (end === undefined)
    end = code.length;
  for (var i = from;i < end; i++) {
    var next = code.charCodeAt(i);
    if (isNewLine(next)) {
      return i < end - 1 && next === 13 && code.charCodeAt(i + 1) === 10 ? i + 2 : i + 1;
    }
  }
  return -1;
}
var nonASCIIwhitespace = /[\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]/;
var skipWhiteSpace = /(?:\s|\/\/.*|\/\*[^]*?\*\/)*/g;
var ref = Object.prototype;
var hasOwnProperty = ref.hasOwnProperty;
var toString = ref.toString;
var hasOwn = Object.hasOwn || function(obj, propName) {
  return hasOwnProperty.call(obj, propName);
};
var isArray = Array.isArray || function(obj) {
  return toString.call(obj) === "[object Array]";
};
var regexpCache = Object.create(null);
function wordsRegexp(words) {
  return regexpCache[words] || (regexpCache[words] = new RegExp("^(?:" + words.replace(/ /g, "|") + ")$"));
}
function codePointToString(code) {
  if (code <= 65535) {
    return String.fromCharCode(code);
  }
  code -= 65536;
  return String.fromCharCode((code >> 10) + 55296, (code & 1023) + 56320);
}
var loneSurrogate = /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])/;
var Position = function Position(line, col) {
  this.line = line;
  this.column = col;
};
Position.prototype.offset = function offset(n) {
  return new Position(this.line, this.column + n);
};
var SourceLocation = function SourceLocation(p, start, end) {
  this.start = start;
  this.end = end;
  if (p.sourceFile !== null) {
    this.source = p.sourceFile;
  }
};
function getLineInfo(input, offset) {
  for (var line = 1, cur = 0;; ) {
    var nextBreak = nextLineBreak(input, cur, offset);
    if (nextBreak < 0) {
      return new Position(line, offset - cur);
    }
    ++line;
    cur = nextBreak;
  }
}
var defaultOptions = {
  ecmaVersion: null,
  sourceType: "script",
  onInsertedSemicolon: null,
  onTrailingComma: null,
  allowReserved: null,
  allowReturnOutsideFunction: false,
  allowImportExportEverywhere: false,
  allowAwaitOutsideFunction: null,
  allowSuperOutsideMethod: null,
  allowHashBang: false,
  checkPrivateFields: true,
  locations: false,
  onToken: null,
  onComment: null,
  ranges: false,
  program: null,
  sourceFile: null,
  directSourceFile: null,
  preserveParens: false
};
var warnedAboutEcmaVersion = false;
function getOptions(opts) {
  var options = {};
  for (var opt in defaultOptions) {
    options[opt] = opts && hasOwn(opts, opt) ? opts[opt] : defaultOptions[opt];
  }
  if (options.ecmaVersion === "latest") {
    options.ecmaVersion = 1e8;
  } else if (options.ecmaVersion == null) {
    if (!warnedAboutEcmaVersion && typeof console === "object" && console.warn) {
      warnedAboutEcmaVersion = true;
      console.warn(`Since Acorn 8.0.0, options.ecmaVersion is required.
Defaulting to 2020, but this will stop working in the future.`);
    }
    options.ecmaVersion = 11;
  } else if (options.ecmaVersion >= 2015) {
    options.ecmaVersion -= 2009;
  }
  if (options.allowReserved == null) {
    options.allowReserved = options.ecmaVersion < 5;
  }
  if (!opts || opts.allowHashBang == null) {
    options.allowHashBang = options.ecmaVersion >= 14;
  }
  if (isArray(options.onToken)) {
    var tokens = options.onToken;
    options.onToken = function(token) {
      return tokens.push(token);
    };
  }
  if (isArray(options.onComment)) {
    options.onComment = pushComment(options, options.onComment);
  }
  if (options.sourceType === "commonjs" && options.allowAwaitOutsideFunction) {
    throw new Error("Cannot use allowAwaitOutsideFunction with sourceType: commonjs");
  }
  return options;
}
function pushComment(options, array) {
  return function(block, text, start, end, startLoc, endLoc) {
    var comment = {
      type: block ? "Block" : "Line",
      value: text,
      start,
      end
    };
    if (options.locations) {
      comment.loc = new SourceLocation(this, startLoc, endLoc);
    }
    if (options.ranges) {
      comment.range = [start, end];
    }
    array.push(comment);
  };
}
var SCOPE_TOP = 1;
var SCOPE_FUNCTION = 2;
var SCOPE_ASYNC = 4;
var SCOPE_GENERATOR = 8;
var SCOPE_ARROW = 16;
var SCOPE_SIMPLE_CATCH = 32;
var SCOPE_SUPER = 64;
var SCOPE_DIRECT_SUPER = 128;
var SCOPE_CLASS_STATIC_BLOCK = 256;
var SCOPE_CLASS_FIELD_INIT = 512;
var SCOPE_SWITCH = 1024;
var SCOPE_VAR = SCOPE_TOP | SCOPE_FUNCTION | SCOPE_CLASS_STATIC_BLOCK;
function functionFlags(async, generator) {
  return SCOPE_FUNCTION | (async ? SCOPE_ASYNC : 0) | (generator ? SCOPE_GENERATOR : 0);
}
var BIND_NONE = 0;
var BIND_VAR = 1;
var BIND_LEXICAL = 2;
var BIND_FUNCTION = 3;
var BIND_SIMPLE_CATCH = 4;
var BIND_OUTSIDE = 5;
var Parser = function Parser(options, input, startPos) {
  this.options = options = getOptions(options);
  this.sourceFile = options.sourceFile;
  this.keywords = wordsRegexp(keywords$1[options.ecmaVersion >= 6 ? 6 : options.sourceType === "module" ? "5module" : 5]);
  var reserved = "";
  if (options.allowReserved !== true) {
    reserved = reservedWords[options.ecmaVersion >= 6 ? 6 : options.ecmaVersion === 5 ? 5 : 3];
    if (options.sourceType === "module") {
      reserved += " await";
    }
  }
  this.reservedWords = wordsRegexp(reserved);
  var reservedStrict = (reserved ? reserved + " " : "") + reservedWords.strict;
  this.reservedWordsStrict = wordsRegexp(reservedStrict);
  this.reservedWordsStrictBind = wordsRegexp(reservedStrict + " " + reservedWords.strictBind);
  this.input = String(input);
  this.containsEsc = false;
  if (startPos) {
    this.pos = startPos;
    this.lineStart = this.input.lastIndexOf(`
`, startPos - 1) + 1;
    this.curLine = this.input.slice(0, this.lineStart).split(lineBreak).length;
  } else {
    this.pos = this.lineStart = 0;
    this.curLine = 1;
  }
  this.type = types$1.eof;
  this.value = null;
  this.start = this.end = this.pos;
  this.startLoc = this.endLoc = this.curPosition();
  this.lastTokEndLoc = this.lastTokStartLoc = null;
  this.lastTokStart = this.lastTokEnd = this.pos;
  this.context = this.initialContext();
  this.exprAllowed = true;
  this.inModule = options.sourceType === "module";
  this.strict = this.inModule || this.strictDirective(this.pos);
  this.potentialArrowAt = -1;
  this.potentialArrowInForAwait = false;
  this.yieldPos = this.awaitPos = this.awaitIdentPos = 0;
  this.labels = [];
  this.undefinedExports = Object.create(null);
  if (this.pos === 0 && options.allowHashBang && this.input.slice(0, 2) === "#!") {
    this.skipLineComment(2);
  }
  this.scopeStack = [];
  this.enterScope(this.options.sourceType === "commonjs" ? SCOPE_FUNCTION : SCOPE_TOP);
  this.regexpState = null;
  this.privateNameStack = [];
};
var prototypeAccessors = { inFunction: { configurable: true }, inGenerator: { configurable: true }, inAsync: { configurable: true }, canAwait: { configurable: true }, allowReturn: { configurable: true }, allowSuper: { configurable: true }, allowDirectSuper: { configurable: true }, treatFunctionsAsVar: { configurable: true }, allowNewDotTarget: { configurable: true }, allowUsing: { configurable: true }, inClassStaticBlock: { configurable: true } };
Parser.prototype.parse = function parse() {
  var node = this.options.program || this.startNode();
  this.nextToken();
  return this.parseTopLevel(node);
};
prototypeAccessors.inFunction.get = function() {
  return (this.currentVarScope().flags & SCOPE_FUNCTION) > 0;
};
prototypeAccessors.inGenerator.get = function() {
  return (this.currentVarScope().flags & SCOPE_GENERATOR) > 0;
};
prototypeAccessors.inAsync.get = function() {
  return (this.currentVarScope().flags & SCOPE_ASYNC) > 0;
};
prototypeAccessors.canAwait.get = function() {
  for (var i = this.scopeStack.length - 1;i >= 0; i--) {
    var ref = this.scopeStack[i];
    var flags = ref.flags;
    if (flags & (SCOPE_CLASS_STATIC_BLOCK | SCOPE_CLASS_FIELD_INIT)) {
      return false;
    }
    if (flags & SCOPE_FUNCTION) {
      return (flags & SCOPE_ASYNC) > 0;
    }
  }
  return this.inModule && this.options.ecmaVersion >= 13 || this.options.allowAwaitOutsideFunction;
};
prototypeAccessors.allowReturn.get = function() {
  if (this.inFunction) {
    return true;
  }
  if (this.options.allowReturnOutsideFunction && this.currentVarScope().flags & SCOPE_TOP) {
    return true;
  }
  return false;
};
prototypeAccessors.allowSuper.get = function() {
  var ref = this.currentThisScope();
  var flags = ref.flags;
  return (flags & SCOPE_SUPER) > 0 || this.options.allowSuperOutsideMethod;
};
prototypeAccessors.allowDirectSuper.get = function() {
  return (this.currentThisScope().flags & SCOPE_DIRECT_SUPER) > 0;
};
prototypeAccessors.treatFunctionsAsVar.get = function() {
  return this.treatFunctionsAsVarInScope(this.currentScope());
};
prototypeAccessors.allowNewDotTarget.get = function() {
  for (var i = this.scopeStack.length - 1;i >= 0; i--) {
    var ref = this.scopeStack[i];
    var flags = ref.flags;
    if (flags & (SCOPE_CLASS_STATIC_BLOCK | SCOPE_CLASS_FIELD_INIT) || flags & SCOPE_FUNCTION && !(flags & SCOPE_ARROW)) {
      return true;
    }
  }
  return false;
};
prototypeAccessors.allowUsing.get = function() {
  var ref = this.currentScope();
  var flags = ref.flags;
  if (flags & SCOPE_SWITCH) {
    return false;
  }
  if (!this.inModule && flags & SCOPE_TOP) {
    return false;
  }
  return true;
};
prototypeAccessors.inClassStaticBlock.get = function() {
  return (this.currentVarScope().flags & SCOPE_CLASS_STATIC_BLOCK) > 0;
};
Parser.extend = function extend() {
  var plugins = [], len = arguments.length;
  while (len--)
    plugins[len] = arguments[len];
  var cls = this;
  for (var i = 0;i < plugins.length; i++) {
    cls = plugins[i](cls);
  }
  return cls;
};
Parser.parse = function parse(input, options) {
  return new this(options, input).parse();
};
Parser.parseExpressionAt = function parseExpressionAt(input, pos, options) {
  var parser = new this(options, input, pos);
  parser.nextToken();
  return parser.parseExpression();
};
Parser.tokenizer = function tokenizer(input, options) {
  return new this(options, input);
};
Object.defineProperties(Parser.prototype, prototypeAccessors);
var pp$9 = Parser.prototype;
var literal = /^(?:'((?:\\[^]|[^'\\])*?)'|"((?:\\[^]|[^"\\])*?)")/;
pp$9.strictDirective = function(start) {
  if (this.options.ecmaVersion < 5) {
    return false;
  }
  for (;; ) {
    skipWhiteSpace.lastIndex = start;
    start += skipWhiteSpace.exec(this.input)[0].length;
    var match = literal.exec(this.input.slice(start));
    if (!match) {
      return false;
    }
    if ((match[1] || match[2]) === "use strict") {
      skipWhiteSpace.lastIndex = start + match[0].length;
      var spaceAfter = skipWhiteSpace.exec(this.input), end = spaceAfter.index + spaceAfter[0].length;
      var next = this.input.charAt(end);
      return next === ";" || next === "}" || lineBreak.test(spaceAfter[0]) && !(/[(`.[+\-/*%<>=,?^&]/.test(next) || next === "!" && this.input.charAt(end + 1) === "=");
    }
    start += match[0].length;
    skipWhiteSpace.lastIndex = start;
    start += skipWhiteSpace.exec(this.input)[0].length;
    if (this.input[start] === ";") {
      start++;
    }
  }
};
pp$9.eat = function(type) {
  if (this.type === type) {
    this.next();
    return true;
  } else {
    return false;
  }
};
pp$9.isContextual = function(name) {
  return this.type === types$1.name && this.value === name && !this.containsEsc;
};
pp$9.eatContextual = function(name) {
  if (!this.isContextual(name)) {
    return false;
  }
  this.next();
  return true;
};
pp$9.expectContextual = function(name) {
  if (!this.eatContextual(name)) {
    this.unexpected();
  }
};
pp$9.canInsertSemicolon = function() {
  return this.type === types$1.eof || this.type === types$1.braceR || lineBreak.test(this.input.slice(this.lastTokEnd, this.start));
};
pp$9.insertSemicolon = function() {
  if (this.canInsertSemicolon()) {
    if (this.options.onInsertedSemicolon) {
      this.options.onInsertedSemicolon(this.lastTokEnd, this.lastTokEndLoc);
    }
    return true;
  }
};
pp$9.semicolon = function() {
  if (!this.eat(types$1.semi) && !this.insertSemicolon()) {
    this.unexpected();
  }
};
pp$9.afterTrailingComma = function(tokType, notNext) {
  if (this.type === tokType) {
    if (this.options.onTrailingComma) {
      this.options.onTrailingComma(this.lastTokStart, this.lastTokStartLoc);
    }
    if (!notNext) {
      this.next();
    }
    return true;
  }
};
pp$9.expect = function(type) {
  this.eat(type) || this.unexpected();
};
pp$9.unexpected = function(pos) {
  this.raise(pos != null ? pos : this.start, "Unexpected token");
};
var DestructuringErrors = function DestructuringErrors() {
  this.shorthandAssign = this.trailingComma = this.parenthesizedAssign = this.parenthesizedBind = this.doubleProto = -1;
};
pp$9.checkPatternErrors = function(refDestructuringErrors, isAssign) {
  if (!refDestructuringErrors) {
    return;
  }
  if (refDestructuringErrors.trailingComma > -1) {
    this.raiseRecoverable(refDestructuringErrors.trailingComma, "Comma is not permitted after the rest element");
  }
  var parens = isAssign ? refDestructuringErrors.parenthesizedAssign : refDestructuringErrors.parenthesizedBind;
  if (parens > -1) {
    this.raiseRecoverable(parens, isAssign ? "Assigning to rvalue" : "Parenthesized pattern");
  }
};
pp$9.checkExpressionErrors = function(refDestructuringErrors, andThrow) {
  if (!refDestructuringErrors) {
    return false;
  }
  var shorthandAssign = refDestructuringErrors.shorthandAssign;
  var doubleProto = refDestructuringErrors.doubleProto;
  if (!andThrow) {
    return shorthandAssign >= 0 || doubleProto >= 0;
  }
  if (shorthandAssign >= 0) {
    this.raise(shorthandAssign, "Shorthand property assignments are valid only in destructuring patterns");
  }
  if (doubleProto >= 0) {
    this.raiseRecoverable(doubleProto, "Redefinition of __proto__ property");
  }
};
pp$9.checkYieldAwaitInDefaultParams = function() {
  if (this.yieldPos && (!this.awaitPos || this.yieldPos < this.awaitPos)) {
    this.raise(this.yieldPos, "Yield expression cannot be a default value");
  }
  if (this.awaitPos) {
    this.raise(this.awaitPos, "Await expression cannot be a default value");
  }
};
pp$9.isSimpleAssignTarget = function(expr) {
  if (expr.type === "ParenthesizedExpression") {
    return this.isSimpleAssignTarget(expr.expression);
  }
  return expr.type === "Identifier" || expr.type === "MemberExpression";
};
var pp$8 = Parser.prototype;
pp$8.parseTopLevel = function(node) {
  var exports = Object.create(null);
  if (!node.body) {
    node.body = [];
  }
  while (this.type !== types$1.eof) {
    var stmt = this.parseStatement(null, true, exports);
    node.body.push(stmt);
  }
  if (this.inModule) {
    for (var i = 0, list = Object.keys(this.undefinedExports);i < list.length; i += 1) {
      var name = list[i];
      this.raiseRecoverable(this.undefinedExports[name].start, "Export '" + name + "' is not defined");
    }
  }
  this.adaptDirectivePrologue(node.body);
  this.next();
  node.sourceType = this.options.sourceType === "commonjs" ? "script" : this.options.sourceType;
  return this.finishNode(node, "Program");
};
var loopLabel = { kind: "loop" };
var switchLabel = { kind: "switch" };
pp$8.isLet = function(context) {
  if (this.options.ecmaVersion < 6 || !this.isContextual("let")) {
    return false;
  }
  skipWhiteSpace.lastIndex = this.pos;
  var skip = skipWhiteSpace.exec(this.input);
  var next = this.pos + skip[0].length, nextCh = this.fullCharCodeAt(next);
  if (nextCh === 91 || nextCh === 92) {
    return true;
  }
  if (context) {
    return false;
  }
  if (nextCh === 123) {
    return true;
  }
  if (isIdentifierStart(nextCh)) {
    var start = next;
    do {
      next += nextCh <= 65535 ? 1 : 2;
    } while (isIdentifierChar(nextCh = this.fullCharCodeAt(next)));
    if (nextCh === 92) {
      return true;
    }
    var ident = this.input.slice(start, next);
    if (!keywordRelationalOperator.test(ident)) {
      return true;
    }
  }
  return false;
};
pp$8.isAsyncFunction = function() {
  if (this.options.ecmaVersion < 8 || !this.isContextual("async")) {
    return false;
  }
  skipWhiteSpace.lastIndex = this.pos;
  var skip = skipWhiteSpace.exec(this.input);
  var next = this.pos + skip[0].length, after;
  return !lineBreak.test(this.input.slice(this.pos, next)) && this.input.slice(next, next + 8) === "function" && (next + 8 === this.input.length || !(isIdentifierChar(after = this.fullCharCodeAt(next + 8)) || after === 92));
};
pp$8.isUsingKeyword = function(isAwaitUsing, isFor) {
  if (this.options.ecmaVersion < 17 || !this.isContextual(isAwaitUsing ? "await" : "using")) {
    return false;
  }
  skipWhiteSpace.lastIndex = this.pos;
  var skip = skipWhiteSpace.exec(this.input);
  var next = this.pos + skip[0].length;
  if (lineBreak.test(this.input.slice(this.pos, next))) {
    return false;
  }
  if (isAwaitUsing) {
    var usingEndPos = next + 5, after;
    if (this.input.slice(next, usingEndPos) !== "using" || usingEndPos === this.input.length || isIdentifierChar(after = this.fullCharCodeAt(usingEndPos)) || after === 92) {
      return false;
    }
    skipWhiteSpace.lastIndex = usingEndPos;
    var skipAfterUsing = skipWhiteSpace.exec(this.input);
    next = usingEndPos + skipAfterUsing[0].length;
    if (skipAfterUsing && lineBreak.test(this.input.slice(usingEndPos, next))) {
      return false;
    }
  }
  var ch = this.fullCharCodeAt(next);
  if (!isIdentifierStart(ch) && ch !== 92) {
    return false;
  }
  var idStart = next;
  do {
    next += ch <= 65535 ? 1 : 2;
  } while (isIdentifierChar(ch = this.fullCharCodeAt(next)));
  if (ch === 92) {
    return true;
  }
  var id = this.input.slice(idStart, next);
  if (keywordRelationalOperator.test(id) || isFor && id === "of") {
    return false;
  }
  return true;
};
pp$8.isAwaitUsing = function(isFor) {
  return this.isUsingKeyword(true, isFor);
};
pp$8.isUsing = function(isFor) {
  return this.isUsingKeyword(false, isFor);
};
pp$8.parseStatement = function(context, topLevel, exports) {
  var starttype = this.type, node = this.startNode(), kind;
  if (this.isLet(context)) {
    starttype = types$1._var;
    kind = "let";
  }
  switch (starttype) {
    case types$1._break:
    case types$1._continue:
      return this.parseBreakContinueStatement(node, starttype.keyword);
    case types$1._debugger:
      return this.parseDebuggerStatement(node);
    case types$1._do:
      return this.parseDoStatement(node);
    case types$1._for:
      return this.parseForStatement(node);
    case types$1._function:
      if (context && (this.strict || context !== "if" && context !== "label") && this.options.ecmaVersion >= 6) {
        this.unexpected();
      }
      return this.parseFunctionStatement(node, false, !context);
    case types$1._class:
      if (context) {
        this.unexpected();
      }
      return this.parseClass(node, true);
    case types$1._if:
      return this.parseIfStatement(node);
    case types$1._return:
      return this.parseReturnStatement(node);
    case types$1._switch:
      return this.parseSwitchStatement(node);
    case types$1._throw:
      return this.parseThrowStatement(node);
    case types$1._try:
      return this.parseTryStatement(node);
    case types$1._const:
    case types$1._var:
      kind = kind || this.value;
      if (context && kind !== "var") {
        this.unexpected();
      }
      return this.parseVarStatement(node, kind);
    case types$1._while:
      return this.parseWhileStatement(node);
    case types$1._with:
      return this.parseWithStatement(node);
    case types$1.braceL:
      return this.parseBlock(true, node);
    case types$1.semi:
      return this.parseEmptyStatement(node);
    case types$1._export:
    case types$1._import:
      if (this.options.ecmaVersion > 10 && starttype === types$1._import) {
        skipWhiteSpace.lastIndex = this.pos;
        var skip = skipWhiteSpace.exec(this.input);
        var next = this.pos + skip[0].length, nextCh = this.input.charCodeAt(next);
        if (nextCh === 40 || nextCh === 46) {
          return this.parseExpressionStatement(node, this.parseExpression());
        }
      }
      if (!this.options.allowImportExportEverywhere) {
        if (!topLevel) {
          this.raise(this.start, "'import' and 'export' may only appear at the top level");
        }
        if (!this.inModule) {
          this.raise(this.start, "'import' and 'export' may appear only with 'sourceType: module'");
        }
      }
      return starttype === types$1._import ? this.parseImport(node) : this.parseExport(node, exports);
    default:
      if (this.isAsyncFunction()) {
        if (context) {
          this.unexpected();
        }
        this.next();
        return this.parseFunctionStatement(node, true, !context);
      }
      var usingKind = this.isAwaitUsing(false) ? "await using" : this.isUsing(false) ? "using" : null;
      if (usingKind) {
        if (!this.allowUsing) {
          this.raise(this.start, "Using declaration cannot appear in the top level when source type is `script` or in the bare case statement");
        }
        if (usingKind === "await using") {
          if (!this.canAwait) {
            this.raise(this.start, "Await using cannot appear outside of async function");
          }
          this.next();
        }
        this.next();
        this.parseVar(node, false, usingKind);
        this.semicolon();
        return this.finishNode(node, "VariableDeclaration");
      }
      var maybeName = this.value, expr = this.parseExpression();
      if (starttype === types$1.name && expr.type === "Identifier" && this.eat(types$1.colon)) {
        return this.parseLabeledStatement(node, maybeName, expr, context);
      } else {
        return this.parseExpressionStatement(node, expr);
      }
  }
};
pp$8.parseBreakContinueStatement = function(node, keyword) {
  var isBreak = keyword === "break";
  this.next();
  if (this.eat(types$1.semi) || this.insertSemicolon()) {
    node.label = null;
  } else if (this.type !== types$1.name) {
    this.unexpected();
  } else {
    node.label = this.parseIdent();
    this.semicolon();
  }
  var i = 0;
  for (;i < this.labels.length; ++i) {
    var lab = this.labels[i];
    if (node.label == null || lab.name === node.label.name) {
      if (lab.kind != null && (isBreak || lab.kind === "loop")) {
        break;
      }
      if (node.label && isBreak) {
        break;
      }
    }
  }
  if (i === this.labels.length) {
    this.raise(node.start, "Unsyntactic " + keyword);
  }
  return this.finishNode(node, isBreak ? "BreakStatement" : "ContinueStatement");
};
pp$8.parseDebuggerStatement = function(node) {
  this.next();
  this.semicolon();
  return this.finishNode(node, "DebuggerStatement");
};
pp$8.parseDoStatement = function(node) {
  this.next();
  this.labels.push(loopLabel);
  node.body = this.parseStatement("do");
  this.labels.pop();
  this.expect(types$1._while);
  node.test = this.parseParenExpression();
  if (this.options.ecmaVersion >= 6) {
    this.eat(types$1.semi);
  } else {
    this.semicolon();
  }
  return this.finishNode(node, "DoWhileStatement");
};
pp$8.parseForStatement = function(node) {
  this.next();
  var awaitAt = this.options.ecmaVersion >= 9 && this.canAwait && this.eatContextual("await") ? this.lastTokStart : -1;
  this.labels.push(loopLabel);
  this.enterScope(0);
  this.expect(types$1.parenL);
  if (this.type === types$1.semi) {
    if (awaitAt > -1) {
      this.unexpected(awaitAt);
    }
    return this.parseFor(node, null);
  }
  var isLet = this.isLet();
  if (this.type === types$1._var || this.type === types$1._const || isLet) {
    var init$1 = this.startNode(), kind = isLet ? "let" : this.value;
    this.next();
    this.parseVar(init$1, true, kind);
    this.finishNode(init$1, "VariableDeclaration");
    return this.parseForAfterInit(node, init$1, awaitAt);
  }
  var startsWithLet = this.isContextual("let"), isForOf = false;
  var usingKind = this.isUsing(true) ? "using" : this.isAwaitUsing(true) ? "await using" : null;
  if (usingKind) {
    var init$2 = this.startNode();
    this.next();
    if (usingKind === "await using") {
      if (!this.canAwait) {
        this.raise(this.start, "Await using cannot appear outside of async function");
      }
      this.next();
    }
    this.parseVar(init$2, true, usingKind);
    this.finishNode(init$2, "VariableDeclaration");
    return this.parseForAfterInit(node, init$2, awaitAt);
  }
  var containsEsc = this.containsEsc;
  var refDestructuringErrors = new DestructuringErrors;
  var initPos = this.start;
  var init = awaitAt > -1 ? this.parseExprSubscripts(refDestructuringErrors, "await") : this.parseExpression(true, refDestructuringErrors);
  if (this.type === types$1._in || (isForOf = this.options.ecmaVersion >= 6 && this.isContextual("of"))) {
    if (awaitAt > -1) {
      if (this.type === types$1._in) {
        this.unexpected(awaitAt);
      }
      node.await = true;
    } else if (isForOf && this.options.ecmaVersion >= 8) {
      if (init.start === initPos && !containsEsc && init.type === "Identifier" && init.name === "async") {
        this.unexpected();
      } else if (this.options.ecmaVersion >= 9) {
        node.await = false;
      }
    }
    if (startsWithLet && isForOf) {
      this.raise(init.start, "The left-hand side of a for-of loop may not start with 'let'.");
    }
    this.toAssignable(init, false, refDestructuringErrors);
    this.checkLValPattern(init);
    return this.parseForIn(node, init);
  } else {
    this.checkExpressionErrors(refDestructuringErrors, true);
  }
  if (awaitAt > -1) {
    this.unexpected(awaitAt);
  }
  return this.parseFor(node, init);
};
pp$8.parseForAfterInit = function(node, init, awaitAt) {
  if ((this.type === types$1._in || this.options.ecmaVersion >= 6 && this.isContextual("of")) && init.declarations.length === 1) {
    if (this.options.ecmaVersion >= 9) {
      if (this.type === types$1._in) {
        if (awaitAt > -1) {
          this.unexpected(awaitAt);
        }
      } else {
        node.await = awaitAt > -1;
      }
    }
    return this.parseForIn(node, init);
  }
  if (awaitAt > -1) {
    this.unexpected(awaitAt);
  }
  return this.parseFor(node, init);
};
pp$8.parseFunctionStatement = function(node, isAsync, declarationPosition) {
  this.next();
  return this.parseFunction(node, FUNC_STATEMENT | (declarationPosition ? 0 : FUNC_HANGING_STATEMENT), false, isAsync);
};
pp$8.parseIfStatement = function(node) {
  this.next();
  node.test = this.parseParenExpression();
  node.consequent = this.parseStatement("if");
  node.alternate = this.eat(types$1._else) ? this.parseStatement("if") : null;
  return this.finishNode(node, "IfStatement");
};
pp$8.parseReturnStatement = function(node) {
  if (!this.allowReturn) {
    this.raise(this.start, "'return' outside of function");
  }
  this.next();
  if (this.eat(types$1.semi) || this.insertSemicolon()) {
    node.argument = null;
  } else {
    node.argument = this.parseExpression();
    this.semicolon();
  }
  return this.finishNode(node, "ReturnStatement");
};
pp$8.parseSwitchStatement = function(node) {
  this.next();
  node.discriminant = this.parseParenExpression();
  node.cases = [];
  this.expect(types$1.braceL);
  this.labels.push(switchLabel);
  this.enterScope(SCOPE_SWITCH);
  var cur;
  for (var sawDefault = false;this.type !== types$1.braceR; ) {
    if (this.type === types$1._case || this.type === types$1._default) {
      var isCase = this.type === types$1._case;
      if (cur) {
        this.finishNode(cur, "SwitchCase");
      }
      node.cases.push(cur = this.startNode());
      cur.consequent = [];
      this.next();
      if (isCase) {
        cur.test = this.parseExpression();
      } else {
        if (sawDefault) {
          this.raiseRecoverable(this.lastTokStart, "Multiple default clauses");
        }
        sawDefault = true;
        cur.test = null;
      }
      this.expect(types$1.colon);
    } else {
      if (!cur) {
        this.unexpected();
      }
      cur.consequent.push(this.parseStatement(null));
    }
  }
  this.exitScope();
  if (cur) {
    this.finishNode(cur, "SwitchCase");
  }
  this.next();
  this.labels.pop();
  return this.finishNode(node, "SwitchStatement");
};
pp$8.parseThrowStatement = function(node) {
  this.next();
  if (lineBreak.test(this.input.slice(this.lastTokEnd, this.start))) {
    this.raise(this.lastTokEnd, "Illegal newline after throw");
  }
  node.argument = this.parseExpression();
  this.semicolon();
  return this.finishNode(node, "ThrowStatement");
};
var empty$1 = [];
pp$8.parseCatchClauseParam = function() {
  var param = this.parseBindingAtom();
  var simple = param.type === "Identifier";
  this.enterScope(simple ? SCOPE_SIMPLE_CATCH : 0);
  this.checkLValPattern(param, simple ? BIND_SIMPLE_CATCH : BIND_LEXICAL);
  this.expect(types$1.parenR);
  return param;
};
pp$8.parseTryStatement = function(node) {
  this.next();
  node.block = this.parseBlock();
  node.handler = null;
  if (this.type === types$1._catch) {
    var clause = this.startNode();
    this.next();
    if (this.eat(types$1.parenL)) {
      clause.param = this.parseCatchClauseParam();
    } else {
      if (this.options.ecmaVersion < 10) {
        this.unexpected();
      }
      clause.param = null;
      this.enterScope(0);
    }
    clause.body = this.parseBlock(false);
    this.exitScope();
    node.handler = this.finishNode(clause, "CatchClause");
  }
  node.finalizer = this.eat(types$1._finally) ? this.parseBlock() : null;
  if (!node.handler && !node.finalizer) {
    this.raise(node.start, "Missing catch or finally clause");
  }
  return this.finishNode(node, "TryStatement");
};
pp$8.parseVarStatement = function(node, kind, allowMissingInitializer) {
  this.next();
  this.parseVar(node, false, kind, allowMissingInitializer);
  this.semicolon();
  return this.finishNode(node, "VariableDeclaration");
};
pp$8.parseWhileStatement = function(node) {
  this.next();
  node.test = this.parseParenExpression();
  this.labels.push(loopLabel);
  node.body = this.parseStatement("while");
  this.labels.pop();
  return this.finishNode(node, "WhileStatement");
};
pp$8.parseWithStatement = function(node) {
  if (this.strict) {
    this.raise(this.start, "'with' in strict mode");
  }
  this.next();
  node.object = this.parseParenExpression();
  node.body = this.parseStatement("with");
  return this.finishNode(node, "WithStatement");
};
pp$8.parseEmptyStatement = function(node) {
  this.next();
  return this.finishNode(node, "EmptyStatement");
};
pp$8.parseLabeledStatement = function(node, maybeName, expr, context) {
  for (var i$1 = 0, list = this.labels;i$1 < list.length; i$1 += 1) {
    var label = list[i$1];
    if (label.name === maybeName) {
      this.raise(expr.start, "Label '" + maybeName + "' is already declared");
    }
  }
  var kind = this.type.isLoop ? "loop" : this.type === types$1._switch ? "switch" : null;
  for (var i = this.labels.length - 1;i >= 0; i--) {
    var label$1 = this.labels[i];
    if (label$1.statementStart === node.start) {
      label$1.statementStart = this.start;
      label$1.kind = kind;
    } else {
      break;
    }
  }
  this.labels.push({ name: maybeName, kind, statementStart: this.start });
  node.body = this.parseStatement(context ? context.indexOf("label") === -1 ? context + "label" : context : "label");
  this.labels.pop();
  node.label = expr;
  return this.finishNode(node, "LabeledStatement");
};
pp$8.parseExpressionStatement = function(node, expr) {
  node.expression = expr;
  this.semicolon();
  return this.finishNode(node, "ExpressionStatement");
};
pp$8.parseBlock = function(createNewLexicalScope, node, exitStrict) {
  if (createNewLexicalScope === undefined)
    createNewLexicalScope = true;
  if (node === undefined)
    node = this.startNode();
  node.body = [];
  this.expect(types$1.braceL);
  if (createNewLexicalScope) {
    this.enterScope(0);
  }
  while (this.type !== types$1.braceR) {
    var stmt = this.parseStatement(null);
    node.body.push(stmt);
  }
  if (exitStrict) {
    this.strict = false;
  }
  this.next();
  if (createNewLexicalScope) {
    this.exitScope();
  }
  return this.finishNode(node, "BlockStatement");
};
pp$8.parseFor = function(node, init) {
  node.init = init;
  this.expect(types$1.semi);
  node.test = this.type === types$1.semi ? null : this.parseExpression();
  this.expect(types$1.semi);
  node.update = this.type === types$1.parenR ? null : this.parseExpression();
  this.expect(types$1.parenR);
  node.body = this.parseStatement("for");
  this.exitScope();
  this.labels.pop();
  return this.finishNode(node, "ForStatement");
};
pp$8.parseForIn = function(node, init) {
  var isForIn = this.type === types$1._in;
  this.next();
  if (init.type === "VariableDeclaration" && init.declarations[0].init != null && (!isForIn || this.options.ecmaVersion < 8 || this.strict || init.kind !== "var" || init.declarations[0].id.type !== "Identifier")) {
    this.raise(init.start, (isForIn ? "for-in" : "for-of") + " loop variable declaration may not have an initializer");
  }
  node.left = init;
  node.right = isForIn ? this.parseExpression() : this.parseMaybeAssign();
  this.expect(types$1.parenR);
  node.body = this.parseStatement("for");
  this.exitScope();
  this.labels.pop();
  return this.finishNode(node, isForIn ? "ForInStatement" : "ForOfStatement");
};
pp$8.parseVar = function(node, isFor, kind, allowMissingInitializer) {
  node.declarations = [];
  node.kind = kind;
  for (;; ) {
    var decl = this.startNode();
    this.parseVarId(decl, kind);
    if (this.eat(types$1.eq)) {
      decl.init = this.parseMaybeAssign(isFor);
    } else if (!allowMissingInitializer && kind === "const" && !(this.type === types$1._in || this.options.ecmaVersion >= 6 && this.isContextual("of"))) {
      this.unexpected();
    } else if (!allowMissingInitializer && (kind === "using" || kind === "await using") && this.options.ecmaVersion >= 17 && this.type !== types$1._in && !this.isContextual("of")) {
      this.raise(this.lastTokEnd, "Missing initializer in " + kind + " declaration");
    } else if (!allowMissingInitializer && decl.id.type !== "Identifier" && !(isFor && (this.type === types$1._in || this.isContextual("of")))) {
      this.raise(this.lastTokEnd, "Complex binding patterns require an initialization value");
    } else {
      decl.init = null;
    }
    node.declarations.push(this.finishNode(decl, "VariableDeclarator"));
    if (!this.eat(types$1.comma)) {
      break;
    }
  }
  return node;
};
pp$8.parseVarId = function(decl, kind) {
  decl.id = kind === "using" || kind === "await using" ? this.parseIdent() : this.parseBindingAtom();
  this.checkLValPattern(decl.id, kind === "var" ? BIND_VAR : BIND_LEXICAL, false);
};
var FUNC_STATEMENT = 1;
var FUNC_HANGING_STATEMENT = 2;
var FUNC_NULLABLE_ID = 4;
pp$8.parseFunction = function(node, statement, allowExpressionBody, isAsync, forInit) {
  this.initFunction(node);
  if (this.options.ecmaVersion >= 9 || this.options.ecmaVersion >= 6 && !isAsync) {
    if (this.type === types$1.star && statement & FUNC_HANGING_STATEMENT) {
      this.unexpected();
    }
    node.generator = this.eat(types$1.star);
  }
  if (this.options.ecmaVersion >= 8) {
    node.async = !!isAsync;
  }
  if (statement & FUNC_STATEMENT) {
    node.id = statement & FUNC_NULLABLE_ID && this.type !== types$1.name ? null : this.parseIdent();
    if (node.id && !(statement & FUNC_HANGING_STATEMENT)) {
      this.checkLValSimple(node.id, this.strict || node.generator || node.async ? this.treatFunctionsAsVar ? BIND_VAR : BIND_LEXICAL : BIND_FUNCTION);
    }
  }
  var oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
  this.yieldPos = 0;
  this.awaitPos = 0;
  this.awaitIdentPos = 0;
  this.enterScope(functionFlags(node.async, node.generator));
  if (!(statement & FUNC_STATEMENT)) {
    node.id = this.type === types$1.name ? this.parseIdent() : null;
  }
  this.parseFunctionParams(node);
  this.parseFunctionBody(node, allowExpressionBody, false, forInit);
  this.yieldPos = oldYieldPos;
  this.awaitPos = oldAwaitPos;
  this.awaitIdentPos = oldAwaitIdentPos;
  return this.finishNode(node, statement & FUNC_STATEMENT ? "FunctionDeclaration" : "FunctionExpression");
};
pp$8.parseFunctionParams = function(node) {
  this.expect(types$1.parenL);
  node.params = this.parseBindingList(types$1.parenR, false, this.options.ecmaVersion >= 8);
  this.checkYieldAwaitInDefaultParams();
};
pp$8.parseClass = function(node, isStatement) {
  this.next();
  var oldStrict = this.strict;
  this.strict = true;
  this.parseClassId(node, isStatement);
  this.parseClassSuper(node);
  var privateNameMap = this.enterClassBody();
  var classBody = this.startNode();
  var hadConstructor = false;
  classBody.body = [];
  this.expect(types$1.braceL);
  while (this.type !== types$1.braceR) {
    var element = this.parseClassElement(node.superClass !== null);
    if (element) {
      classBody.body.push(element);
      if (element.type === "MethodDefinition" && element.kind === "constructor") {
        if (hadConstructor) {
          this.raiseRecoverable(element.start, "Duplicate constructor in the same class");
        }
        hadConstructor = true;
      } else if (element.key && element.key.type === "PrivateIdentifier" && isPrivateNameConflicted(privateNameMap, element)) {
        this.raiseRecoverable(element.key.start, "Identifier '#" + element.key.name + "' has already been declared");
      }
    }
  }
  this.strict = oldStrict;
  this.next();
  node.body = this.finishNode(classBody, "ClassBody");
  this.exitClassBody();
  return this.finishNode(node, isStatement ? "ClassDeclaration" : "ClassExpression");
};
pp$8.parseClassElement = function(constructorAllowsSuper) {
  if (this.eat(types$1.semi)) {
    return null;
  }
  var ecmaVersion = this.options.ecmaVersion;
  var node = this.startNode();
  var keyName = "";
  var isGenerator = false;
  var isAsync = false;
  var kind = "method";
  var isStatic = false;
  if (this.eatContextual("static")) {
    if (ecmaVersion >= 13 && this.eat(types$1.braceL)) {
      this.parseClassStaticBlock(node);
      return node;
    }
    if (this.isClassElementNameStart() || this.type === types$1.star) {
      isStatic = true;
    } else {
      keyName = "static";
    }
  }
  node.static = isStatic;
  if (!keyName && ecmaVersion >= 8 && this.eatContextual("async")) {
    if ((this.isClassElementNameStart() || this.type === types$1.star) && !this.canInsertSemicolon()) {
      isAsync = true;
    } else {
      keyName = "async";
    }
  }
  if (!keyName && (ecmaVersion >= 9 || !isAsync) && this.eat(types$1.star)) {
    isGenerator = true;
  }
  if (!keyName && !isAsync && !isGenerator) {
    var lastValue = this.value;
    if (this.eatContextual("get") || this.eatContextual("set")) {
      if (this.isClassElementNameStart()) {
        kind = lastValue;
      } else {
        keyName = lastValue;
      }
    }
  }
  if (keyName) {
    node.computed = false;
    node.key = this.startNodeAt(this.lastTokStart, this.lastTokStartLoc);
    node.key.name = keyName;
    this.finishNode(node.key, "Identifier");
  } else {
    this.parseClassElementName(node);
  }
  if (ecmaVersion < 13 || this.type === types$1.parenL || kind !== "method" || isGenerator || isAsync) {
    var isConstructor = !node.static && checkKeyName(node, "constructor");
    var allowsDirectSuper = isConstructor && constructorAllowsSuper;
    if (isConstructor && kind !== "method") {
      this.raise(node.key.start, "Constructor can't have get/set modifier");
    }
    node.kind = isConstructor ? "constructor" : kind;
    this.parseClassMethod(node, isGenerator, isAsync, allowsDirectSuper);
  } else {
    this.parseClassField(node);
  }
  return node;
};
pp$8.isClassElementNameStart = function() {
  return this.type === types$1.name || this.type === types$1.privateId || this.type === types$1.num || this.type === types$1.string || this.type === types$1.bracketL || this.type.keyword;
};
pp$8.parseClassElementName = function(element) {
  if (this.type === types$1.privateId) {
    if (this.value === "constructor") {
      this.raise(this.start, "Classes can't have an element named '#constructor'");
    }
    element.computed = false;
    element.key = this.parsePrivateIdent();
  } else {
    this.parsePropertyName(element);
  }
};
pp$8.parseClassMethod = function(method, isGenerator, isAsync, allowsDirectSuper) {
  var key = method.key;
  if (method.kind === "constructor") {
    if (isGenerator) {
      this.raise(key.start, "Constructor can't be a generator");
    }
    if (isAsync) {
      this.raise(key.start, "Constructor can't be an async method");
    }
  } else if (method.static && checkKeyName(method, "prototype")) {
    this.raise(key.start, "Classes may not have a static property named prototype");
  }
  var value = method.value = this.parseMethod(isGenerator, isAsync, allowsDirectSuper);
  if (method.kind === "get" && value.params.length !== 0) {
    this.raiseRecoverable(value.start, "getter should have no params");
  }
  if (method.kind === "set" && value.params.length !== 1) {
    this.raiseRecoverable(value.start, "setter should have exactly one param");
  }
  if (method.kind === "set" && value.params[0].type === "RestElement") {
    this.raiseRecoverable(value.params[0].start, "Setter cannot use rest params");
  }
  return this.finishNode(method, "MethodDefinition");
};
pp$8.parseClassField = function(field) {
  if (checkKeyName(field, "constructor")) {
    this.raise(field.key.start, "Classes can't have a field named 'constructor'");
  } else if (field.static && checkKeyName(field, "prototype")) {
    this.raise(field.key.start, "Classes can't have a static field named 'prototype'");
  }
  if (this.eat(types$1.eq)) {
    this.enterScope(SCOPE_CLASS_FIELD_INIT | SCOPE_SUPER);
    field.value = this.parseMaybeAssign();
    this.exitScope();
  } else {
    field.value = null;
  }
  this.semicolon();
  return this.finishNode(field, "PropertyDefinition");
};
pp$8.parseClassStaticBlock = function(node) {
  node.body = [];
  var oldLabels = this.labels;
  this.labels = [];
  this.enterScope(SCOPE_CLASS_STATIC_BLOCK | SCOPE_SUPER);
  while (this.type !== types$1.braceR) {
    var stmt = this.parseStatement(null);
    node.body.push(stmt);
  }
  this.next();
  this.exitScope();
  this.labels = oldLabels;
  return this.finishNode(node, "StaticBlock");
};
pp$8.parseClassId = function(node, isStatement) {
  if (this.type === types$1.name) {
    node.id = this.parseIdent();
    if (isStatement) {
      this.checkLValSimple(node.id, BIND_LEXICAL, false);
    }
  } else {
    if (isStatement === true) {
      this.unexpected();
    }
    node.id = null;
  }
};
pp$8.parseClassSuper = function(node) {
  node.superClass = this.eat(types$1._extends) ? this.parseExprSubscripts(null, false) : null;
};
pp$8.enterClassBody = function() {
  var element = { declared: Object.create(null), used: [] };
  this.privateNameStack.push(element);
  return element.declared;
};
pp$8.exitClassBody = function() {
  var ref = this.privateNameStack.pop();
  var declared = ref.declared;
  var used = ref.used;
  if (!this.options.checkPrivateFields) {
    return;
  }
  var len = this.privateNameStack.length;
  var parent = len === 0 ? null : this.privateNameStack[len - 1];
  for (var i = 0;i < used.length; ++i) {
    var id = used[i];
    if (!hasOwn(declared, id.name)) {
      if (parent) {
        parent.used.push(id);
      } else {
        this.raiseRecoverable(id.start, "Private field '#" + id.name + "' must be declared in an enclosing class");
      }
    }
  }
};
function isPrivateNameConflicted(privateNameMap, element) {
  var name = element.key.name;
  var curr = privateNameMap[name];
  var next = "true";
  if (element.type === "MethodDefinition" && (element.kind === "get" || element.kind === "set")) {
    next = (element.static ? "s" : "i") + element.kind;
  }
  if (curr === "iget" && next === "iset" || curr === "iset" && next === "iget" || curr === "sget" && next === "sset" || curr === "sset" && next === "sget") {
    privateNameMap[name] = "true";
    return false;
  } else if (!curr) {
    privateNameMap[name] = next;
    return false;
  } else {
    return true;
  }
}
function checkKeyName(node, name) {
  var computed = node.computed;
  var key = node.key;
  return !computed && (key.type === "Identifier" && key.name === name || key.type === "Literal" && key.value === name);
}
pp$8.parseExportAllDeclaration = function(node, exports) {
  if (this.options.ecmaVersion >= 11) {
    if (this.eatContextual("as")) {
      node.exported = this.parseModuleExportName();
      this.checkExport(exports, node.exported, this.lastTokStart);
    } else {
      node.exported = null;
    }
  }
  this.expectContextual("from");
  if (this.type !== types$1.string) {
    this.unexpected();
  }
  node.source = this.parseExprAtom();
  if (this.options.ecmaVersion >= 16) {
    node.attributes = this.parseWithClause();
  }
  this.semicolon();
  return this.finishNode(node, "ExportAllDeclaration");
};
pp$8.parseExport = function(node, exports) {
  this.next();
  if (this.eat(types$1.star)) {
    return this.parseExportAllDeclaration(node, exports);
  }
  if (this.eat(types$1._default)) {
    this.checkExport(exports, "default", this.lastTokStart);
    node.declaration = this.parseExportDefaultDeclaration();
    return this.finishNode(node, "ExportDefaultDeclaration");
  }
  if (this.shouldParseExportStatement()) {
    node.declaration = this.parseExportDeclaration(node);
    if (node.declaration.type === "VariableDeclaration") {
      this.checkVariableExport(exports, node.declaration.declarations);
    } else {
      this.checkExport(exports, node.declaration.id, node.declaration.id.start);
    }
    node.specifiers = [];
    node.source = null;
    if (this.options.ecmaVersion >= 16) {
      node.attributes = [];
    }
  } else {
    node.declaration = null;
    node.specifiers = this.parseExportSpecifiers(exports);
    if (this.eatContextual("from")) {
      if (this.type !== types$1.string) {
        this.unexpected();
      }
      node.source = this.parseExprAtom();
      if (this.options.ecmaVersion >= 16) {
        node.attributes = this.parseWithClause();
      }
    } else {
      for (var i = 0, list = node.specifiers;i < list.length; i += 1) {
        var spec = list[i];
        this.checkUnreserved(spec.local);
        this.checkLocalExport(spec.local);
        if (spec.local.type === "Literal") {
          this.raise(spec.local.start, "A string literal cannot be used as an exported binding without `from`.");
        }
      }
      node.source = null;
      if (this.options.ecmaVersion >= 16) {
        node.attributes = [];
      }
    }
    this.semicolon();
  }
  return this.finishNode(node, "ExportNamedDeclaration");
};
pp$8.parseExportDeclaration = function(node) {
  return this.parseStatement(null);
};
pp$8.parseExportDefaultDeclaration = function() {
  var isAsync;
  if (this.type === types$1._function || (isAsync = this.isAsyncFunction())) {
    var fNode = this.startNode();
    this.next();
    if (isAsync) {
      this.next();
    }
    return this.parseFunction(fNode, FUNC_STATEMENT | FUNC_NULLABLE_ID, false, isAsync);
  } else if (this.type === types$1._class) {
    var cNode = this.startNode();
    return this.parseClass(cNode, "nullableID");
  } else {
    var declaration = this.parseMaybeAssign();
    this.semicolon();
    return declaration;
  }
};
pp$8.checkExport = function(exports, name, pos) {
  if (!exports) {
    return;
  }
  if (typeof name !== "string") {
    name = name.type === "Identifier" ? name.name : name.value;
  }
  if (hasOwn(exports, name)) {
    this.raiseRecoverable(pos, "Duplicate export '" + name + "'");
  }
  exports[name] = true;
};
pp$8.checkPatternExport = function(exports, pat) {
  var type = pat.type;
  if (type === "Identifier") {
    this.checkExport(exports, pat, pat.start);
  } else if (type === "ObjectPattern") {
    for (var i = 0, list = pat.properties;i < list.length; i += 1) {
      var prop = list[i];
      this.checkPatternExport(exports, prop);
    }
  } else if (type === "ArrayPattern") {
    for (var i$1 = 0, list$1 = pat.elements;i$1 < list$1.length; i$1 += 1) {
      var elt = list$1[i$1];
      if (elt) {
        this.checkPatternExport(exports, elt);
      }
    }
  } else if (type === "Property") {
    this.checkPatternExport(exports, pat.value);
  } else if (type === "AssignmentPattern") {
    this.checkPatternExport(exports, pat.left);
  } else if (type === "RestElement") {
    this.checkPatternExport(exports, pat.argument);
  }
};
pp$8.checkVariableExport = function(exports, decls) {
  if (!exports) {
    return;
  }
  for (var i = 0, list = decls;i < list.length; i += 1) {
    var decl = list[i];
    this.checkPatternExport(exports, decl.id);
  }
};
pp$8.shouldParseExportStatement = function() {
  return this.type.keyword === "var" || this.type.keyword === "const" || this.type.keyword === "class" || this.type.keyword === "function" || this.isLet() || this.isAsyncFunction();
};
pp$8.parseExportSpecifier = function(exports) {
  var node = this.startNode();
  node.local = this.parseModuleExportName();
  node.exported = this.eatContextual("as") ? this.parseModuleExportName() : node.local;
  this.checkExport(exports, node.exported, node.exported.start);
  return this.finishNode(node, "ExportSpecifier");
};
pp$8.parseExportSpecifiers = function(exports) {
  var nodes = [], first = true;
  this.expect(types$1.braceL);
  while (!this.eat(types$1.braceR)) {
    if (!first) {
      this.expect(types$1.comma);
      if (this.afterTrailingComma(types$1.braceR)) {
        break;
      }
    } else {
      first = false;
    }
    nodes.push(this.parseExportSpecifier(exports));
  }
  return nodes;
};
pp$8.parseImport = function(node) {
  this.next();
  if (this.type === types$1.string) {
    node.specifiers = empty$1;
    node.source = this.parseExprAtom();
  } else {
    node.specifiers = this.parseImportSpecifiers();
    this.expectContextual("from");
    node.source = this.type === types$1.string ? this.parseExprAtom() : this.unexpected();
  }
  if (this.options.ecmaVersion >= 16) {
    node.attributes = this.parseWithClause();
  }
  this.semicolon();
  return this.finishNode(node, "ImportDeclaration");
};
pp$8.parseImportSpecifier = function() {
  var node = this.startNode();
  node.imported = this.parseModuleExportName();
  if (this.eatContextual("as")) {
    node.local = this.parseIdent();
  } else {
    this.checkUnreserved(node.imported);
    node.local = node.imported;
  }
  this.checkLValSimple(node.local, BIND_LEXICAL);
  return this.finishNode(node, "ImportSpecifier");
};
pp$8.parseImportDefaultSpecifier = function() {
  var node = this.startNode();
  node.local = this.parseIdent();
  this.checkLValSimple(node.local, BIND_LEXICAL);
  return this.finishNode(node, "ImportDefaultSpecifier");
};
pp$8.parseImportNamespaceSpecifier = function() {
  var node = this.startNode();
  this.next();
  this.expectContextual("as");
  node.local = this.parseIdent();
  this.checkLValSimple(node.local, BIND_LEXICAL);
  return this.finishNode(node, "ImportNamespaceSpecifier");
};
pp$8.parseImportSpecifiers = function() {
  var nodes = [], first = true;
  if (this.type === types$1.name) {
    nodes.push(this.parseImportDefaultSpecifier());
    if (!this.eat(types$1.comma)) {
      return nodes;
    }
  }
  if (this.type === types$1.star) {
    nodes.push(this.parseImportNamespaceSpecifier());
    return nodes;
  }
  this.expect(types$1.braceL);
  while (!this.eat(types$1.braceR)) {
    if (!first) {
      this.expect(types$1.comma);
      if (this.afterTrailingComma(types$1.braceR)) {
        break;
      }
    } else {
      first = false;
    }
    nodes.push(this.parseImportSpecifier());
  }
  return nodes;
};
pp$8.parseWithClause = function() {
  var nodes = [];
  if (!this.eat(types$1._with)) {
    return nodes;
  }
  this.expect(types$1.braceL);
  var attributeKeys = {};
  var first = true;
  while (!this.eat(types$1.braceR)) {
    if (!first) {
      this.expect(types$1.comma);
      if (this.afterTrailingComma(types$1.braceR)) {
        break;
      }
    } else {
      first = false;
    }
    var attr = this.parseImportAttribute();
    var keyName = attr.key.type === "Identifier" ? attr.key.name : attr.key.value;
    if (hasOwn(attributeKeys, keyName)) {
      this.raiseRecoverable(attr.key.start, "Duplicate attribute key '" + keyName + "'");
    }
    attributeKeys[keyName] = true;
    nodes.push(attr);
  }
  return nodes;
};
pp$8.parseImportAttribute = function() {
  var node = this.startNode();
  node.key = this.type === types$1.string ? this.parseExprAtom() : this.parseIdent(this.options.allowReserved !== "never");
  this.expect(types$1.colon);
  if (this.type !== types$1.string) {
    this.unexpected();
  }
  node.value = this.parseExprAtom();
  return this.finishNode(node, "ImportAttribute");
};
pp$8.parseModuleExportName = function() {
  if (this.options.ecmaVersion >= 13 && this.type === types$1.string) {
    var stringLiteral = this.parseLiteral(this.value);
    if (loneSurrogate.test(stringLiteral.value)) {
      this.raise(stringLiteral.start, "An export name cannot include a lone surrogate.");
    }
    return stringLiteral;
  }
  return this.parseIdent(true);
};
pp$8.adaptDirectivePrologue = function(statements) {
  for (var i = 0;i < statements.length && this.isDirectiveCandidate(statements[i]); ++i) {
    statements[i].directive = statements[i].expression.raw.slice(1, -1);
  }
};
pp$8.isDirectiveCandidate = function(statement) {
  return this.options.ecmaVersion >= 5 && statement.type === "ExpressionStatement" && statement.expression.type === "Literal" && typeof statement.expression.value === "string" && (this.input[statement.start] === '"' || this.input[statement.start] === "'");
};
var pp$7 = Parser.prototype;
pp$7.toAssignable = function(node, isBinding, refDestructuringErrors) {
  if (this.options.ecmaVersion >= 6 && node) {
    switch (node.type) {
      case "Identifier":
        if (this.inAsync && node.name === "await") {
          this.raise(node.start, "Cannot use 'await' as identifier inside an async function");
        }
        break;
      case "ObjectPattern":
      case "ArrayPattern":
      case "AssignmentPattern":
      case "RestElement":
        break;
      case "ObjectExpression":
        node.type = "ObjectPattern";
        if (refDestructuringErrors) {
          this.checkPatternErrors(refDestructuringErrors, true);
        }
        for (var i = 0, list = node.properties;i < list.length; i += 1) {
          var prop = list[i];
          this.toAssignable(prop, isBinding);
          if (prop.type === "RestElement" && (prop.argument.type === "ArrayPattern" || prop.argument.type === "ObjectPattern")) {
            this.raise(prop.argument.start, "Unexpected token");
          }
        }
        break;
      case "Property":
        if (node.kind !== "init") {
          this.raise(node.key.start, "Object pattern can't contain getter or setter");
        }
        this.toAssignable(node.value, isBinding);
        break;
      case "ArrayExpression":
        node.type = "ArrayPattern";
        if (refDestructuringErrors) {
          this.checkPatternErrors(refDestructuringErrors, true);
        }
        this.toAssignableList(node.elements, isBinding);
        break;
      case "SpreadElement":
        node.type = "RestElement";
        this.toAssignable(node.argument, isBinding);
        if (node.argument.type === "AssignmentPattern") {
          this.raise(node.argument.start, "Rest elements cannot have a default value");
        }
        break;
      case "AssignmentExpression":
        if (node.operator !== "=") {
          this.raise(node.left.end, "Only '=' operator can be used for specifying default value.");
        }
        node.type = "AssignmentPattern";
        delete node.operator;
        this.toAssignable(node.left, isBinding);
        break;
      case "ParenthesizedExpression":
        this.toAssignable(node.expression, isBinding, refDestructuringErrors);
        break;
      case "ChainExpression":
        this.raiseRecoverable(node.start, "Optional chaining cannot appear in left-hand side");
        break;
      case "MemberExpression":
        if (!isBinding) {
          break;
        }
      default:
        this.raise(node.start, "Assigning to rvalue");
    }
  } else if (refDestructuringErrors) {
    this.checkPatternErrors(refDestructuringErrors, true);
  }
  return node;
};
pp$7.toAssignableList = function(exprList, isBinding) {
  var end = exprList.length;
  for (var i = 0;i < end; i++) {
    var elt = exprList[i];
    if (elt) {
      this.toAssignable(elt, isBinding);
    }
  }
  if (end) {
    var last = exprList[end - 1];
    if (this.options.ecmaVersion === 6 && isBinding && last && last.type === "RestElement" && last.argument.type !== "Identifier") {
      this.unexpected(last.argument.start);
    }
  }
  return exprList;
};
pp$7.parseSpread = function(refDestructuringErrors) {
  var node = this.startNode();
  this.next();
  node.argument = this.parseMaybeAssign(false, refDestructuringErrors);
  return this.finishNode(node, "SpreadElement");
};
pp$7.parseRestBinding = function() {
  var node = this.startNode();
  this.next();
  if (this.options.ecmaVersion === 6 && this.type !== types$1.name) {
    this.unexpected();
  }
  node.argument = this.parseBindingAtom();
  return this.finishNode(node, "RestElement");
};
pp$7.parseBindingAtom = function() {
  if (this.options.ecmaVersion >= 6) {
    switch (this.type) {
      case types$1.bracketL:
        var node = this.startNode();
        this.next();
        node.elements = this.parseBindingList(types$1.bracketR, true, true);
        return this.finishNode(node, "ArrayPattern");
      case types$1.braceL:
        return this.parseObj(true);
    }
  }
  return this.parseIdent();
};
pp$7.parseBindingList = function(close, allowEmpty, allowTrailingComma, allowModifiers) {
  var elts = [], first = true;
  while (!this.eat(close)) {
    if (first) {
      first = false;
    } else {
      this.expect(types$1.comma);
    }
    if (allowEmpty && this.type === types$1.comma) {
      elts.push(null);
    } else if (allowTrailingComma && this.afterTrailingComma(close)) {
      break;
    } else if (this.type === types$1.ellipsis) {
      var rest = this.parseRestBinding();
      this.parseBindingListItem(rest);
      elts.push(rest);
      if (this.type === types$1.comma) {
        this.raiseRecoverable(this.start, "Comma is not permitted after the rest element");
      }
      this.expect(close);
      break;
    } else {
      elts.push(this.parseAssignableListItem(allowModifiers));
    }
  }
  return elts;
};
pp$7.parseAssignableListItem = function(allowModifiers) {
  var elem = this.parseMaybeDefault(this.start, this.startLoc);
  this.parseBindingListItem(elem);
  return elem;
};
pp$7.parseBindingListItem = function(param) {
  return param;
};
pp$7.parseMaybeDefault = function(startPos, startLoc, left) {
  left = left || this.parseBindingAtom();
  if (this.options.ecmaVersion < 6 || !this.eat(types$1.eq)) {
    return left;
  }
  var node = this.startNodeAt(startPos, startLoc);
  node.left = left;
  node.right = this.parseMaybeAssign();
  return this.finishNode(node, "AssignmentPattern");
};
pp$7.checkLValSimple = function(expr, bindingType, checkClashes) {
  if (bindingType === undefined)
    bindingType = BIND_NONE;
  var isBind = bindingType !== BIND_NONE;
  switch (expr.type) {
    case "Identifier":
      if (this.strict && this.reservedWordsStrictBind.test(expr.name)) {
        this.raiseRecoverable(expr.start, (isBind ? "Binding " : "Assigning to ") + expr.name + " in strict mode");
      }
      if (isBind) {
        if (bindingType === BIND_LEXICAL && expr.name === "let") {
          this.raiseRecoverable(expr.start, "let is disallowed as a lexically bound name");
        }
        if (checkClashes) {
          if (hasOwn(checkClashes, expr.name)) {
            this.raiseRecoverable(expr.start, "Argument name clash");
          }
          checkClashes[expr.name] = true;
        }
        if (bindingType !== BIND_OUTSIDE) {
          this.declareName(expr.name, bindingType, expr.start);
        }
      }
      break;
    case "ChainExpression":
      this.raiseRecoverable(expr.start, "Optional chaining cannot appear in left-hand side");
      break;
    case "MemberExpression":
      if (isBind) {
        this.raiseRecoverable(expr.start, "Binding member expression");
      }
      break;
    case "ParenthesizedExpression":
      if (isBind) {
        this.raiseRecoverable(expr.start, "Binding parenthesized expression");
      }
      return this.checkLValSimple(expr.expression, bindingType, checkClashes);
    default:
      this.raise(expr.start, (isBind ? "Binding" : "Assigning to") + " rvalue");
  }
};
pp$7.checkLValPattern = function(expr, bindingType, checkClashes) {
  if (bindingType === undefined)
    bindingType = BIND_NONE;
  switch (expr.type) {
    case "ObjectPattern":
      for (var i = 0, list = expr.properties;i < list.length; i += 1) {
        var prop = list[i];
        this.checkLValInnerPattern(prop, bindingType, checkClashes);
      }
      break;
    case "ArrayPattern":
      for (var i$1 = 0, list$1 = expr.elements;i$1 < list$1.length; i$1 += 1) {
        var elem = list$1[i$1];
        if (elem) {
          this.checkLValInnerPattern(elem, bindingType, checkClashes);
        }
      }
      break;
    default:
      this.checkLValSimple(expr, bindingType, checkClashes);
  }
};
pp$7.checkLValInnerPattern = function(expr, bindingType, checkClashes) {
  if (bindingType === undefined)
    bindingType = BIND_NONE;
  switch (expr.type) {
    case "Property":
      this.checkLValInnerPattern(expr.value, bindingType, checkClashes);
      break;
    case "AssignmentPattern":
      this.checkLValPattern(expr.left, bindingType, checkClashes);
      break;
    case "RestElement":
      this.checkLValPattern(expr.argument, bindingType, checkClashes);
      break;
    default:
      this.checkLValPattern(expr, bindingType, checkClashes);
  }
};
var TokContext = function TokContext(token, isExpr, preserveSpace, override, generator) {
  this.token = token;
  this.isExpr = !!isExpr;
  this.preserveSpace = !!preserveSpace;
  this.override = override;
  this.generator = !!generator;
};
var types = {
  b_stat: new TokContext("{", false),
  b_expr: new TokContext("{", true),
  b_tmpl: new TokContext("${", false),
  p_stat: new TokContext("(", false),
  p_expr: new TokContext("(", true),
  q_tmpl: new TokContext("`", true, true, function(p) {
    return p.tryReadTemplateToken();
  }),
  f_stat: new TokContext("function", false),
  f_expr: new TokContext("function", true),
  f_expr_gen: new TokContext("function", true, false, null, true),
  f_gen: new TokContext("function", false, false, null, true)
};
var pp$6 = Parser.prototype;
pp$6.initialContext = function() {
  return [types.b_stat];
};
pp$6.curContext = function() {
  return this.context[this.context.length - 1];
};
pp$6.braceIsBlock = function(prevType) {
  var parent = this.curContext();
  if (parent === types.f_expr || parent === types.f_stat) {
    return true;
  }
  if (prevType === types$1.colon && (parent === types.b_stat || parent === types.b_expr)) {
    return !parent.isExpr;
  }
  if (prevType === types$1._return || prevType === types$1.name && this.exprAllowed) {
    return lineBreak.test(this.input.slice(this.lastTokEnd, this.start));
  }
  if (prevType === types$1._else || prevType === types$1.semi || prevType === types$1.eof || prevType === types$1.parenR || prevType === types$1.arrow) {
    return true;
  }
  if (prevType === types$1.braceL) {
    return parent === types.b_stat;
  }
  if (prevType === types$1._var || prevType === types$1._const || prevType === types$1.name) {
    return false;
  }
  return !this.exprAllowed;
};
pp$6.inGeneratorContext = function() {
  for (var i = this.context.length - 1;i >= 1; i--) {
    var context = this.context[i];
    if (context.token === "function") {
      return context.generator;
    }
  }
  return false;
};
pp$6.updateContext = function(prevType) {
  var update, type = this.type;
  if (type.keyword && prevType === types$1.dot) {
    this.exprAllowed = false;
  } else if (update = type.updateContext) {
    update.call(this, prevType);
  } else {
    this.exprAllowed = type.beforeExpr;
  }
};
pp$6.overrideContext = function(tokenCtx) {
  if (this.curContext() !== tokenCtx) {
    this.context[this.context.length - 1] = tokenCtx;
  }
};
types$1.parenR.updateContext = types$1.braceR.updateContext = function() {
  if (this.context.length === 1) {
    this.exprAllowed = true;
    return;
  }
  var out = this.context.pop();
  if (out === types.b_stat && this.curContext().token === "function") {
    out = this.context.pop();
  }
  this.exprAllowed = !out.isExpr;
};
types$1.braceL.updateContext = function(prevType) {
  this.context.push(this.braceIsBlock(prevType) ? types.b_stat : types.b_expr);
  this.exprAllowed = true;
};
types$1.dollarBraceL.updateContext = function() {
  this.context.push(types.b_tmpl);
  this.exprAllowed = true;
};
types$1.parenL.updateContext = function(prevType) {
  var statementParens = prevType === types$1._if || prevType === types$1._for || prevType === types$1._with || prevType === types$1._while;
  this.context.push(statementParens ? types.p_stat : types.p_expr);
  this.exprAllowed = true;
};
types$1.incDec.updateContext = function() {};
types$1._function.updateContext = types$1._class.updateContext = function(prevType) {
  if (prevType.beforeExpr && prevType !== types$1._else && !(prevType === types$1.semi && this.curContext() !== types.p_stat) && !(prevType === types$1._return && lineBreak.test(this.input.slice(this.lastTokEnd, this.start))) && !((prevType === types$1.colon || prevType === types$1.braceL) && this.curContext() === types.b_stat)) {
    this.context.push(types.f_expr);
  } else {
    this.context.push(types.f_stat);
  }
  this.exprAllowed = false;
};
types$1.colon.updateContext = function() {
  if (this.curContext().token === "function") {
    this.context.pop();
  }
  this.exprAllowed = true;
};
types$1.backQuote.updateContext = function() {
  if (this.curContext() === types.q_tmpl) {
    this.context.pop();
  } else {
    this.context.push(types.q_tmpl);
  }
  this.exprAllowed = false;
};
types$1.star.updateContext = function(prevType) {
  if (prevType === types$1._function) {
    var index = this.context.length - 1;
    if (this.context[index] === types.f_expr) {
      this.context[index] = types.f_expr_gen;
    } else {
      this.context[index] = types.f_gen;
    }
  }
  this.exprAllowed = true;
};
types$1.name.updateContext = function(prevType) {
  var allowed = false;
  if (this.options.ecmaVersion >= 6 && prevType !== types$1.dot) {
    if (this.value === "of" && !this.exprAllowed || this.value === "yield" && this.inGeneratorContext()) {
      allowed = true;
    }
  }
  this.exprAllowed = allowed;
};
var pp$5 = Parser.prototype;
pp$5.checkPropClash = function(prop, propHash, refDestructuringErrors) {
  if (this.options.ecmaVersion >= 9 && prop.type === "SpreadElement") {
    return;
  }
  if (this.options.ecmaVersion >= 6 && (prop.computed || prop.method || prop.shorthand)) {
    return;
  }
  var key = prop.key;
  var name;
  switch (key.type) {
    case "Identifier":
      name = key.name;
      break;
    case "Literal":
      name = String(key.value);
      break;
    default:
      return;
  }
  var kind = prop.kind;
  if (this.options.ecmaVersion >= 6) {
    if (name === "__proto__" && kind === "init") {
      if (propHash.proto) {
        if (refDestructuringErrors) {
          if (refDestructuringErrors.doubleProto < 0) {
            refDestructuringErrors.doubleProto = key.start;
          }
        } else {
          this.raiseRecoverable(key.start, "Redefinition of __proto__ property");
        }
      }
      propHash.proto = true;
    }
    return;
  }
  name = "$" + name;
  var other = propHash[name];
  if (other) {
    var redefinition;
    if (kind === "init") {
      redefinition = this.strict && other.init || other.get || other.set;
    } else {
      redefinition = other.init || other[kind];
    }
    if (redefinition) {
      this.raiseRecoverable(key.start, "Redefinition of property");
    }
  } else {
    other = propHash[name] = {
      init: false,
      get: false,
      set: false
    };
  }
  other[kind] = true;
};
pp$5.parseExpression = function(forInit, refDestructuringErrors) {
  var startPos = this.start, startLoc = this.startLoc;
  var expr = this.parseMaybeAssign(forInit, refDestructuringErrors);
  if (this.type === types$1.comma) {
    var node = this.startNodeAt(startPos, startLoc);
    node.expressions = [expr];
    while (this.eat(types$1.comma)) {
      node.expressions.push(this.parseMaybeAssign(forInit, refDestructuringErrors));
    }
    return this.finishNode(node, "SequenceExpression");
  }
  return expr;
};
pp$5.parseMaybeAssign = function(forInit, refDestructuringErrors, afterLeftParse) {
  if (this.isContextual("yield")) {
    if (this.inGenerator) {
      return this.parseYield(forInit);
    } else {
      this.exprAllowed = false;
    }
  }
  var ownDestructuringErrors = false, oldParenAssign = -1, oldTrailingComma = -1, oldDoubleProto = -1;
  if (refDestructuringErrors) {
    oldParenAssign = refDestructuringErrors.parenthesizedAssign;
    oldTrailingComma = refDestructuringErrors.trailingComma;
    oldDoubleProto = refDestructuringErrors.doubleProto;
    refDestructuringErrors.parenthesizedAssign = refDestructuringErrors.trailingComma = -1;
  } else {
    refDestructuringErrors = new DestructuringErrors;
    ownDestructuringErrors = true;
  }
  var startPos = this.start, startLoc = this.startLoc;
  if (this.type === types$1.parenL || this.type === types$1.name) {
    this.potentialArrowAt = this.start;
    this.potentialArrowInForAwait = forInit === "await";
  }
  var left = this.parseMaybeConditional(forInit, refDestructuringErrors);
  if (afterLeftParse) {
    left = afterLeftParse.call(this, left, startPos, startLoc);
  }
  if (this.type.isAssign) {
    var node = this.startNodeAt(startPos, startLoc);
    node.operator = this.value;
    if (this.type === types$1.eq) {
      left = this.toAssignable(left, false, refDestructuringErrors);
    }
    if (!ownDestructuringErrors) {
      refDestructuringErrors.parenthesizedAssign = refDestructuringErrors.trailingComma = refDestructuringErrors.doubleProto = -1;
    }
    if (refDestructuringErrors.shorthandAssign >= left.start) {
      refDestructuringErrors.shorthandAssign = -1;
    }
    if (this.type === types$1.eq) {
      this.checkLValPattern(left);
    } else {
      this.checkLValSimple(left);
    }
    node.left = left;
    this.next();
    node.right = this.parseMaybeAssign(forInit);
    if (oldDoubleProto > -1) {
      refDestructuringErrors.doubleProto = oldDoubleProto;
    }
    return this.finishNode(node, "AssignmentExpression");
  } else {
    if (ownDestructuringErrors) {
      this.checkExpressionErrors(refDestructuringErrors, true);
    }
  }
  if (oldParenAssign > -1) {
    refDestructuringErrors.parenthesizedAssign = oldParenAssign;
  }
  if (oldTrailingComma > -1) {
    refDestructuringErrors.trailingComma = oldTrailingComma;
  }
  return left;
};
pp$5.parseMaybeConditional = function(forInit, refDestructuringErrors) {
  var startPos = this.start, startLoc = this.startLoc;
  var expr = this.parseExprOps(forInit, refDestructuringErrors);
  if (this.checkExpressionErrors(refDestructuringErrors)) {
    return expr;
  }
  if (this.eat(types$1.question)) {
    var node = this.startNodeAt(startPos, startLoc);
    node.test = expr;
    node.consequent = this.parseMaybeAssign();
    this.expect(types$1.colon);
    node.alternate = this.parseMaybeAssign(forInit);
    return this.finishNode(node, "ConditionalExpression");
  }
  return expr;
};
pp$5.parseExprOps = function(forInit, refDestructuringErrors) {
  var startPos = this.start, startLoc = this.startLoc;
  var expr = this.parseMaybeUnary(refDestructuringErrors, false, false, forInit);
  if (this.checkExpressionErrors(refDestructuringErrors)) {
    return expr;
  }
  return expr.start === startPos && expr.type === "ArrowFunctionExpression" ? expr : this.parseExprOp(expr, startPos, startLoc, -1, forInit);
};
pp$5.parseExprOp = function(left, leftStartPos, leftStartLoc, minPrec, forInit) {
  var prec = this.type.binop;
  if (prec != null && (!forInit || this.type !== types$1._in)) {
    if (prec > minPrec) {
      var logical = this.type === types$1.logicalOR || this.type === types$1.logicalAND;
      var coalesce = this.type === types$1.coalesce;
      if (coalesce) {
        prec = types$1.logicalAND.binop;
      }
      var op = this.value;
      this.next();
      var startPos = this.start, startLoc = this.startLoc;
      var right = this.parseExprOp(this.parseMaybeUnary(null, false, false, forInit), startPos, startLoc, prec, forInit);
      var node = this.buildBinary(leftStartPos, leftStartLoc, left, right, op, logical || coalesce);
      if (logical && this.type === types$1.coalesce || coalesce && (this.type === types$1.logicalOR || this.type === types$1.logicalAND)) {
        this.raiseRecoverable(this.start, "Logical expressions and coalesce expressions cannot be mixed. Wrap either by parentheses");
      }
      return this.parseExprOp(node, leftStartPos, leftStartLoc, minPrec, forInit);
    }
  }
  return left;
};
pp$5.buildBinary = function(startPos, startLoc, left, right, op, logical) {
  if (right.type === "PrivateIdentifier") {
    this.raise(right.start, "Private identifier can only be left side of binary expression");
  }
  var node = this.startNodeAt(startPos, startLoc);
  node.left = left;
  node.operator = op;
  node.right = right;
  return this.finishNode(node, logical ? "LogicalExpression" : "BinaryExpression");
};
pp$5.parseMaybeUnary = function(refDestructuringErrors, sawUnary, incDec, forInit) {
  var startPos = this.start, startLoc = this.startLoc, expr;
  if (this.isContextual("await") && this.canAwait) {
    expr = this.parseAwait(forInit);
    sawUnary = true;
  } else if (this.type.prefix) {
    var node = this.startNode(), update = this.type === types$1.incDec;
    node.operator = this.value;
    node.prefix = true;
    this.next();
    node.argument = this.parseMaybeUnary(null, true, update, forInit);
    this.checkExpressionErrors(refDestructuringErrors, true);
    if (update) {
      this.checkLValSimple(node.argument);
    } else if (this.strict && node.operator === "delete" && isLocalVariableAccess(node.argument)) {
      this.raiseRecoverable(node.start, "Deleting local variable in strict mode");
    } else if (node.operator === "delete" && isPrivateFieldAccess(node.argument)) {
      this.raiseRecoverable(node.start, "Private fields can not be deleted");
    } else {
      sawUnary = true;
    }
    expr = this.finishNode(node, update ? "UpdateExpression" : "UnaryExpression");
  } else if (!sawUnary && this.type === types$1.privateId) {
    if ((forInit || this.privateNameStack.length === 0) && this.options.checkPrivateFields) {
      this.unexpected();
    }
    expr = this.parsePrivateIdent();
    if (this.type !== types$1._in) {
      this.unexpected();
    }
  } else {
    expr = this.parseExprSubscripts(refDestructuringErrors, forInit);
    if (this.checkExpressionErrors(refDestructuringErrors)) {
      return expr;
    }
    while (this.type.postfix && !this.canInsertSemicolon()) {
      var node$1 = this.startNodeAt(startPos, startLoc);
      node$1.operator = this.value;
      node$1.prefix = false;
      node$1.argument = expr;
      this.checkLValSimple(expr);
      this.next();
      expr = this.finishNode(node$1, "UpdateExpression");
    }
  }
  if (!incDec && this.eat(types$1.starstar)) {
    if (sawUnary) {
      this.unexpected(this.lastTokStart);
    } else {
      return this.buildBinary(startPos, startLoc, expr, this.parseMaybeUnary(null, false, false, forInit), "**", false);
    }
  } else {
    return expr;
  }
};
function isLocalVariableAccess(node) {
  return node.type === "Identifier" || node.type === "ParenthesizedExpression" && isLocalVariableAccess(node.expression);
}
function isPrivateFieldAccess(node) {
  return node.type === "MemberExpression" && node.property.type === "PrivateIdentifier" || node.type === "ChainExpression" && isPrivateFieldAccess(node.expression) || node.type === "ParenthesizedExpression" && isPrivateFieldAccess(node.expression);
}
pp$5.parseExprSubscripts = function(refDestructuringErrors, forInit) {
  var startPos = this.start, startLoc = this.startLoc;
  var expr = this.parseExprAtom(refDestructuringErrors, forInit);
  if (expr.type === "ArrowFunctionExpression" && this.input.slice(this.lastTokStart, this.lastTokEnd) !== ")") {
    return expr;
  }
  var result = this.parseSubscripts(expr, startPos, startLoc, false, forInit);
  if (refDestructuringErrors && result.type === "MemberExpression") {
    if (refDestructuringErrors.parenthesizedAssign >= result.start) {
      refDestructuringErrors.parenthesizedAssign = -1;
    }
    if (refDestructuringErrors.parenthesizedBind >= result.start) {
      refDestructuringErrors.parenthesizedBind = -1;
    }
    if (refDestructuringErrors.trailingComma >= result.start) {
      refDestructuringErrors.trailingComma = -1;
    }
  }
  return result;
};
pp$5.parseSubscripts = function(base, startPos, startLoc, noCalls, forInit) {
  var maybeAsyncArrow = this.options.ecmaVersion >= 8 && base.type === "Identifier" && base.name === "async" && this.lastTokEnd === base.end && !this.canInsertSemicolon() && base.end - base.start === 5 && this.potentialArrowAt === base.start;
  var optionalChained = false;
  while (true) {
    var element = this.parseSubscript(base, startPos, startLoc, noCalls, maybeAsyncArrow, optionalChained, forInit);
    if (element.optional) {
      optionalChained = true;
    }
    if (element === base || element.type === "ArrowFunctionExpression") {
      if (optionalChained) {
        var chainNode = this.startNodeAt(startPos, startLoc);
        chainNode.expression = element;
        element = this.finishNode(chainNode, "ChainExpression");
      }
      return element;
    }
    base = element;
  }
};
pp$5.shouldParseAsyncArrow = function() {
  return !this.canInsertSemicolon() && this.eat(types$1.arrow);
};
pp$5.parseSubscriptAsyncArrow = function(startPos, startLoc, exprList, forInit) {
  return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), exprList, true, forInit);
};
pp$5.parseSubscript = function(base, startPos, startLoc, noCalls, maybeAsyncArrow, optionalChained, forInit) {
  var optionalSupported = this.options.ecmaVersion >= 11;
  var optional = optionalSupported && this.eat(types$1.questionDot);
  if (noCalls && optional) {
    this.raise(this.lastTokStart, "Optional chaining cannot appear in the callee of new expressions");
  }
  var computed = this.eat(types$1.bracketL);
  if (computed || optional && this.type !== types$1.parenL && this.type !== types$1.backQuote || this.eat(types$1.dot)) {
    var node = this.startNodeAt(startPos, startLoc);
    node.object = base;
    if (computed) {
      node.property = this.parseExpression();
      this.expect(types$1.bracketR);
    } else if (this.type === types$1.privateId && base.type !== "Super") {
      node.property = this.parsePrivateIdent();
    } else {
      node.property = this.parseIdent(this.options.allowReserved !== "never");
    }
    node.computed = !!computed;
    if (optionalSupported) {
      node.optional = optional;
    }
    base = this.finishNode(node, "MemberExpression");
  } else if (!noCalls && this.eat(types$1.parenL)) {
    var refDestructuringErrors = new DestructuringErrors, oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
    this.yieldPos = 0;
    this.awaitPos = 0;
    this.awaitIdentPos = 0;
    var exprList = this.parseExprList(types$1.parenR, this.options.ecmaVersion >= 8, false, refDestructuringErrors);
    if (maybeAsyncArrow && !optional && this.shouldParseAsyncArrow()) {
      this.checkPatternErrors(refDestructuringErrors, false);
      this.checkYieldAwaitInDefaultParams();
      if (this.awaitIdentPos > 0) {
        this.raise(this.awaitIdentPos, "Cannot use 'await' as identifier inside an async function");
      }
      this.yieldPos = oldYieldPos;
      this.awaitPos = oldAwaitPos;
      this.awaitIdentPos = oldAwaitIdentPos;
      return this.parseSubscriptAsyncArrow(startPos, startLoc, exprList, forInit);
    }
    this.checkExpressionErrors(refDestructuringErrors, true);
    this.yieldPos = oldYieldPos || this.yieldPos;
    this.awaitPos = oldAwaitPos || this.awaitPos;
    this.awaitIdentPos = oldAwaitIdentPos || this.awaitIdentPos;
    var node$1 = this.startNodeAt(startPos, startLoc);
    node$1.callee = base;
    node$1.arguments = exprList;
    if (optionalSupported) {
      node$1.optional = optional;
    }
    base = this.finishNode(node$1, "CallExpression");
  } else if (this.type === types$1.backQuote) {
    if (optional || optionalChained) {
      this.raise(this.start, "Optional chaining cannot appear in the tag of tagged template expressions");
    }
    var node$2 = this.startNodeAt(startPos, startLoc);
    node$2.tag = base;
    node$2.quasi = this.parseTemplate({ isTagged: true });
    base = this.finishNode(node$2, "TaggedTemplateExpression");
  }
  return base;
};
pp$5.parseExprAtom = function(refDestructuringErrors, forInit, forNew) {
  if (this.type === types$1.slash) {
    this.readRegexp();
  }
  var node, canBeArrow = this.potentialArrowAt === this.start;
  switch (this.type) {
    case types$1._super:
      if (!this.allowSuper) {
        this.raise(this.start, "'super' keyword outside a method");
      }
      node = this.startNode();
      this.next();
      if (this.type === types$1.parenL && !this.allowDirectSuper) {
        this.raise(node.start, "super() call outside constructor of a subclass");
      }
      if (this.type !== types$1.dot && this.type !== types$1.bracketL && this.type !== types$1.parenL) {
        this.unexpected();
      }
      return this.finishNode(node, "Super");
    case types$1._this:
      node = this.startNode();
      this.next();
      return this.finishNode(node, "ThisExpression");
    case types$1.name:
      var startPos = this.start, startLoc = this.startLoc, containsEsc = this.containsEsc;
      var id = this.parseIdent(false);
      if (this.options.ecmaVersion >= 8 && !containsEsc && id.name === "async" && !this.canInsertSemicolon() && this.eat(types$1._function)) {
        this.overrideContext(types.f_expr);
        return this.parseFunction(this.startNodeAt(startPos, startLoc), 0, false, true, forInit);
      }
      if (canBeArrow && !this.canInsertSemicolon()) {
        if (this.eat(types$1.arrow)) {
          return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), [id], false, forInit);
        }
        if (this.options.ecmaVersion >= 8 && id.name === "async" && this.type === types$1.name && !containsEsc && (!this.potentialArrowInForAwait || this.value !== "of" || this.containsEsc)) {
          id = this.parseIdent(false);
          if (this.canInsertSemicolon() || !this.eat(types$1.arrow)) {
            this.unexpected();
          }
          return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), [id], true, forInit);
        }
      }
      return id;
    case types$1.regexp:
      var value = this.value;
      node = this.parseLiteral(value.value);
      node.regex = { pattern: value.pattern, flags: value.flags };
      return node;
    case types$1.num:
    case types$1.string:
      return this.parseLiteral(this.value);
    case types$1._null:
    case types$1._true:
    case types$1._false:
      node = this.startNode();
      node.value = this.type === types$1._null ? null : this.type === types$1._true;
      node.raw = this.type.keyword;
      this.next();
      return this.finishNode(node, "Literal");
    case types$1.parenL:
      var start = this.start, expr = this.parseParenAndDistinguishExpression(canBeArrow, forInit);
      if (refDestructuringErrors) {
        if (refDestructuringErrors.parenthesizedAssign < 0 && !this.isSimpleAssignTarget(expr)) {
          refDestructuringErrors.parenthesizedAssign = start;
        }
        if (refDestructuringErrors.parenthesizedBind < 0) {
          refDestructuringErrors.parenthesizedBind = start;
        }
      }
      return expr;
    case types$1.bracketL:
      node = this.startNode();
      this.next();
      node.elements = this.parseExprList(types$1.bracketR, true, true, refDestructuringErrors);
      return this.finishNode(node, "ArrayExpression");
    case types$1.braceL:
      this.overrideContext(types.b_expr);
      return this.parseObj(false, refDestructuringErrors);
    case types$1._function:
      node = this.startNode();
      this.next();
      return this.parseFunction(node, 0);
    case types$1._class:
      return this.parseClass(this.startNode(), false);
    case types$1._new:
      return this.parseNew();
    case types$1.backQuote:
      return this.parseTemplate();
    case types$1._import:
      if (this.options.ecmaVersion >= 11) {
        return this.parseExprImport(forNew);
      } else {
        return this.unexpected();
      }
    default:
      return this.parseExprAtomDefault();
  }
};
pp$5.parseExprAtomDefault = function() {
  this.unexpected();
};
pp$5.parseExprImport = function(forNew) {
  var node = this.startNode();
  if (this.containsEsc) {
    this.raiseRecoverable(this.start, "Escape sequence in keyword import");
  }
  this.next();
  if (this.type === types$1.parenL && !forNew) {
    return this.parseDynamicImport(node);
  } else if (this.type === types$1.dot) {
    var meta = this.startNodeAt(node.start, node.loc && node.loc.start);
    meta.name = "import";
    node.meta = this.finishNode(meta, "Identifier");
    return this.parseImportMeta(node);
  } else {
    this.unexpected();
  }
};
pp$5.parseDynamicImport = function(node) {
  this.next();
  node.source = this.parseMaybeAssign();
  if (this.options.ecmaVersion >= 16) {
    if (!this.eat(types$1.parenR)) {
      this.expect(types$1.comma);
      if (!this.afterTrailingComma(types$1.parenR)) {
        node.options = this.parseMaybeAssign();
        if (!this.eat(types$1.parenR)) {
          this.expect(types$1.comma);
          if (!this.afterTrailingComma(types$1.parenR)) {
            this.unexpected();
          }
        }
      } else {
        node.options = null;
      }
    } else {
      node.options = null;
    }
  } else {
    if (!this.eat(types$1.parenR)) {
      var errorPos = this.start;
      if (this.eat(types$1.comma) && this.eat(types$1.parenR)) {
        this.raiseRecoverable(errorPos, "Trailing comma is not allowed in import()");
      } else {
        this.unexpected(errorPos);
      }
    }
  }
  return this.finishNode(node, "ImportExpression");
};
pp$5.parseImportMeta = function(node) {
  this.next();
  var containsEsc = this.containsEsc;
  node.property = this.parseIdent(true);
  if (node.property.name !== "meta") {
    this.raiseRecoverable(node.property.start, "The only valid meta property for import is 'import.meta'");
  }
  if (containsEsc) {
    this.raiseRecoverable(node.start, "'import.meta' must not contain escaped characters");
  }
  if (this.options.sourceType !== "module" && !this.options.allowImportExportEverywhere) {
    this.raiseRecoverable(node.start, "Cannot use 'import.meta' outside a module");
  }
  return this.finishNode(node, "MetaProperty");
};
pp$5.parseLiteral = function(value) {
  var node = this.startNode();
  node.value = value;
  node.raw = this.input.slice(this.start, this.end);
  if (node.raw.charCodeAt(node.raw.length - 1) === 110) {
    node.bigint = node.value != null ? node.value.toString() : node.raw.slice(0, -1).replace(/_/g, "");
  }
  this.next();
  return this.finishNode(node, "Literal");
};
pp$5.parseParenExpression = function() {
  this.expect(types$1.parenL);
  var val = this.parseExpression();
  this.expect(types$1.parenR);
  return val;
};
pp$5.shouldParseArrow = function(exprList) {
  return !this.canInsertSemicolon();
};
pp$5.parseParenAndDistinguishExpression = function(canBeArrow, forInit) {
  var startPos = this.start, startLoc = this.startLoc, val, allowTrailingComma = this.options.ecmaVersion >= 8;
  if (this.options.ecmaVersion >= 6) {
    this.next();
    var innerStartPos = this.start, innerStartLoc = this.startLoc;
    var exprList = [], first = true, lastIsComma = false;
    var refDestructuringErrors = new DestructuringErrors, oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, spreadStart;
    this.yieldPos = 0;
    this.awaitPos = 0;
    while (this.type !== types$1.parenR) {
      first ? first = false : this.expect(types$1.comma);
      if (allowTrailingComma && this.afterTrailingComma(types$1.parenR, true)) {
        lastIsComma = true;
        break;
      } else if (this.type === types$1.ellipsis) {
        spreadStart = this.start;
        exprList.push(this.parseParenItem(this.parseRestBinding()));
        if (this.type === types$1.comma) {
          this.raiseRecoverable(this.start, "Comma is not permitted after the rest element");
        }
        break;
      } else {
        exprList.push(this.parseMaybeAssign(false, refDestructuringErrors, this.parseParenItem));
      }
    }
    var innerEndPos = this.lastTokEnd, innerEndLoc = this.lastTokEndLoc;
    this.expect(types$1.parenR);
    if (canBeArrow && this.shouldParseArrow(exprList) && this.eat(types$1.arrow)) {
      this.checkPatternErrors(refDestructuringErrors, false);
      this.checkYieldAwaitInDefaultParams();
      this.yieldPos = oldYieldPos;
      this.awaitPos = oldAwaitPos;
      return this.parseParenArrowList(startPos, startLoc, exprList, forInit);
    }
    if (!exprList.length || lastIsComma) {
      this.unexpected(this.lastTokStart);
    }
    if (spreadStart) {
      this.unexpected(spreadStart);
    }
    this.checkExpressionErrors(refDestructuringErrors, true);
    this.yieldPos = oldYieldPos || this.yieldPos;
    this.awaitPos = oldAwaitPos || this.awaitPos;
    if (exprList.length > 1) {
      val = this.startNodeAt(innerStartPos, innerStartLoc);
      val.expressions = exprList;
      this.finishNodeAt(val, "SequenceExpression", innerEndPos, innerEndLoc);
    } else {
      val = exprList[0];
    }
  } else {
    val = this.parseParenExpression();
  }
  if (this.options.preserveParens) {
    var par = this.startNodeAt(startPos, startLoc);
    par.expression = val;
    return this.finishNode(par, "ParenthesizedExpression");
  } else {
    return val;
  }
};
pp$5.parseParenItem = function(item) {
  return item;
};
pp$5.parseParenArrowList = function(startPos, startLoc, exprList, forInit) {
  return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), exprList, false, forInit);
};
var empty = [];
pp$5.parseNew = function() {
  if (this.containsEsc) {
    this.raiseRecoverable(this.start, "Escape sequence in keyword new");
  }
  var node = this.startNode();
  this.next();
  if (this.options.ecmaVersion >= 6 && this.type === types$1.dot) {
    var meta = this.startNodeAt(node.start, node.loc && node.loc.start);
    meta.name = "new";
    node.meta = this.finishNode(meta, "Identifier");
    this.next();
    var containsEsc = this.containsEsc;
    node.property = this.parseIdent(true);
    if (node.property.name !== "target") {
      this.raiseRecoverable(node.property.start, "The only valid meta property for new is 'new.target'");
    }
    if (containsEsc) {
      this.raiseRecoverable(node.start, "'new.target' must not contain escaped characters");
    }
    if (!this.allowNewDotTarget) {
      this.raiseRecoverable(node.start, "'new.target' can only be used in functions and class static block");
    }
    return this.finishNode(node, "MetaProperty");
  }
  var startPos = this.start, startLoc = this.startLoc;
  node.callee = this.parseSubscripts(this.parseExprAtom(null, false, true), startPos, startLoc, true, false);
  if (this.eat(types$1.parenL)) {
    node.arguments = this.parseExprList(types$1.parenR, this.options.ecmaVersion >= 8, false);
  } else {
    node.arguments = empty;
  }
  return this.finishNode(node, "NewExpression");
};
pp$5.parseTemplateElement = function(ref) {
  var isTagged = ref.isTagged;
  var elem = this.startNode();
  if (this.type === types$1.invalidTemplate) {
    if (!isTagged) {
      this.raiseRecoverable(this.start, "Bad escape sequence in untagged template literal");
    }
    elem.value = {
      raw: this.value.replace(/\r\n?/g, `
`),
      cooked: null
    };
  } else {
    elem.value = {
      raw: this.input.slice(this.start, this.end).replace(/\r\n?/g, `
`),
      cooked: this.value
    };
  }
  this.next();
  elem.tail = this.type === types$1.backQuote;
  return this.finishNode(elem, "TemplateElement");
};
pp$5.parseTemplate = function(ref) {
  if (ref === undefined)
    ref = {};
  var isTagged = ref.isTagged;
  if (isTagged === undefined)
    isTagged = false;
  var node = this.startNode();
  this.next();
  node.expressions = [];
  var curElt = this.parseTemplateElement({ isTagged });
  node.quasis = [curElt];
  while (!curElt.tail) {
    if (this.type === types$1.eof) {
      this.raise(this.pos, "Unterminated template literal");
    }
    this.expect(types$1.dollarBraceL);
    node.expressions.push(this.parseExpression());
    this.expect(types$1.braceR);
    node.quasis.push(curElt = this.parseTemplateElement({ isTagged }));
  }
  this.next();
  return this.finishNode(node, "TemplateLiteral");
};
pp$5.isAsyncProp = function(prop) {
  return !prop.computed && prop.key.type === "Identifier" && prop.key.name === "async" && (this.type === types$1.name || this.type === types$1.num || this.type === types$1.string || this.type === types$1.bracketL || this.type.keyword || this.options.ecmaVersion >= 9 && this.type === types$1.star) && !lineBreak.test(this.input.slice(this.lastTokEnd, this.start));
};
pp$5.parseObj = function(isPattern, refDestructuringErrors) {
  var node = this.startNode(), first = true, propHash = {};
  node.properties = [];
  this.next();
  while (!this.eat(types$1.braceR)) {
    if (!first) {
      this.expect(types$1.comma);
      if (this.options.ecmaVersion >= 5 && this.afterTrailingComma(types$1.braceR)) {
        break;
      }
    } else {
      first = false;
    }
    var prop = this.parseProperty(isPattern, refDestructuringErrors);
    if (!isPattern) {
      this.checkPropClash(prop, propHash, refDestructuringErrors);
    }
    node.properties.push(prop);
  }
  return this.finishNode(node, isPattern ? "ObjectPattern" : "ObjectExpression");
};
pp$5.parseProperty = function(isPattern, refDestructuringErrors) {
  var prop = this.startNode(), isGenerator, isAsync, startPos, startLoc;
  if (this.options.ecmaVersion >= 9 && this.eat(types$1.ellipsis)) {
    if (isPattern) {
      prop.argument = this.parseIdent(false);
      if (this.type === types$1.comma) {
        this.raiseRecoverable(this.start, "Comma is not permitted after the rest element");
      }
      return this.finishNode(prop, "RestElement");
    }
    prop.argument = this.parseMaybeAssign(false, refDestructuringErrors);
    if (this.type === types$1.comma && refDestructuringErrors && refDestructuringErrors.trailingComma < 0) {
      refDestructuringErrors.trailingComma = this.start;
    }
    return this.finishNode(prop, "SpreadElement");
  }
  if (this.options.ecmaVersion >= 6) {
    prop.method = false;
    prop.shorthand = false;
    if (isPattern || refDestructuringErrors) {
      startPos = this.start;
      startLoc = this.startLoc;
    }
    if (!isPattern) {
      isGenerator = this.eat(types$1.star);
    }
  }
  var containsEsc = this.containsEsc;
  this.parsePropertyName(prop);
  if (!isPattern && !containsEsc && this.options.ecmaVersion >= 8 && !isGenerator && this.isAsyncProp(prop)) {
    isAsync = true;
    isGenerator = this.options.ecmaVersion >= 9 && this.eat(types$1.star);
    this.parsePropertyName(prop);
  } else {
    isAsync = false;
  }
  this.parsePropertyValue(prop, isPattern, isGenerator, isAsync, startPos, startLoc, refDestructuringErrors, containsEsc);
  return this.finishNode(prop, "Property");
};
pp$5.parseGetterSetter = function(prop) {
  var kind = prop.key.name;
  this.parsePropertyName(prop);
  prop.value = this.parseMethod(false);
  prop.kind = kind;
  var paramCount = prop.kind === "get" ? 0 : 1;
  if (prop.value.params.length !== paramCount) {
    var start = prop.value.start;
    if (prop.kind === "get") {
      this.raiseRecoverable(start, "getter should have no params");
    } else {
      this.raiseRecoverable(start, "setter should have exactly one param");
    }
  } else {
    if (prop.kind === "set" && prop.value.params[0].type === "RestElement") {
      this.raiseRecoverable(prop.value.params[0].start, "Setter cannot use rest params");
    }
  }
};
pp$5.parsePropertyValue = function(prop, isPattern, isGenerator, isAsync, startPos, startLoc, refDestructuringErrors, containsEsc) {
  if ((isGenerator || isAsync) && this.type === types$1.colon) {
    this.unexpected();
  }
  if (this.eat(types$1.colon)) {
    prop.value = isPattern ? this.parseMaybeDefault(this.start, this.startLoc) : this.parseMaybeAssign(false, refDestructuringErrors);
    prop.kind = "init";
  } else if (this.options.ecmaVersion >= 6 && this.type === types$1.parenL) {
    if (isPattern) {
      this.unexpected();
    }
    prop.method = true;
    prop.value = this.parseMethod(isGenerator, isAsync);
    prop.kind = "init";
  } else if (!isPattern && !containsEsc && this.options.ecmaVersion >= 5 && !prop.computed && prop.key.type === "Identifier" && (prop.key.name === "get" || prop.key.name === "set") && (this.type !== types$1.comma && this.type !== types$1.braceR && this.type !== types$1.eq)) {
    if (isGenerator || isAsync) {
      this.unexpected();
    }
    this.parseGetterSetter(prop);
  } else if (this.options.ecmaVersion >= 6 && !prop.computed && prop.key.type === "Identifier") {
    if (isGenerator || isAsync) {
      this.unexpected();
    }
    this.checkUnreserved(prop.key);
    if (prop.key.name === "await" && !this.awaitIdentPos) {
      this.awaitIdentPos = startPos;
    }
    if (isPattern) {
      prop.value = this.parseMaybeDefault(startPos, startLoc, this.copyNode(prop.key));
    } else if (this.type === types$1.eq && refDestructuringErrors) {
      if (refDestructuringErrors.shorthandAssign < 0) {
        refDestructuringErrors.shorthandAssign = this.start;
      }
      prop.value = this.parseMaybeDefault(startPos, startLoc, this.copyNode(prop.key));
    } else {
      prop.value = this.copyNode(prop.key);
    }
    prop.kind = "init";
    prop.shorthand = true;
  } else {
    this.unexpected();
  }
};
pp$5.parsePropertyName = function(prop) {
  if (this.options.ecmaVersion >= 6) {
    if (this.eat(types$1.bracketL)) {
      prop.computed = true;
      prop.key = this.parseMaybeAssign();
      this.expect(types$1.bracketR);
      return prop.key;
    } else {
      prop.computed = false;
    }
  }
  return prop.key = this.type === types$1.num || this.type === types$1.string ? this.parseExprAtom() : this.parseIdent(this.options.allowReserved !== "never");
};
pp$5.initFunction = function(node) {
  node.id = null;
  if (this.options.ecmaVersion >= 6) {
    node.generator = node.expression = false;
  }
  if (this.options.ecmaVersion >= 8) {
    node.async = false;
  }
};
pp$5.parseMethod = function(isGenerator, isAsync, allowDirectSuper) {
  var node = this.startNode(), oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
  this.initFunction(node);
  if (this.options.ecmaVersion >= 6) {
    node.generator = isGenerator;
  }
  if (this.options.ecmaVersion >= 8) {
    node.async = !!isAsync;
  }
  this.yieldPos = 0;
  this.awaitPos = 0;
  this.awaitIdentPos = 0;
  this.enterScope(functionFlags(isAsync, node.generator) | SCOPE_SUPER | (allowDirectSuper ? SCOPE_DIRECT_SUPER : 0));
  this.expect(types$1.parenL);
  node.params = this.parseBindingList(types$1.parenR, false, this.options.ecmaVersion >= 8);
  this.checkYieldAwaitInDefaultParams();
  this.parseFunctionBody(node, false, true, false);
  this.yieldPos = oldYieldPos;
  this.awaitPos = oldAwaitPos;
  this.awaitIdentPos = oldAwaitIdentPos;
  return this.finishNode(node, "FunctionExpression");
};
pp$5.parseArrowExpression = function(node, params, isAsync, forInit) {
  var oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
  this.enterScope(functionFlags(isAsync, false) | SCOPE_ARROW);
  this.initFunction(node);
  if (this.options.ecmaVersion >= 8) {
    node.async = !!isAsync;
  }
  this.yieldPos = 0;
  this.awaitPos = 0;
  this.awaitIdentPos = 0;
  node.params = this.toAssignableList(params, true);
  this.parseFunctionBody(node, true, false, forInit);
  this.yieldPos = oldYieldPos;
  this.awaitPos = oldAwaitPos;
  this.awaitIdentPos = oldAwaitIdentPos;
  return this.finishNode(node, "ArrowFunctionExpression");
};
pp$5.parseFunctionBody = function(node, isArrowFunction, isMethod, forInit) {
  var isExpression = isArrowFunction && this.type !== types$1.braceL;
  var oldStrict = this.strict, useStrict = false;
  if (isExpression) {
    node.body = this.parseMaybeAssign(forInit);
    node.expression = true;
    this.checkParams(node, false);
  } else {
    var nonSimple = this.options.ecmaVersion >= 7 && !this.isSimpleParamList(node.params);
    if (!oldStrict || nonSimple) {
      useStrict = this.strictDirective(this.end);
      if (useStrict && nonSimple) {
        this.raiseRecoverable(node.start, "Illegal 'use strict' directive in function with non-simple parameter list");
      }
    }
    var oldLabels = this.labels;
    this.labels = [];
    if (useStrict) {
      this.strict = true;
    }
    this.checkParams(node, !oldStrict && !useStrict && !isArrowFunction && !isMethod && this.isSimpleParamList(node.params));
    if (this.strict && node.id) {
      this.checkLValSimple(node.id, BIND_OUTSIDE);
    }
    node.body = this.parseBlock(false, undefined, useStrict && !oldStrict);
    node.expression = false;
    this.adaptDirectivePrologue(node.body.body);
    this.labels = oldLabels;
  }
  this.exitScope();
};
pp$5.isSimpleParamList = function(params) {
  for (var i = 0, list = params;i < list.length; i += 1) {
    var param = list[i];
    if (param.type !== "Identifier") {
      return false;
    }
  }
  return true;
};
pp$5.checkParams = function(node, allowDuplicates) {
  var nameHash = Object.create(null);
  for (var i = 0, list = node.params;i < list.length; i += 1) {
    var param = list[i];
    this.checkLValInnerPattern(param, BIND_VAR, allowDuplicates ? null : nameHash);
  }
};
pp$5.parseExprList = function(close, allowTrailingComma, allowEmpty, refDestructuringErrors) {
  var elts = [], first = true;
  while (!this.eat(close)) {
    if (!first) {
      this.expect(types$1.comma);
      if (allowTrailingComma && this.afterTrailingComma(close)) {
        break;
      }
    } else {
      first = false;
    }
    var elt = undefined;
    if (allowEmpty && this.type === types$1.comma) {
      elt = null;
    } else if (this.type === types$1.ellipsis) {
      elt = this.parseSpread(refDestructuringErrors);
      if (refDestructuringErrors && this.type === types$1.comma && refDestructuringErrors.trailingComma < 0) {
        refDestructuringErrors.trailingComma = this.start;
      }
    } else {
      elt = this.parseMaybeAssign(false, refDestructuringErrors);
    }
    elts.push(elt);
  }
  return elts;
};
pp$5.checkUnreserved = function(ref) {
  var start = ref.start;
  var end = ref.end;
  var name = ref.name;
  if (this.inGenerator && name === "yield") {
    this.raiseRecoverable(start, "Cannot use 'yield' as identifier inside a generator");
  }
  if (this.inAsync && name === "await") {
    this.raiseRecoverable(start, "Cannot use 'await' as identifier inside an async function");
  }
  if (!(this.currentThisScope().flags & SCOPE_VAR) && name === "arguments") {
    this.raiseRecoverable(start, "Cannot use 'arguments' in class field initializer");
  }
  if (this.inClassStaticBlock && (name === "arguments" || name === "await")) {
    this.raise(start, "Cannot use " + name + " in class static initialization block");
  }
  if (this.keywords.test(name)) {
    this.raise(start, "Unexpected keyword '" + name + "'");
  }
  if (this.options.ecmaVersion < 6 && this.input.slice(start, end).indexOf("\\") !== -1) {
    return;
  }
  var re = this.strict ? this.reservedWordsStrict : this.reservedWords;
  if (re.test(name)) {
    if (!this.inAsync && name === "await") {
      this.raiseRecoverable(start, "Cannot use keyword 'await' outside an async function");
    }
    this.raiseRecoverable(start, "The keyword '" + name + "' is reserved");
  }
};
pp$5.parseIdent = function(liberal) {
  var node = this.parseIdentNode();
  this.next(!!liberal);
  this.finishNode(node, "Identifier");
  if (!liberal) {
    this.checkUnreserved(node);
    if (node.name === "await" && !this.awaitIdentPos) {
      this.awaitIdentPos = node.start;
    }
  }
  return node;
};
pp$5.parseIdentNode = function() {
  var node = this.startNode();
  if (this.type === types$1.name) {
    node.name = this.value;
  } else if (this.type.keyword) {
    node.name = this.type.keyword;
    if ((node.name === "class" || node.name === "function") && (this.lastTokEnd !== this.lastTokStart + 1 || this.input.charCodeAt(this.lastTokStart) !== 46)) {
      this.context.pop();
    }
    this.type = types$1.name;
  } else {
    this.unexpected();
  }
  return node;
};
pp$5.parsePrivateIdent = function() {
  var node = this.startNode();
  if (this.type === types$1.privateId) {
    node.name = this.value;
  } else {
    this.unexpected();
  }
  this.next();
  this.finishNode(node, "PrivateIdentifier");
  if (this.options.checkPrivateFields) {
    if (this.privateNameStack.length === 0) {
      this.raise(node.start, "Private field '#" + node.name + "' must be declared in an enclosing class");
    } else {
      this.privateNameStack[this.privateNameStack.length - 1].used.push(node);
    }
  }
  return node;
};
pp$5.parseYield = function(forInit) {
  if (!this.yieldPos) {
    this.yieldPos = this.start;
  }
  var node = this.startNode();
  this.next();
  if (this.type === types$1.semi || this.canInsertSemicolon() || this.type !== types$1.star && !this.type.startsExpr) {
    node.delegate = false;
    node.argument = null;
  } else {
    node.delegate = this.eat(types$1.star);
    node.argument = this.parseMaybeAssign(forInit);
  }
  return this.finishNode(node, "YieldExpression");
};
pp$5.parseAwait = function(forInit) {
  if (!this.awaitPos) {
    this.awaitPos = this.start;
  }
  var node = this.startNode();
  this.next();
  node.argument = this.parseMaybeUnary(null, true, false, forInit);
  return this.finishNode(node, "AwaitExpression");
};
var pp$4 = Parser.prototype;
pp$4.raise = function(pos, message) {
  var loc = getLineInfo(this.input, pos);
  message += " (" + loc.line + ":" + loc.column + ")";
  if (this.sourceFile) {
    message += " in " + this.sourceFile;
  }
  var err = new SyntaxError(message);
  err.pos = pos;
  err.loc = loc;
  err.raisedAt = this.pos;
  throw err;
};
pp$4.raiseRecoverable = pp$4.raise;
pp$4.curPosition = function() {
  if (this.options.locations) {
    return new Position(this.curLine, this.pos - this.lineStart);
  }
};
var pp$3 = Parser.prototype;
var Scope = function Scope(flags) {
  this.flags = flags;
  this.var = [];
  this.lexical = [];
  this.functions = [];
};
pp$3.enterScope = function(flags) {
  this.scopeStack.push(new Scope(flags));
};
pp$3.exitScope = function() {
  this.scopeStack.pop();
};
pp$3.treatFunctionsAsVarInScope = function(scope) {
  return scope.flags & SCOPE_FUNCTION || !this.inModule && scope.flags & SCOPE_TOP;
};
pp$3.declareName = function(name, bindingType, pos) {
  var redeclared = false;
  if (bindingType === BIND_LEXICAL) {
    var scope = this.currentScope();
    redeclared = scope.lexical.indexOf(name) > -1 || scope.functions.indexOf(name) > -1 || scope.var.indexOf(name) > -1;
    scope.lexical.push(name);
    if (this.inModule && scope.flags & SCOPE_TOP) {
      delete this.undefinedExports[name];
    }
  } else if (bindingType === BIND_SIMPLE_CATCH) {
    var scope$1 = this.currentScope();
    scope$1.lexical.push(name);
  } else if (bindingType === BIND_FUNCTION) {
    var scope$2 = this.currentScope();
    if (this.treatFunctionsAsVar) {
      redeclared = scope$2.lexical.indexOf(name) > -1;
    } else {
      redeclared = scope$2.lexical.indexOf(name) > -1 || scope$2.var.indexOf(name) > -1;
    }
    scope$2.functions.push(name);
  } else {
    for (var i = this.scopeStack.length - 1;i >= 0; --i) {
      var scope$3 = this.scopeStack[i];
      if (scope$3.lexical.indexOf(name) > -1 && !(scope$3.flags & SCOPE_SIMPLE_CATCH && scope$3.lexical[0] === name) || !this.treatFunctionsAsVarInScope(scope$3) && scope$3.functions.indexOf(name) > -1) {
        redeclared = true;
        break;
      }
      scope$3.var.push(name);
      if (this.inModule && scope$3.flags & SCOPE_TOP) {
        delete this.undefinedExports[name];
      }
      if (scope$3.flags & SCOPE_VAR) {
        break;
      }
    }
  }
  if (redeclared) {
    this.raiseRecoverable(pos, "Identifier '" + name + "' has already been declared");
  }
};
pp$3.checkLocalExport = function(id) {
  if (this.scopeStack[0].lexical.indexOf(id.name) === -1 && this.scopeStack[0].var.indexOf(id.name) === -1) {
    this.undefinedExports[id.name] = id;
  }
};
pp$3.currentScope = function() {
  return this.scopeStack[this.scopeStack.length - 1];
};
pp$3.currentVarScope = function() {
  for (var i = this.scopeStack.length - 1;; i--) {
    var scope = this.scopeStack[i];
    if (scope.flags & (SCOPE_VAR | SCOPE_CLASS_FIELD_INIT | SCOPE_CLASS_STATIC_BLOCK)) {
      return scope;
    }
  }
};
pp$3.currentThisScope = function() {
  for (var i = this.scopeStack.length - 1;; i--) {
    var scope = this.scopeStack[i];
    if (scope.flags & (SCOPE_VAR | SCOPE_CLASS_FIELD_INIT | SCOPE_CLASS_STATIC_BLOCK) && !(scope.flags & SCOPE_ARROW)) {
      return scope;
    }
  }
};
var Node = function Node(parser, pos, loc) {
  this.type = "";
  this.start = pos;
  this.end = 0;
  if (parser.options.locations) {
    this.loc = new SourceLocation(parser, loc);
  }
  if (parser.options.directSourceFile) {
    this.sourceFile = parser.options.directSourceFile;
  }
  if (parser.options.ranges) {
    this.range = [pos, 0];
  }
};
var pp$2 = Parser.prototype;
pp$2.startNode = function() {
  return new Node(this, this.start, this.startLoc);
};
pp$2.startNodeAt = function(pos, loc) {
  return new Node(this, pos, loc);
};
function finishNodeAt(node, type, pos, loc) {
  node.type = type;
  node.end = pos;
  if (this.options.locations) {
    node.loc.end = loc;
  }
  if (this.options.ranges) {
    node.range[1] = pos;
  }
  return node;
}
pp$2.finishNode = function(node, type) {
  return finishNodeAt.call(this, node, type, this.lastTokEnd, this.lastTokEndLoc);
};
pp$2.finishNodeAt = function(node, type, pos, loc) {
  return finishNodeAt.call(this, node, type, pos, loc);
};
pp$2.copyNode = function(node) {
  var newNode = new Node(this, node.start, this.startLoc);
  for (var prop in node) {
    newNode[prop] = node[prop];
  }
  return newNode;
};
var scriptValuesAddedInUnicode = "Berf Beria_Erfe Gara Garay Gukh Gurung_Khema Hrkt Katakana_Or_Hiragana Kawi Kirat_Rai Krai Nag_Mundari Nagm Ol_Onal Onao Sidetic Sidt Sunu Sunuwar Tai_Yo Tayo Todhri Todr Tolong_Siki Tols Tulu_Tigalari Tutg Unknown Zzzz";
var ecma9BinaryProperties = "ASCII ASCII_Hex_Digit AHex Alphabetic Alpha Any Assigned Bidi_Control Bidi_C Bidi_Mirrored Bidi_M Case_Ignorable CI Cased Changes_When_Casefolded CWCF Changes_When_Casemapped CWCM Changes_When_Lowercased CWL Changes_When_NFKC_Casefolded CWKCF Changes_When_Titlecased CWT Changes_When_Uppercased CWU Dash Default_Ignorable_Code_Point DI Deprecated Dep Diacritic Dia Emoji Emoji_Component Emoji_Modifier Emoji_Modifier_Base Emoji_Presentation Extender Ext Grapheme_Base Gr_Base Grapheme_Extend Gr_Ext Hex_Digit Hex IDS_Binary_Operator IDSB IDS_Trinary_Operator IDST ID_Continue IDC ID_Start IDS Ideographic Ideo Join_Control Join_C Logical_Order_Exception LOE Lowercase Lower Math Noncharacter_Code_Point NChar Pattern_Syntax Pat_Syn Pattern_White_Space Pat_WS Quotation_Mark QMark Radical Regional_Indicator RI Sentence_Terminal STerm Soft_Dotted SD Terminal_Punctuation Term Unified_Ideograph UIdeo Uppercase Upper Variation_Selector VS White_Space space XID_Continue XIDC XID_Start XIDS";
var ecma10BinaryProperties = ecma9BinaryProperties + " Extended_Pictographic";
var ecma11BinaryProperties = ecma10BinaryProperties;
var ecma12BinaryProperties = ecma11BinaryProperties + " EBase EComp EMod EPres ExtPict";
var ecma13BinaryProperties = ecma12BinaryProperties;
var ecma14BinaryProperties = ecma13BinaryProperties;
var unicodeBinaryProperties = {
  9: ecma9BinaryProperties,
  10: ecma10BinaryProperties,
  11: ecma11BinaryProperties,
  12: ecma12BinaryProperties,
  13: ecma13BinaryProperties,
  14: ecma14BinaryProperties
};
var ecma14BinaryPropertiesOfStrings = "Basic_Emoji Emoji_Keycap_Sequence RGI_Emoji_Modifier_Sequence RGI_Emoji_Flag_Sequence RGI_Emoji_Tag_Sequence RGI_Emoji_ZWJ_Sequence RGI_Emoji";
var unicodeBinaryPropertiesOfStrings = {
  9: "",
  10: "",
  11: "",
  12: "",
  13: "",
  14: ecma14BinaryPropertiesOfStrings
};
var unicodeGeneralCategoryValues = "Cased_Letter LC Close_Punctuation Pe Connector_Punctuation Pc Control Cc cntrl Currency_Symbol Sc Dash_Punctuation Pd Decimal_Number Nd digit Enclosing_Mark Me Final_Punctuation Pf Format Cf Initial_Punctuation Pi Letter L Letter_Number Nl Line_Separator Zl Lowercase_Letter Ll Mark M Combining_Mark Math_Symbol Sm Modifier_Letter Lm Modifier_Symbol Sk Nonspacing_Mark Mn Number N Open_Punctuation Ps Other C Other_Letter Lo Other_Number No Other_Punctuation Po Other_Symbol So Paragraph_Separator Zp Private_Use Co Punctuation P punct Separator Z Space_Separator Zs Spacing_Mark Mc Surrogate Cs Symbol S Titlecase_Letter Lt Unassigned Cn Uppercase_Letter Lu";
var ecma9ScriptValues = "Adlam Adlm Ahom Anatolian_Hieroglyphs Hluw Arabic Arab Armenian Armn Avestan Avst Balinese Bali Bamum Bamu Bassa_Vah Bass Batak Batk Bengali Beng Bhaiksuki Bhks Bopomofo Bopo Brahmi Brah Braille Brai Buginese Bugi Buhid Buhd Canadian_Aboriginal Cans Carian Cari Caucasian_Albanian Aghb Chakma Cakm Cham Cham Cherokee Cher Common Zyyy Coptic Copt Qaac Cuneiform Xsux Cypriot Cprt Cyrillic Cyrl Deseret Dsrt Devanagari Deva Duployan Dupl Egyptian_Hieroglyphs Egyp Elbasan Elba Ethiopic Ethi Georgian Geor Glagolitic Glag Gothic Goth Grantha Gran Greek Grek Gujarati Gujr Gurmukhi Guru Han Hani Hangul Hang Hanunoo Hano Hatran Hatr Hebrew Hebr Hiragana Hira Imperial_Aramaic Armi Inherited Zinh Qaai Inscriptional_Pahlavi Phli Inscriptional_Parthian Prti Javanese Java Kaithi Kthi Kannada Knda Katakana Kana Kayah_Li Kali Kharoshthi Khar Khmer Khmr Khojki Khoj Khudawadi Sind Lao Laoo Latin Latn Lepcha Lepc Limbu Limb Linear_A Lina Linear_B Linb Lisu Lisu Lycian Lyci Lydian Lydi Mahajani Mahj Malayalam Mlym Mandaic Mand Manichaean Mani Marchen Marc Masaram_Gondi Gonm Meetei_Mayek Mtei Mende_Kikakui Mend Meroitic_Cursive Merc Meroitic_Hieroglyphs Mero Miao Plrd Modi Mongolian Mong Mro Mroo Multani Mult Myanmar Mymr Nabataean Nbat New_Tai_Lue Talu Newa Newa Nko Nkoo Nushu Nshu Ogham Ogam Ol_Chiki Olck Old_Hungarian Hung Old_Italic Ital Old_North_Arabian Narb Old_Permic Perm Old_Persian Xpeo Old_South_Arabian Sarb Old_Turkic Orkh Oriya Orya Osage Osge Osmanya Osma Pahawh_Hmong Hmng Palmyrene Palm Pau_Cin_Hau Pauc Phags_Pa Phag Phoenician Phnx Psalter_Pahlavi Phlp Rejang Rjng Runic Runr Samaritan Samr Saurashtra Saur Sharada Shrd Shavian Shaw Siddham Sidd SignWriting Sgnw Sinhala Sinh Sora_Sompeng Sora Soyombo Soyo Sundanese Sund Syloti_Nagri Sylo Syriac Syrc Tagalog Tglg Tagbanwa Tagb Tai_Le Tale Tai_Tham Lana Tai_Viet Tavt Takri Takr Tamil Taml Tangut Tang Telugu Telu Thaana Thaa Thai Thai Tibetan Tibt Tifinagh Tfng Tirhuta Tirh Ugaritic Ugar Vai Vaii Warang_Citi Wara Yi Yiii Zanabazar_Square Zanb";
var ecma10ScriptValues = ecma9ScriptValues + " Dogra Dogr Gunjala_Gondi Gong Hanifi_Rohingya Rohg Makasar Maka Medefaidrin Medf Old_Sogdian Sogo Sogdian Sogd";
var ecma11ScriptValues = ecma10ScriptValues + " Elymaic Elym Nandinagari Nand Nyiakeng_Puachue_Hmong Hmnp Wancho Wcho";
var ecma12ScriptValues = ecma11ScriptValues + " Chorasmian Chrs Diak Dives_Akuru Khitan_Small_Script Kits Yezi Yezidi";
var ecma13ScriptValues = ecma12ScriptValues + " Cypro_Minoan Cpmn Old_Uyghur Ougr Tangsa Tnsa Toto Vithkuqi Vith";
var ecma14ScriptValues = ecma13ScriptValues + " " + scriptValuesAddedInUnicode;
var unicodeScriptValues = {
  9: ecma9ScriptValues,
  10: ecma10ScriptValues,
  11: ecma11ScriptValues,
  12: ecma12ScriptValues,
  13: ecma13ScriptValues,
  14: ecma14ScriptValues
};
var data = {};
function buildUnicodeData(ecmaVersion) {
  var d = data[ecmaVersion] = {
    binary: wordsRegexp(unicodeBinaryProperties[ecmaVersion] + " " + unicodeGeneralCategoryValues),
    binaryOfStrings: wordsRegexp(unicodeBinaryPropertiesOfStrings[ecmaVersion]),
    nonBinary: {
      General_Category: wordsRegexp(unicodeGeneralCategoryValues),
      Script: wordsRegexp(unicodeScriptValues[ecmaVersion])
    }
  };
  d.nonBinary.Script_Extensions = d.nonBinary.Script;
  d.nonBinary.gc = d.nonBinary.General_Category;
  d.nonBinary.sc = d.nonBinary.Script;
  d.nonBinary.scx = d.nonBinary.Script_Extensions;
}
for (i = 0, list = [9, 10, 11, 12, 13, 14];i < list.length; i += 1) {
  ecmaVersion = list[i];
  buildUnicodeData(ecmaVersion);
}
var ecmaVersion;
var i;
var list;
var pp$1 = Parser.prototype;
var BranchID = function BranchID(parent, base) {
  this.parent = parent;
  this.base = base || this;
};
BranchID.prototype.separatedFrom = function separatedFrom(alt) {
  for (var self = this;self; self = self.parent) {
    for (var other = alt;other; other = other.parent) {
      if (self.base === other.base && self !== other) {
        return true;
      }
    }
  }
  return false;
};
BranchID.prototype.sibling = function sibling() {
  return new BranchID(this.parent, this.base);
};
var RegExpValidationState = function RegExpValidationState(parser) {
  this.parser = parser;
  this.validFlags = "gim" + (parser.options.ecmaVersion >= 6 ? "uy" : "") + (parser.options.ecmaVersion >= 9 ? "s" : "") + (parser.options.ecmaVersion >= 13 ? "d" : "") + (parser.options.ecmaVersion >= 15 ? "v" : "");
  this.unicodeProperties = data[parser.options.ecmaVersion >= 14 ? 14 : parser.options.ecmaVersion];
  this.source = "";
  this.flags = "";
  this.start = 0;
  this.switchU = false;
  this.switchV = false;
  this.switchN = false;
  this.pos = 0;
  this.lastIntValue = 0;
  this.lastStringValue = "";
  this.lastAssertionIsQuantifiable = false;
  this.numCapturingParens = 0;
  this.maxBackReference = 0;
  this.groupNames = Object.create(null);
  this.backReferenceNames = [];
  this.branchID = null;
};
RegExpValidationState.prototype.reset = function reset(start, pattern, flags) {
  var unicodeSets = flags.indexOf("v") !== -1;
  var unicode = flags.indexOf("u") !== -1;
  this.start = start | 0;
  this.source = pattern + "";
  this.flags = flags;
  if (unicodeSets && this.parser.options.ecmaVersion >= 15) {
    this.switchU = true;
    this.switchV = true;
    this.switchN = true;
  } else {
    this.switchU = unicode && this.parser.options.ecmaVersion >= 6;
    this.switchV = false;
    this.switchN = unicode && this.parser.options.ecmaVersion >= 9;
  }
};
RegExpValidationState.prototype.raise = function raise(message) {
  this.parser.raiseRecoverable(this.start, "Invalid regular expression: /" + this.source + "/: " + message);
};
RegExpValidationState.prototype.at = function at(i, forceU) {
  if (forceU === undefined)
    forceU = false;
  var s = this.source;
  var l = s.length;
  if (i >= l) {
    return -1;
  }
  var c = s.charCodeAt(i);
  if (!(forceU || this.switchU) || c <= 55295 || c >= 57344 || i + 1 >= l) {
    return c;
  }
  var next = s.charCodeAt(i + 1);
  return next >= 56320 && next <= 57343 ? (c << 10) + next - 56613888 : c;
};
RegExpValidationState.prototype.nextIndex = function nextIndex(i, forceU) {
  if (forceU === undefined)
    forceU = false;
  var s = this.source;
  var l = s.length;
  if (i >= l) {
    return l;
  }
  var c = s.charCodeAt(i), next;
  if (!(forceU || this.switchU) || c <= 55295 || c >= 57344 || i + 1 >= l || (next = s.charCodeAt(i + 1)) < 56320 || next > 57343) {
    return i + 1;
  }
  return i + 2;
};
RegExpValidationState.prototype.current = function current(forceU) {
  if (forceU === undefined)
    forceU = false;
  return this.at(this.pos, forceU);
};
RegExpValidationState.prototype.lookahead = function lookahead(forceU) {
  if (forceU === undefined)
    forceU = false;
  return this.at(this.nextIndex(this.pos, forceU), forceU);
};
RegExpValidationState.prototype.advance = function advance(forceU) {
  if (forceU === undefined)
    forceU = false;
  this.pos = this.nextIndex(this.pos, forceU);
};
RegExpValidationState.prototype.eat = function eat(ch, forceU) {
  if (forceU === undefined)
    forceU = false;
  if (this.current(forceU) === ch) {
    this.advance(forceU);
    return true;
  }
  return false;
};
RegExpValidationState.prototype.eatChars = function eatChars(chs, forceU) {
  if (forceU === undefined)
    forceU = false;
  var pos = this.pos;
  for (var i = 0, list = chs;i < list.length; i += 1) {
    var ch = list[i];
    var current = this.at(pos, forceU);
    if (current === -1 || current !== ch) {
      return false;
    }
    pos = this.nextIndex(pos, forceU);
  }
  this.pos = pos;
  return true;
};
pp$1.validateRegExpFlags = function(state) {
  var validFlags = state.validFlags;
  var flags = state.flags;
  var u = false;
  var v = false;
  for (var i = 0;i < flags.length; i++) {
    var flag = flags.charAt(i);
    if (validFlags.indexOf(flag) === -1) {
      this.raise(state.start, "Invalid regular expression flag");
    }
    if (flags.indexOf(flag, i + 1) > -1) {
      this.raise(state.start, "Duplicate regular expression flag");
    }
    if (flag === "u") {
      u = true;
    }
    if (flag === "v") {
      v = true;
    }
  }
  if (this.options.ecmaVersion >= 15 && u && v) {
    this.raise(state.start, "Invalid regular expression flag");
  }
};
function hasProp(obj) {
  for (var _ in obj) {
    return true;
  }
  return false;
}
pp$1.validateRegExpPattern = function(state) {
  this.regexp_pattern(state);
  if (!state.switchN && this.options.ecmaVersion >= 9 && hasProp(state.groupNames)) {
    state.switchN = true;
    this.regexp_pattern(state);
  }
};
pp$1.regexp_pattern = function(state) {
  state.pos = 0;
  state.lastIntValue = 0;
  state.lastStringValue = "";
  state.lastAssertionIsQuantifiable = false;
  state.numCapturingParens = 0;
  state.maxBackReference = 0;
  state.groupNames = Object.create(null);
  state.backReferenceNames.length = 0;
  state.branchID = null;
  this.regexp_disjunction(state);
  if (state.pos !== state.source.length) {
    if (state.eat(41)) {
      state.raise("Unmatched ')'");
    }
    if (state.eat(93) || state.eat(125)) {
      state.raise("Lone quantifier brackets");
    }
  }
  if (state.maxBackReference > state.numCapturingParens) {
    state.raise("Invalid escape");
  }
  for (var i = 0, list = state.backReferenceNames;i < list.length; i += 1) {
    var name = list[i];
    if (!state.groupNames[name]) {
      state.raise("Invalid named capture referenced");
    }
  }
};
pp$1.regexp_disjunction = function(state) {
  var trackDisjunction = this.options.ecmaVersion >= 16;
  if (trackDisjunction) {
    state.branchID = new BranchID(state.branchID, null);
  }
  this.regexp_alternative(state);
  while (state.eat(124)) {
    if (trackDisjunction) {
      state.branchID = state.branchID.sibling();
    }
    this.regexp_alternative(state);
  }
  if (trackDisjunction) {
    state.branchID = state.branchID.parent;
  }
  if (this.regexp_eatQuantifier(state, true)) {
    state.raise("Nothing to repeat");
  }
  if (state.eat(123)) {
    state.raise("Lone quantifier brackets");
  }
};
pp$1.regexp_alternative = function(state) {
  while (state.pos < state.source.length && this.regexp_eatTerm(state)) {}
};
pp$1.regexp_eatTerm = function(state) {
  if (this.regexp_eatAssertion(state)) {
    if (state.lastAssertionIsQuantifiable && this.regexp_eatQuantifier(state)) {
      if (state.switchU) {
        state.raise("Invalid quantifier");
      }
    }
    return true;
  }
  if (state.switchU ? this.regexp_eatAtom(state) : this.regexp_eatExtendedAtom(state)) {
    this.regexp_eatQuantifier(state);
    return true;
  }
  return false;
};
pp$1.regexp_eatAssertion = function(state) {
  var start = state.pos;
  state.lastAssertionIsQuantifiable = false;
  if (state.eat(94) || state.eat(36)) {
    return true;
  }
  if (state.eat(92)) {
    if (state.eat(66) || state.eat(98)) {
      return true;
    }
    state.pos = start;
  }
  if (state.eat(40) && state.eat(63)) {
    var lookbehind = false;
    if (this.options.ecmaVersion >= 9) {
      lookbehind = state.eat(60);
    }
    if (state.eat(61) || state.eat(33)) {
      this.regexp_disjunction(state);
      if (!state.eat(41)) {
        state.raise("Unterminated group");
      }
      state.lastAssertionIsQuantifiable = !lookbehind;
      return true;
    }
  }
  state.pos = start;
  return false;
};
pp$1.regexp_eatQuantifier = function(state, noError) {
  if (noError === undefined)
    noError = false;
  if (this.regexp_eatQuantifierPrefix(state, noError)) {
    state.eat(63);
    return true;
  }
  return false;
};
pp$1.regexp_eatQuantifierPrefix = function(state, noError) {
  return state.eat(42) || state.eat(43) || state.eat(63) || this.regexp_eatBracedQuantifier(state, noError);
};
pp$1.regexp_eatBracedQuantifier = function(state, noError) {
  var start = state.pos;
  if (state.eat(123)) {
    var min = 0, max = -1;
    if (this.regexp_eatDecimalDigits(state)) {
      min = state.lastIntValue;
      if (state.eat(44) && this.regexp_eatDecimalDigits(state)) {
        max = state.lastIntValue;
      }
      if (state.eat(125)) {
        if (max !== -1 && max < min && !noError) {
          state.raise("numbers out of order in {} quantifier");
        }
        return true;
      }
    }
    if (state.switchU && !noError) {
      state.raise("Incomplete quantifier");
    }
    state.pos = start;
  }
  return false;
};
pp$1.regexp_eatAtom = function(state) {
  return this.regexp_eatPatternCharacters(state) || state.eat(46) || this.regexp_eatReverseSolidusAtomEscape(state) || this.regexp_eatCharacterClass(state) || this.regexp_eatUncapturingGroup(state) || this.regexp_eatCapturingGroup(state);
};
pp$1.regexp_eatReverseSolidusAtomEscape = function(state) {
  var start = state.pos;
  if (state.eat(92)) {
    if (this.regexp_eatAtomEscape(state)) {
      return true;
    }
    state.pos = start;
  }
  return false;
};
pp$1.regexp_eatUncapturingGroup = function(state) {
  var start = state.pos;
  if (state.eat(40)) {
    if (state.eat(63)) {
      if (this.options.ecmaVersion >= 16) {
        var addModifiers = this.regexp_eatModifiers(state);
        var hasHyphen = state.eat(45);
        if (addModifiers || hasHyphen) {
          for (var i = 0;i < addModifiers.length; i++) {
            var modifier = addModifiers.charAt(i);
            if (addModifiers.indexOf(modifier, i + 1) > -1) {
              state.raise("Duplicate regular expression modifiers");
            }
          }
          if (hasHyphen) {
            var removeModifiers = this.regexp_eatModifiers(state);
            if (!addModifiers && !removeModifiers && state.current() === 58) {
              state.raise("Invalid regular expression modifiers");
            }
            for (var i$1 = 0;i$1 < removeModifiers.length; i$1++) {
              var modifier$1 = removeModifiers.charAt(i$1);
              if (removeModifiers.indexOf(modifier$1, i$1 + 1) > -1 || addModifiers.indexOf(modifier$1) > -1) {
                state.raise("Duplicate regular expression modifiers");
              }
            }
          }
        }
      }
      if (state.eat(58)) {
        this.regexp_disjunction(state);
        if (state.eat(41)) {
          return true;
        }
        state.raise("Unterminated group");
      }
    }
    state.pos = start;
  }
  return false;
};
pp$1.regexp_eatCapturingGroup = function(state) {
  if (state.eat(40)) {
    if (this.options.ecmaVersion >= 9) {
      this.regexp_groupSpecifier(state);
    } else if (state.current() === 63) {
      state.raise("Invalid group");
    }
    this.regexp_disjunction(state);
    if (state.eat(41)) {
      state.numCapturingParens += 1;
      return true;
    }
    state.raise("Unterminated group");
  }
  return false;
};
pp$1.regexp_eatModifiers = function(state) {
  var modifiers = "";
  var ch = 0;
  while ((ch = state.current()) !== -1 && isRegularExpressionModifier(ch)) {
    modifiers += codePointToString(ch);
    state.advance();
  }
  return modifiers;
};
function isRegularExpressionModifier(ch) {
  return ch === 105 || ch === 109 || ch === 115;
}
pp$1.regexp_eatExtendedAtom = function(state) {
  return state.eat(46) || this.regexp_eatReverseSolidusAtomEscape(state) || this.regexp_eatCharacterClass(state) || this.regexp_eatUncapturingGroup(state) || this.regexp_eatCapturingGroup(state) || this.regexp_eatInvalidBracedQuantifier(state) || this.regexp_eatExtendedPatternCharacter(state);
};
pp$1.regexp_eatInvalidBracedQuantifier = function(state) {
  if (this.regexp_eatBracedQuantifier(state, true)) {
    state.raise("Nothing to repeat");
  }
  return false;
};
pp$1.regexp_eatSyntaxCharacter = function(state) {
  var ch = state.current();
  if (isSyntaxCharacter(ch)) {
    state.lastIntValue = ch;
    state.advance();
    return true;
  }
  return false;
};
function isSyntaxCharacter(ch) {
  return ch === 36 || ch >= 40 && ch <= 43 || ch === 46 || ch === 63 || ch >= 91 && ch <= 94 || ch >= 123 && ch <= 125;
}
pp$1.regexp_eatPatternCharacters = function(state) {
  var start = state.pos;
  var ch = 0;
  while ((ch = state.current()) !== -1 && !isSyntaxCharacter(ch)) {
    state.advance();
  }
  return state.pos !== start;
};
pp$1.regexp_eatExtendedPatternCharacter = function(state) {
  var ch = state.current();
  if (ch !== -1 && ch !== 36 && !(ch >= 40 && ch <= 43) && ch !== 46 && ch !== 63 && ch !== 91 && ch !== 94 && ch !== 124) {
    state.advance();
    return true;
  }
  return false;
};
pp$1.regexp_groupSpecifier = function(state) {
  if (state.eat(63)) {
    if (!this.regexp_eatGroupName(state)) {
      state.raise("Invalid group");
    }
    var trackDisjunction = this.options.ecmaVersion >= 16;
    var known = state.groupNames[state.lastStringValue];
    if (known) {
      if (trackDisjunction) {
        for (var i = 0, list = known;i < list.length; i += 1) {
          var altID = list[i];
          if (!altID.separatedFrom(state.branchID)) {
            state.raise("Duplicate capture group name");
          }
        }
      } else {
        state.raise("Duplicate capture group name");
      }
    }
    if (trackDisjunction) {
      (known || (state.groupNames[state.lastStringValue] = [])).push(state.branchID);
    } else {
      state.groupNames[state.lastStringValue] = true;
    }
  }
};
pp$1.regexp_eatGroupName = function(state) {
  state.lastStringValue = "";
  if (state.eat(60)) {
    if (this.regexp_eatRegExpIdentifierName(state) && state.eat(62)) {
      return true;
    }
    state.raise("Invalid capture group name");
  }
  return false;
};
pp$1.regexp_eatRegExpIdentifierName = function(state) {
  state.lastStringValue = "";
  if (this.regexp_eatRegExpIdentifierStart(state)) {
    state.lastStringValue += codePointToString(state.lastIntValue);
    while (this.regexp_eatRegExpIdentifierPart(state)) {
      state.lastStringValue += codePointToString(state.lastIntValue);
    }
    return true;
  }
  return false;
};
pp$1.regexp_eatRegExpIdentifierStart = function(state) {
  var start = state.pos;
  var forceU = this.options.ecmaVersion >= 11;
  var ch = state.current(forceU);
  state.advance(forceU);
  if (ch === 92 && this.regexp_eatRegExpUnicodeEscapeSequence(state, forceU)) {
    ch = state.lastIntValue;
  }
  if (isRegExpIdentifierStart(ch)) {
    state.lastIntValue = ch;
    return true;
  }
  state.pos = start;
  return false;
};
function isRegExpIdentifierStart(ch) {
  return isIdentifierStart(ch, true) || ch === 36 || ch === 95;
}
pp$1.regexp_eatRegExpIdentifierPart = function(state) {
  var start = state.pos;
  var forceU = this.options.ecmaVersion >= 11;
  var ch = state.current(forceU);
  state.advance(forceU);
  if (ch === 92 && this.regexp_eatRegExpUnicodeEscapeSequence(state, forceU)) {
    ch = state.lastIntValue;
  }
  if (isRegExpIdentifierPart(ch)) {
    state.lastIntValue = ch;
    return true;
  }
  state.pos = start;
  return false;
};
function isRegExpIdentifierPart(ch) {
  return isIdentifierChar(ch, true) || ch === 36 || ch === 95 || ch === 8204 || ch === 8205;
}
pp$1.regexp_eatAtomEscape = function(state) {
  if (this.regexp_eatBackReference(state) || this.regexp_eatCharacterClassEscape(state) || this.regexp_eatCharacterEscape(state) || state.switchN && this.regexp_eatKGroupName(state)) {
    return true;
  }
  if (state.switchU) {
    if (state.current() === 99) {
      state.raise("Invalid unicode escape");
    }
    state.raise("Invalid escape");
  }
  return false;
};
pp$1.regexp_eatBackReference = function(state) {
  var start = state.pos;
  if (this.regexp_eatDecimalEscape(state)) {
    var n = state.lastIntValue;
    if (state.switchU) {
      if (n > state.maxBackReference) {
        state.maxBackReference = n;
      }
      return true;
    }
    if (n <= state.numCapturingParens) {
      return true;
    }
    state.pos = start;
  }
  return false;
};
pp$1.regexp_eatKGroupName = function(state) {
  if (state.eat(107)) {
    if (this.regexp_eatGroupName(state)) {
      state.backReferenceNames.push(state.lastStringValue);
      return true;
    }
    state.raise("Invalid named reference");
  }
  return false;
};
pp$1.regexp_eatCharacterEscape = function(state) {
  return this.regexp_eatControlEscape(state) || this.regexp_eatCControlLetter(state) || this.regexp_eatZero(state) || this.regexp_eatHexEscapeSequence(state) || this.regexp_eatRegExpUnicodeEscapeSequence(state, false) || !state.switchU && this.regexp_eatLegacyOctalEscapeSequence(state) || this.regexp_eatIdentityEscape(state);
};
pp$1.regexp_eatCControlLetter = function(state) {
  var start = state.pos;
  if (state.eat(99)) {
    if (this.regexp_eatControlLetter(state)) {
      return true;
    }
    state.pos = start;
  }
  return false;
};
pp$1.regexp_eatZero = function(state) {
  if (state.current() === 48 && !isDecimalDigit(state.lookahead())) {
    state.lastIntValue = 0;
    state.advance();
    return true;
  }
  return false;
};
pp$1.regexp_eatControlEscape = function(state) {
  var ch = state.current();
  if (ch === 116) {
    state.lastIntValue = 9;
    state.advance();
    return true;
  }
  if (ch === 110) {
    state.lastIntValue = 10;
    state.advance();
    return true;
  }
  if (ch === 118) {
    state.lastIntValue = 11;
    state.advance();
    return true;
  }
  if (ch === 102) {
    state.lastIntValue = 12;
    state.advance();
    return true;
  }
  if (ch === 114) {
    state.lastIntValue = 13;
    state.advance();
    return true;
  }
  return false;
};
pp$1.regexp_eatControlLetter = function(state) {
  var ch = state.current();
  if (isControlLetter(ch)) {
    state.lastIntValue = ch % 32;
    state.advance();
    return true;
  }
  return false;
};
function isControlLetter(ch) {
  return ch >= 65 && ch <= 90 || ch >= 97 && ch <= 122;
}
pp$1.regexp_eatRegExpUnicodeEscapeSequence = function(state, forceU) {
  if (forceU === undefined)
    forceU = false;
  var start = state.pos;
  var switchU = forceU || state.switchU;
  if (state.eat(117)) {
    if (this.regexp_eatFixedHexDigits(state, 4)) {
      var lead = state.lastIntValue;
      if (switchU && lead >= 55296 && lead <= 56319) {
        var leadSurrogateEnd = state.pos;
        if (state.eat(92) && state.eat(117) && this.regexp_eatFixedHexDigits(state, 4)) {
          var trail = state.lastIntValue;
          if (trail >= 56320 && trail <= 57343) {
            state.lastIntValue = (lead - 55296) * 1024 + (trail - 56320) + 65536;
            return true;
          }
        }
        state.pos = leadSurrogateEnd;
        state.lastIntValue = lead;
      }
      return true;
    }
    if (switchU && state.eat(123) && this.regexp_eatHexDigits(state) && state.eat(125) && isValidUnicode(state.lastIntValue)) {
      return true;
    }
    if (switchU) {
      state.raise("Invalid unicode escape");
    }
    state.pos = start;
  }
  return false;
};
function isValidUnicode(ch) {
  return ch >= 0 && ch <= 1114111;
}
pp$1.regexp_eatIdentityEscape = function(state) {
  if (state.switchU) {
    if (this.regexp_eatSyntaxCharacter(state)) {
      return true;
    }
    if (state.eat(47)) {
      state.lastIntValue = 47;
      return true;
    }
    return false;
  }
  var ch = state.current();
  if (ch !== 99 && (!state.switchN || ch !== 107)) {
    state.lastIntValue = ch;
    state.advance();
    return true;
  }
  return false;
};
pp$1.regexp_eatDecimalEscape = function(state) {
  state.lastIntValue = 0;
  var ch = state.current();
  if (ch >= 49 && ch <= 57) {
    do {
      state.lastIntValue = 10 * state.lastIntValue + (ch - 48);
      state.advance();
    } while ((ch = state.current()) >= 48 && ch <= 57);
    return true;
  }
  return false;
};
var CharSetNone = 0;
var CharSetOk = 1;
var CharSetString = 2;
pp$1.regexp_eatCharacterClassEscape = function(state) {
  var ch = state.current();
  if (isCharacterClassEscape(ch)) {
    state.lastIntValue = -1;
    state.advance();
    return CharSetOk;
  }
  var negate = false;
  if (state.switchU && this.options.ecmaVersion >= 9 && ((negate = ch === 80) || ch === 112)) {
    state.lastIntValue = -1;
    state.advance();
    var result;
    if (state.eat(123) && (result = this.regexp_eatUnicodePropertyValueExpression(state)) && state.eat(125)) {
      if (negate && result === CharSetString) {
        state.raise("Invalid property name");
      }
      return result;
    }
    state.raise("Invalid property name");
  }
  return CharSetNone;
};
function isCharacterClassEscape(ch) {
  return ch === 100 || ch === 68 || ch === 115 || ch === 83 || ch === 119 || ch === 87;
}
pp$1.regexp_eatUnicodePropertyValueExpression = function(state) {
  var start = state.pos;
  if (this.regexp_eatUnicodePropertyName(state) && state.eat(61)) {
    var name = state.lastStringValue;
    if (this.regexp_eatUnicodePropertyValue(state)) {
      var value = state.lastStringValue;
      this.regexp_validateUnicodePropertyNameAndValue(state, name, value);
      return CharSetOk;
    }
  }
  state.pos = start;
  if (this.regexp_eatLoneUnicodePropertyNameOrValue(state)) {
    var nameOrValue = state.lastStringValue;
    return this.regexp_validateUnicodePropertyNameOrValue(state, nameOrValue);
  }
  return CharSetNone;
};
pp$1.regexp_validateUnicodePropertyNameAndValue = function(state, name, value) {
  if (!hasOwn(state.unicodeProperties.nonBinary, name)) {
    state.raise("Invalid property name");
  }
  if (!state.unicodeProperties.nonBinary[name].test(value)) {
    state.raise("Invalid property value");
  }
};
pp$1.regexp_validateUnicodePropertyNameOrValue = function(state, nameOrValue) {
  if (state.unicodeProperties.binary.test(nameOrValue)) {
    return CharSetOk;
  }
  if (state.switchV && state.unicodeProperties.binaryOfStrings.test(nameOrValue)) {
    return CharSetString;
  }
  state.raise("Invalid property name");
};
pp$1.regexp_eatUnicodePropertyName = function(state) {
  var ch = 0;
  state.lastStringValue = "";
  while (isUnicodePropertyNameCharacter(ch = state.current())) {
    state.lastStringValue += codePointToString(ch);
    state.advance();
  }
  return state.lastStringValue !== "";
};
function isUnicodePropertyNameCharacter(ch) {
  return isControlLetter(ch) || ch === 95;
}
pp$1.regexp_eatUnicodePropertyValue = function(state) {
  var ch = 0;
  state.lastStringValue = "";
  while (isUnicodePropertyValueCharacter(ch = state.current())) {
    state.lastStringValue += codePointToString(ch);
    state.advance();
  }
  return state.lastStringValue !== "";
};
function isUnicodePropertyValueCharacter(ch) {
  return isUnicodePropertyNameCharacter(ch) || isDecimalDigit(ch);
}
pp$1.regexp_eatLoneUnicodePropertyNameOrValue = function(state) {
  return this.regexp_eatUnicodePropertyValue(state);
};
pp$1.regexp_eatCharacterClass = function(state) {
  if (state.eat(91)) {
    var negate = state.eat(94);
    var result = this.regexp_classContents(state);
    if (!state.eat(93)) {
      state.raise("Unterminated character class");
    }
    if (negate && result === CharSetString) {
      state.raise("Negated character class may contain strings");
    }
    return true;
  }
  return false;
};
pp$1.regexp_classContents = function(state) {
  if (state.current() === 93) {
    return CharSetOk;
  }
  if (state.switchV) {
    return this.regexp_classSetExpression(state);
  }
  this.regexp_nonEmptyClassRanges(state);
  return CharSetOk;
};
pp$1.regexp_nonEmptyClassRanges = function(state) {
  while (this.regexp_eatClassAtom(state)) {
    var left = state.lastIntValue;
    if (state.eat(45) && this.regexp_eatClassAtom(state)) {
      var right = state.lastIntValue;
      if (state.switchU && (left === -1 || right === -1)) {
        state.raise("Invalid character class");
      }
      if (left !== -1 && right !== -1 && left > right) {
        state.raise("Range out of order in character class");
      }
    }
  }
};
pp$1.regexp_eatClassAtom = function(state) {
  var start = state.pos;
  if (state.eat(92)) {
    if (this.regexp_eatClassEscape(state)) {
      return true;
    }
    if (state.switchU) {
      var ch$1 = state.current();
      if (ch$1 === 99 || isOctalDigit(ch$1)) {
        state.raise("Invalid class escape");
      }
      state.raise("Invalid escape");
    }
    state.pos = start;
  }
  var ch = state.current();
  if (ch !== 93) {
    state.lastIntValue = ch;
    state.advance();
    return true;
  }
  return false;
};
pp$1.regexp_eatClassEscape = function(state) {
  var start = state.pos;
  if (state.eat(98)) {
    state.lastIntValue = 8;
    return true;
  }
  if (state.switchU && state.eat(45)) {
    state.lastIntValue = 45;
    return true;
  }
  if (!state.switchU && state.eat(99)) {
    if (this.regexp_eatClassControlLetter(state)) {
      return true;
    }
    state.pos = start;
  }
  return this.regexp_eatCharacterClassEscape(state) || this.regexp_eatCharacterEscape(state);
};
pp$1.regexp_classSetExpression = function(state) {
  var result = CharSetOk, subResult;
  if (this.regexp_eatClassSetRange(state))
    ;
  else if (subResult = this.regexp_eatClassSetOperand(state)) {
    if (subResult === CharSetString) {
      result = CharSetString;
    }
    var start = state.pos;
    while (state.eatChars([38, 38])) {
      if (state.current() !== 38 && (subResult = this.regexp_eatClassSetOperand(state))) {
        if (subResult !== CharSetString) {
          result = CharSetOk;
        }
        continue;
      }
      state.raise("Invalid character in character class");
    }
    if (start !== state.pos) {
      return result;
    }
    while (state.eatChars([45, 45])) {
      if (this.regexp_eatClassSetOperand(state)) {
        continue;
      }
      state.raise("Invalid character in character class");
    }
    if (start !== state.pos) {
      return result;
    }
  } else {
    state.raise("Invalid character in character class");
  }
  for (;; ) {
    if (this.regexp_eatClassSetRange(state)) {
      continue;
    }
    subResult = this.regexp_eatClassSetOperand(state);
    if (!subResult) {
      return result;
    }
    if (subResult === CharSetString) {
      result = CharSetString;
    }
  }
};
pp$1.regexp_eatClassSetRange = function(state) {
  var start = state.pos;
  if (this.regexp_eatClassSetCharacter(state)) {
    var left = state.lastIntValue;
    if (state.eat(45) && this.regexp_eatClassSetCharacter(state)) {
      var right = state.lastIntValue;
      if (left !== -1 && right !== -1 && left > right) {
        state.raise("Range out of order in character class");
      }
      return true;
    }
    state.pos = start;
  }
  return false;
};
pp$1.regexp_eatClassSetOperand = function(state) {
  if (this.regexp_eatClassSetCharacter(state)) {
    return CharSetOk;
  }
  return this.regexp_eatClassStringDisjunction(state) || this.regexp_eatNestedClass(state);
};
pp$1.regexp_eatNestedClass = function(state) {
  var start = state.pos;
  if (state.eat(91)) {
    var negate = state.eat(94);
    var result = this.regexp_classContents(state);
    if (state.eat(93)) {
      if (negate && result === CharSetString) {
        state.raise("Negated character class may contain strings");
      }
      return result;
    }
    state.pos = start;
  }
  if (state.eat(92)) {
    var result$1 = this.regexp_eatCharacterClassEscape(state);
    if (result$1) {
      return result$1;
    }
    state.pos = start;
  }
  return null;
};
pp$1.regexp_eatClassStringDisjunction = function(state) {
  var start = state.pos;
  if (state.eatChars([92, 113])) {
    if (state.eat(123)) {
      var result = this.regexp_classStringDisjunctionContents(state);
      if (state.eat(125)) {
        return result;
      }
    } else {
      state.raise("Invalid escape");
    }
    state.pos = start;
  }
  return null;
};
pp$1.regexp_classStringDisjunctionContents = function(state) {
  var result = this.regexp_classString(state);
  while (state.eat(124)) {
    if (this.regexp_classString(state) === CharSetString) {
      result = CharSetString;
    }
  }
  return result;
};
pp$1.regexp_classString = function(state) {
  var count = 0;
  while (this.regexp_eatClassSetCharacter(state)) {
    count++;
  }
  return count === 1 ? CharSetOk : CharSetString;
};
pp$1.regexp_eatClassSetCharacter = function(state) {
  var start = state.pos;
  if (state.eat(92)) {
    if (this.regexp_eatCharacterEscape(state) || this.regexp_eatClassSetReservedPunctuator(state)) {
      return true;
    }
    if (state.eat(98)) {
      state.lastIntValue = 8;
      return true;
    }
    state.pos = start;
    return false;
  }
  var ch = state.current();
  if (ch < 0 || ch === state.lookahead() && isClassSetReservedDoublePunctuatorCharacter(ch)) {
    return false;
  }
  if (isClassSetSyntaxCharacter(ch)) {
    return false;
  }
  state.advance();
  state.lastIntValue = ch;
  return true;
};
function isClassSetReservedDoublePunctuatorCharacter(ch) {
  return ch === 33 || ch >= 35 && ch <= 38 || ch >= 42 && ch <= 44 || ch === 46 || ch >= 58 && ch <= 64 || ch === 94 || ch === 96 || ch === 126;
}
function isClassSetSyntaxCharacter(ch) {
  return ch === 40 || ch === 41 || ch === 45 || ch === 47 || ch >= 91 && ch <= 93 || ch >= 123 && ch <= 125;
}
pp$1.regexp_eatClassSetReservedPunctuator = function(state) {
  var ch = state.current();
  if (isClassSetReservedPunctuator(ch)) {
    state.lastIntValue = ch;
    state.advance();
    return true;
  }
  return false;
};
function isClassSetReservedPunctuator(ch) {
  return ch === 33 || ch === 35 || ch === 37 || ch === 38 || ch === 44 || ch === 45 || ch >= 58 && ch <= 62 || ch === 64 || ch === 96 || ch === 126;
}
pp$1.regexp_eatClassControlLetter = function(state) {
  var ch = state.current();
  if (isDecimalDigit(ch) || ch === 95) {
    state.lastIntValue = ch % 32;
    state.advance();
    return true;
  }
  return false;
};
pp$1.regexp_eatHexEscapeSequence = function(state) {
  var start = state.pos;
  if (state.eat(120)) {
    if (this.regexp_eatFixedHexDigits(state, 2)) {
      return true;
    }
    if (state.switchU) {
      state.raise("Invalid escape");
    }
    state.pos = start;
  }
  return false;
};
pp$1.regexp_eatDecimalDigits = function(state) {
  var start = state.pos;
  var ch = 0;
  state.lastIntValue = 0;
  while (isDecimalDigit(ch = state.current())) {
    state.lastIntValue = 10 * state.lastIntValue + (ch - 48);
    state.advance();
  }
  return state.pos !== start;
};
function isDecimalDigit(ch) {
  return ch >= 48 && ch <= 57;
}
pp$1.regexp_eatHexDigits = function(state) {
  var start = state.pos;
  var ch = 0;
  state.lastIntValue = 0;
  while (isHexDigit(ch = state.current())) {
    state.lastIntValue = 16 * state.lastIntValue + hexToInt(ch);
    state.advance();
  }
  return state.pos !== start;
};
function isHexDigit(ch) {
  return ch >= 48 && ch <= 57 || ch >= 65 && ch <= 70 || ch >= 97 && ch <= 102;
}
function hexToInt(ch) {
  if (ch >= 65 && ch <= 70) {
    return 10 + (ch - 65);
  }
  if (ch >= 97 && ch <= 102) {
    return 10 + (ch - 97);
  }
  return ch - 48;
}
pp$1.regexp_eatLegacyOctalEscapeSequence = function(state) {
  if (this.regexp_eatOctalDigit(state)) {
    var n1 = state.lastIntValue;
    if (this.regexp_eatOctalDigit(state)) {
      var n2 = state.lastIntValue;
      if (n1 <= 3 && this.regexp_eatOctalDigit(state)) {
        state.lastIntValue = n1 * 64 + n2 * 8 + state.lastIntValue;
      } else {
        state.lastIntValue = n1 * 8 + n2;
      }
    } else {
      state.lastIntValue = n1;
    }
    return true;
  }
  return false;
};
pp$1.regexp_eatOctalDigit = function(state) {
  var ch = state.current();
  if (isOctalDigit(ch)) {
    state.lastIntValue = ch - 48;
    state.advance();
    return true;
  }
  state.lastIntValue = 0;
  return false;
};
function isOctalDigit(ch) {
  return ch >= 48 && ch <= 55;
}
pp$1.regexp_eatFixedHexDigits = function(state, length) {
  var start = state.pos;
  state.lastIntValue = 0;
  for (var i = 0;i < length; ++i) {
    var ch = state.current();
    if (!isHexDigit(ch)) {
      state.pos = start;
      return false;
    }
    state.lastIntValue = 16 * state.lastIntValue + hexToInt(ch);
    state.advance();
  }
  return true;
};
var Token = function Token(p) {
  this.type = p.type;
  this.value = p.value;
  this.start = p.start;
  this.end = p.end;
  if (p.options.locations) {
    this.loc = new SourceLocation(p, p.startLoc, p.endLoc);
  }
  if (p.options.ranges) {
    this.range = [p.start, p.end];
  }
};
var pp = Parser.prototype;
pp.next = function(ignoreEscapeSequenceInKeyword) {
  if (!ignoreEscapeSequenceInKeyword && this.type.keyword && this.containsEsc) {
    this.raiseRecoverable(this.start, "Escape sequence in keyword " + this.type.keyword);
  }
  if (this.options.onToken) {
    this.options.onToken(new Token(this));
  }
  this.lastTokEnd = this.end;
  this.lastTokStart = this.start;
  this.lastTokEndLoc = this.endLoc;
  this.lastTokStartLoc = this.startLoc;
  this.nextToken();
};
pp.getToken = function() {
  this.next();
  return new Token(this);
};
if (typeof Symbol !== "undefined") {
  pp[Symbol.iterator] = function() {
    var this$1$1 = this;
    return {
      next: function() {
        var token = this$1$1.getToken();
        return {
          done: token.type === types$1.eof,
          value: token
        };
      }
    };
  };
}
pp.nextToken = function() {
  var curContext = this.curContext();
  if (!curContext || !curContext.preserveSpace) {
    this.skipSpace();
  }
  this.start = this.pos;
  if (this.options.locations) {
    this.startLoc = this.curPosition();
  }
  if (this.pos >= this.input.length) {
    return this.finishToken(types$1.eof);
  }
  if (curContext.override) {
    return curContext.override(this);
  } else {
    this.readToken(this.fullCharCodeAtPos());
  }
};
pp.readToken = function(code) {
  if (isIdentifierStart(code, this.options.ecmaVersion >= 6) || code === 92) {
    return this.readWord();
  }
  return this.getTokenFromCode(code);
};
pp.fullCharCodeAt = function(pos) {
  var code = this.input.charCodeAt(pos);
  if (code <= 55295 || code >= 56320) {
    return code;
  }
  var next = this.input.charCodeAt(pos + 1);
  return next <= 56319 || next >= 57344 ? code : (code << 10) + next - 56613888;
};
pp.fullCharCodeAtPos = function() {
  return this.fullCharCodeAt(this.pos);
};
pp.skipBlockComment = function() {
  var startLoc = this.options.onComment && this.curPosition();
  var start = this.pos, end = this.input.indexOf("*/", this.pos += 2);
  if (end === -1) {
    this.raise(this.pos - 2, "Unterminated comment");
  }
  this.pos = end + 2;
  if (this.options.locations) {
    for (var nextBreak = undefined, pos = start;(nextBreak = nextLineBreak(this.input, pos, this.pos)) > -1; ) {
      ++this.curLine;
      pos = this.lineStart = nextBreak;
    }
  }
  if (this.options.onComment) {
    this.options.onComment(true, this.input.slice(start + 2, end), start, this.pos, startLoc, this.curPosition());
  }
};
pp.skipLineComment = function(startSkip) {
  var start = this.pos;
  var startLoc = this.options.onComment && this.curPosition();
  var ch = this.input.charCodeAt(this.pos += startSkip);
  while (this.pos < this.input.length && !isNewLine(ch)) {
    ch = this.input.charCodeAt(++this.pos);
  }
  if (this.options.onComment) {
    this.options.onComment(false, this.input.slice(start + startSkip, this.pos), start, this.pos, startLoc, this.curPosition());
  }
};
pp.skipSpace = function() {
  loop:
    while (this.pos < this.input.length) {
      var ch = this.input.charCodeAt(this.pos);
      switch (ch) {
        case 32:
        case 160:
          ++this.pos;
          break;
        case 13:
          if (this.input.charCodeAt(this.pos + 1) === 10) {
            ++this.pos;
          }
        case 10:
        case 8232:
        case 8233:
          ++this.pos;
          if (this.options.locations) {
            ++this.curLine;
            this.lineStart = this.pos;
          }
          break;
        case 47:
          switch (this.input.charCodeAt(this.pos + 1)) {
            case 42:
              this.skipBlockComment();
              break;
            case 47:
              this.skipLineComment(2);
              break;
            default:
              break loop;
          }
          break;
        default:
          if (ch > 8 && ch < 14 || ch >= 5760 && nonASCIIwhitespace.test(String.fromCharCode(ch))) {
            ++this.pos;
          } else {
            break loop;
          }
      }
    }
};
pp.finishToken = function(type, val) {
  this.end = this.pos;
  if (this.options.locations) {
    this.endLoc = this.curPosition();
  }
  var prevType = this.type;
  this.type = type;
  this.value = val;
  this.updateContext(prevType);
};
pp.readToken_dot = function() {
  var next = this.input.charCodeAt(this.pos + 1);
  if (next >= 48 && next <= 57) {
    return this.readNumber(true);
  }
  var next2 = this.input.charCodeAt(this.pos + 2);
  if (this.options.ecmaVersion >= 6 && next === 46 && next2 === 46) {
    this.pos += 3;
    return this.finishToken(types$1.ellipsis);
  } else {
    ++this.pos;
    return this.finishToken(types$1.dot);
  }
};
pp.readToken_slash = function() {
  var next = this.input.charCodeAt(this.pos + 1);
  if (this.exprAllowed) {
    ++this.pos;
    return this.readRegexp();
  }
  if (next === 61) {
    return this.finishOp(types$1.assign, 2);
  }
  return this.finishOp(types$1.slash, 1);
};
pp.readToken_mult_modulo_exp = function(code) {
  var next = this.input.charCodeAt(this.pos + 1);
  var size = 1;
  var tokentype = code === 42 ? types$1.star : types$1.modulo;
  if (this.options.ecmaVersion >= 7 && code === 42 && next === 42) {
    ++size;
    tokentype = types$1.starstar;
    next = this.input.charCodeAt(this.pos + 2);
  }
  if (next === 61) {
    return this.finishOp(types$1.assign, size + 1);
  }
  return this.finishOp(tokentype, size);
};
pp.readToken_pipe_amp = function(code) {
  var next = this.input.charCodeAt(this.pos + 1);
  if (next === code) {
    if (this.options.ecmaVersion >= 12) {
      var next2 = this.input.charCodeAt(this.pos + 2);
      if (next2 === 61) {
        return this.finishOp(types$1.assign, 3);
      }
    }
    return this.finishOp(code === 124 ? types$1.logicalOR : types$1.logicalAND, 2);
  }
  if (next === 61) {
    return this.finishOp(types$1.assign, 2);
  }
  return this.finishOp(code === 124 ? types$1.bitwiseOR : types$1.bitwiseAND, 1);
};
pp.readToken_caret = function() {
  var next = this.input.charCodeAt(this.pos + 1);
  if (next === 61) {
    return this.finishOp(types$1.assign, 2);
  }
  return this.finishOp(types$1.bitwiseXOR, 1);
};
pp.readToken_plus_min = function(code) {
  var next = this.input.charCodeAt(this.pos + 1);
  if (next === code) {
    if (next === 45 && !this.inModule && this.input.charCodeAt(this.pos + 2) === 62 && (this.lastTokEnd === 0 || lineBreak.test(this.input.slice(this.lastTokEnd, this.pos)))) {
      this.skipLineComment(3);
      this.skipSpace();
      return this.nextToken();
    }
    return this.finishOp(types$1.incDec, 2);
  }
  if (next === 61) {
    return this.finishOp(types$1.assign, 2);
  }
  return this.finishOp(types$1.plusMin, 1);
};
pp.readToken_lt_gt = function(code) {
  var next = this.input.charCodeAt(this.pos + 1);
  var size = 1;
  if (next === code) {
    size = code === 62 && this.input.charCodeAt(this.pos + 2) === 62 ? 3 : 2;
    if (this.input.charCodeAt(this.pos + size) === 61) {
      return this.finishOp(types$1.assign, size + 1);
    }
    return this.finishOp(types$1.bitShift, size);
  }
  if (next === 33 && code === 60 && !this.inModule && this.input.charCodeAt(this.pos + 2) === 45 && this.input.charCodeAt(this.pos + 3) === 45) {
    this.skipLineComment(4);
    this.skipSpace();
    return this.nextToken();
  }
  if (next === 61) {
    size = 2;
  }
  return this.finishOp(types$1.relational, size);
};
pp.readToken_eq_excl = function(code) {
  var next = this.input.charCodeAt(this.pos + 1);
  if (next === 61) {
    return this.finishOp(types$1.equality, this.input.charCodeAt(this.pos + 2) === 61 ? 3 : 2);
  }
  if (code === 61 && next === 62 && this.options.ecmaVersion >= 6) {
    this.pos += 2;
    return this.finishToken(types$1.arrow);
  }
  return this.finishOp(code === 61 ? types$1.eq : types$1.prefix, 1);
};
pp.readToken_question = function() {
  var ecmaVersion = this.options.ecmaVersion;
  if (ecmaVersion >= 11) {
    var next = this.input.charCodeAt(this.pos + 1);
    if (next === 46) {
      var next2 = this.input.charCodeAt(this.pos + 2);
      if (next2 < 48 || next2 > 57) {
        return this.finishOp(types$1.questionDot, 2);
      }
    }
    if (next === 63) {
      if (ecmaVersion >= 12) {
        var next2$1 = this.input.charCodeAt(this.pos + 2);
        if (next2$1 === 61) {
          return this.finishOp(types$1.assign, 3);
        }
      }
      return this.finishOp(types$1.coalesce, 2);
    }
  }
  return this.finishOp(types$1.question, 1);
};
pp.readToken_numberSign = function() {
  var ecmaVersion = this.options.ecmaVersion;
  var code = 35;
  if (ecmaVersion >= 13) {
    ++this.pos;
    code = this.fullCharCodeAtPos();
    if (isIdentifierStart(code, true) || code === 92) {
      return this.finishToken(types$1.privateId, this.readWord1());
    }
  }
  this.raise(this.pos, "Unexpected character '" + codePointToString(code) + "'");
};
pp.getTokenFromCode = function(code) {
  switch (code) {
    case 46:
      return this.readToken_dot();
    case 40:
      ++this.pos;
      return this.finishToken(types$1.parenL);
    case 41:
      ++this.pos;
      return this.finishToken(types$1.parenR);
    case 59:
      ++this.pos;
      return this.finishToken(types$1.semi);
    case 44:
      ++this.pos;
      return this.finishToken(types$1.comma);
    case 91:
      ++this.pos;
      return this.finishToken(types$1.bracketL);
    case 93:
      ++this.pos;
      return this.finishToken(types$1.bracketR);
    case 123:
      ++this.pos;
      return this.finishToken(types$1.braceL);
    case 125:
      ++this.pos;
      return this.finishToken(types$1.braceR);
    case 58:
      ++this.pos;
      return this.finishToken(types$1.colon);
    case 96:
      if (this.options.ecmaVersion < 6) {
        break;
      }
      ++this.pos;
      return this.finishToken(types$1.backQuote);
    case 48:
      var next = this.input.charCodeAt(this.pos + 1);
      if (next === 120 || next === 88) {
        return this.readRadixNumber(16);
      }
      if (this.options.ecmaVersion >= 6) {
        if (next === 111 || next === 79) {
          return this.readRadixNumber(8);
        }
        if (next === 98 || next === 66) {
          return this.readRadixNumber(2);
        }
      }
    case 49:
    case 50:
    case 51:
    case 52:
    case 53:
    case 54:
    case 55:
    case 56:
    case 57:
      return this.readNumber(false);
    case 34:
    case 39:
      return this.readString(code);
    case 47:
      return this.readToken_slash();
    case 37:
    case 42:
      return this.readToken_mult_modulo_exp(code);
    case 124:
    case 38:
      return this.readToken_pipe_amp(code);
    case 94:
      return this.readToken_caret();
    case 43:
    case 45:
      return this.readToken_plus_min(code);
    case 60:
    case 62:
      return this.readToken_lt_gt(code);
    case 61:
    case 33:
      return this.readToken_eq_excl(code);
    case 63:
      return this.readToken_question();
    case 126:
      return this.finishOp(types$1.prefix, 1);
    case 35:
      return this.readToken_numberSign();
  }
  this.raise(this.pos, "Unexpected character '" + codePointToString(code) + "'");
};
pp.finishOp = function(type, size) {
  var str = this.input.slice(this.pos, this.pos + size);
  this.pos += size;
  return this.finishToken(type, str);
};
pp.readRegexp = function() {
  var escaped, inClass, start = this.pos;
  for (;; ) {
    if (this.pos >= this.input.length) {
      this.raise(start, "Unterminated regular expression");
    }
    var ch = this.input.charAt(this.pos);
    if (lineBreak.test(ch)) {
      this.raise(start, "Unterminated regular expression");
    }
    if (!escaped) {
      if (ch === "[") {
        inClass = true;
      } else if (ch === "]" && inClass) {
        inClass = false;
      } else if (ch === "/" && !inClass) {
        break;
      }
      escaped = ch === "\\";
    } else {
      escaped = false;
    }
    ++this.pos;
  }
  var pattern = this.input.slice(start, this.pos);
  ++this.pos;
  var flagsStart = this.pos;
  var flags = this.readWord1();
  if (this.containsEsc) {
    this.unexpected(flagsStart);
  }
  var state = this.regexpState || (this.regexpState = new RegExpValidationState(this));
  state.reset(start, pattern, flags);
  this.validateRegExpFlags(state);
  this.validateRegExpPattern(state);
  var value = null;
  try {
    value = new RegExp(pattern, flags);
  } catch (e) {}
  return this.finishToken(types$1.regexp, { pattern, flags, value });
};
pp.readInt = function(radix, len, maybeLegacyOctalNumericLiteral) {
  var allowSeparators = this.options.ecmaVersion >= 12 && len === undefined;
  var isLegacyOctalNumericLiteral = maybeLegacyOctalNumericLiteral && this.input.charCodeAt(this.pos) === 48;
  var start = this.pos, total = 0, lastCode = 0;
  for (var i = 0, e = len == null ? Infinity : len;i < e; ++i, ++this.pos) {
    var code = this.input.charCodeAt(this.pos), val = undefined;
    if (allowSeparators && code === 95) {
      if (isLegacyOctalNumericLiteral) {
        this.raiseRecoverable(this.pos, "Numeric separator is not allowed in legacy octal numeric literals");
      }
      if (lastCode === 95) {
        this.raiseRecoverable(this.pos, "Numeric separator must be exactly one underscore");
      }
      if (i === 0) {
        this.raiseRecoverable(this.pos, "Numeric separator is not allowed at the first of digits");
      }
      lastCode = code;
      continue;
    }
    if (code >= 97) {
      val = code - 97 + 10;
    } else if (code >= 65) {
      val = code - 65 + 10;
    } else if (code >= 48 && code <= 57) {
      val = code - 48;
    } else {
      val = Infinity;
    }
    if (val >= radix) {
      break;
    }
    lastCode = code;
    total = total * radix + val;
  }
  if (allowSeparators && lastCode === 95) {
    this.raiseRecoverable(this.pos - 1, "Numeric separator is not allowed at the last of digits");
  }
  if (this.pos === start || len != null && this.pos - start !== len) {
    return null;
  }
  return total;
};
function stringToNumber(str, isLegacyOctalNumericLiteral) {
  if (isLegacyOctalNumericLiteral) {
    return parseInt(str, 8);
  }
  return parseFloat(str.replace(/_/g, ""));
}
function stringToBigInt(str) {
  if (typeof BigInt !== "function") {
    return null;
  }
  return BigInt(str.replace(/_/g, ""));
}
pp.readRadixNumber = function(radix) {
  var start = this.pos;
  this.pos += 2;
  var val = this.readInt(radix);
  if (val == null) {
    this.raise(this.start + 2, "Expected number in radix " + radix);
  }
  if (this.options.ecmaVersion >= 11 && this.input.charCodeAt(this.pos) === 110) {
    val = stringToBigInt(this.input.slice(start, this.pos));
    ++this.pos;
  } else if (isIdentifierStart(this.fullCharCodeAtPos())) {
    this.raise(this.pos, "Identifier directly after number");
  }
  return this.finishToken(types$1.num, val);
};
pp.readNumber = function(startsWithDot) {
  var start = this.pos;
  if (!startsWithDot && this.readInt(10, undefined, true) === null) {
    this.raise(start, "Invalid number");
  }
  var octal = this.pos - start >= 2 && this.input.charCodeAt(start) === 48;
  if (octal && this.strict) {
    this.raise(start, "Invalid number");
  }
  var next = this.input.charCodeAt(this.pos);
  if (!octal && !startsWithDot && this.options.ecmaVersion >= 11 && next === 110) {
    var val$1 = stringToBigInt(this.input.slice(start, this.pos));
    ++this.pos;
    if (isIdentifierStart(this.fullCharCodeAtPos())) {
      this.raise(this.pos, "Identifier directly after number");
    }
    return this.finishToken(types$1.num, val$1);
  }
  if (octal && /[89]/.test(this.input.slice(start, this.pos))) {
    octal = false;
  }
  if (next === 46 && !octal) {
    ++this.pos;
    this.readInt(10);
    next = this.input.charCodeAt(this.pos);
  }
  if ((next === 69 || next === 101) && !octal) {
    next = this.input.charCodeAt(++this.pos);
    if (next === 43 || next === 45) {
      ++this.pos;
    }
    if (this.readInt(10) === null) {
      this.raise(start, "Invalid number");
    }
  }
  if (isIdentifierStart(this.fullCharCodeAtPos())) {
    this.raise(this.pos, "Identifier directly after number");
  }
  var val = stringToNumber(this.input.slice(start, this.pos), octal);
  return this.finishToken(types$1.num, val);
};
pp.readCodePoint = function() {
  var ch = this.input.charCodeAt(this.pos), code;
  if (ch === 123) {
    if (this.options.ecmaVersion < 6) {
      this.unexpected();
    }
    var codePos = ++this.pos;
    code = this.readHexChar(this.input.indexOf("}", this.pos) - this.pos);
    ++this.pos;
    if (code > 1114111) {
      this.invalidStringToken(codePos, "Code point out of bounds");
    }
  } else {
    code = this.readHexChar(4);
  }
  return code;
};
pp.readString = function(quote) {
  var out = "", chunkStart = ++this.pos;
  for (;; ) {
    if (this.pos >= this.input.length) {
      this.raise(this.start, "Unterminated string constant");
    }
    var ch = this.input.charCodeAt(this.pos);
    if (ch === quote) {
      break;
    }
    if (ch === 92) {
      out += this.input.slice(chunkStart, this.pos);
      out += this.readEscapedChar(false);
      chunkStart = this.pos;
    } else if (ch === 8232 || ch === 8233) {
      if (this.options.ecmaVersion < 10) {
        this.raise(this.start, "Unterminated string constant");
      }
      ++this.pos;
      if (this.options.locations) {
        this.curLine++;
        this.lineStart = this.pos;
      }
    } else {
      if (isNewLine(ch)) {
        this.raise(this.start, "Unterminated string constant");
      }
      ++this.pos;
    }
  }
  out += this.input.slice(chunkStart, this.pos++);
  return this.finishToken(types$1.string, out);
};
var INVALID_TEMPLATE_ESCAPE_ERROR = {};
pp.tryReadTemplateToken = function() {
  this.inTemplateElement = true;
  try {
    this.readTmplToken();
  } catch (err) {
    if (err === INVALID_TEMPLATE_ESCAPE_ERROR) {
      this.readInvalidTemplateToken();
    } else {
      throw err;
    }
  }
  this.inTemplateElement = false;
};
pp.invalidStringToken = function(position, message) {
  if (this.inTemplateElement && this.options.ecmaVersion >= 9) {
    throw INVALID_TEMPLATE_ESCAPE_ERROR;
  } else {
    this.raise(position, message);
  }
};
pp.readTmplToken = function() {
  var out = "", chunkStart = this.pos;
  for (;; ) {
    if (this.pos >= this.input.length) {
      this.raise(this.start, "Unterminated template");
    }
    var ch = this.input.charCodeAt(this.pos);
    if (ch === 96 || ch === 36 && this.input.charCodeAt(this.pos + 1) === 123) {
      if (this.pos === this.start && (this.type === types$1.template || this.type === types$1.invalidTemplate)) {
        if (ch === 36) {
          this.pos += 2;
          return this.finishToken(types$1.dollarBraceL);
        } else {
          ++this.pos;
          return this.finishToken(types$1.backQuote);
        }
      }
      out += this.input.slice(chunkStart, this.pos);
      return this.finishToken(types$1.template, out);
    }
    if (ch === 92) {
      out += this.input.slice(chunkStart, this.pos);
      out += this.readEscapedChar(true);
      chunkStart = this.pos;
    } else if (isNewLine(ch)) {
      out += this.input.slice(chunkStart, this.pos);
      ++this.pos;
      switch (ch) {
        case 13:
          if (this.input.charCodeAt(this.pos) === 10) {
            ++this.pos;
          }
        case 10:
          out += `
`;
          break;
        default:
          out += String.fromCharCode(ch);
          break;
      }
      if (this.options.locations) {
        ++this.curLine;
        this.lineStart = this.pos;
      }
      chunkStart = this.pos;
    } else {
      ++this.pos;
    }
  }
};
pp.readInvalidTemplateToken = function() {
  for (;this.pos < this.input.length; this.pos++) {
    switch (this.input[this.pos]) {
      case "\\":
        ++this.pos;
        break;
      case "$":
        if (this.input[this.pos + 1] !== "{") {
          break;
        }
      case "`":
        return this.finishToken(types$1.invalidTemplate, this.input.slice(this.start, this.pos));
      case "\r":
        if (this.input[this.pos + 1] === `
`) {
          ++this.pos;
        }
      case `
`:
      case "\u2028":
      case "\u2029":
        ++this.curLine;
        this.lineStart = this.pos + 1;
        break;
    }
  }
  this.raise(this.start, "Unterminated template");
};
pp.readEscapedChar = function(inTemplate) {
  var ch = this.input.charCodeAt(++this.pos);
  ++this.pos;
  switch (ch) {
    case 110:
      return `
`;
    case 114:
      return "\r";
    case 120:
      return String.fromCharCode(this.readHexChar(2));
    case 117:
      return codePointToString(this.readCodePoint());
    case 116:
      return "\t";
    case 98:
      return "\b";
    case 118:
      return "\v";
    case 102:
      return "\f";
    case 13:
      if (this.input.charCodeAt(this.pos) === 10) {
        ++this.pos;
      }
    case 10:
      if (this.options.locations) {
        this.lineStart = this.pos;
        ++this.curLine;
      }
      return "";
    case 56:
    case 57:
      if (this.strict) {
        this.invalidStringToken(this.pos - 1, "Invalid escape sequence");
      }
      if (inTemplate) {
        var codePos = this.pos - 1;
        this.invalidStringToken(codePos, "Invalid escape sequence in template string");
      }
    default:
      if (ch >= 48 && ch <= 55) {
        var octalStr = this.input.substr(this.pos - 1, 3).match(/^[0-7]+/)[0];
        var octal = parseInt(octalStr, 8);
        if (octal > 255) {
          octalStr = octalStr.slice(0, -1);
          octal = parseInt(octalStr, 8);
        }
        this.pos += octalStr.length - 1;
        ch = this.input.charCodeAt(this.pos);
        if ((octalStr !== "0" || ch === 56 || ch === 57) && (this.strict || inTemplate)) {
          this.invalidStringToken(this.pos - 1 - octalStr.length, inTemplate ? "Octal literal in template string" : "Octal literal in strict mode");
        }
        return String.fromCharCode(octal);
      }
      if (isNewLine(ch)) {
        if (this.options.locations) {
          this.lineStart = this.pos;
          ++this.curLine;
        }
        return "";
      }
      return String.fromCharCode(ch);
  }
};
pp.readHexChar = function(len) {
  var codePos = this.pos;
  var n = this.readInt(16, len);
  if (n === null) {
    this.invalidStringToken(codePos, "Bad character escape sequence");
  }
  return n;
};
pp.readWord1 = function() {
  this.containsEsc = false;
  var word = "", first = true, chunkStart = this.pos;
  var astral = this.options.ecmaVersion >= 6;
  while (this.pos < this.input.length) {
    var ch = this.fullCharCodeAtPos();
    if (isIdentifierChar(ch, astral)) {
      this.pos += ch <= 65535 ? 1 : 2;
    } else if (ch === 92) {
      this.containsEsc = true;
      word += this.input.slice(chunkStart, this.pos);
      var escStart = this.pos;
      if (this.input.charCodeAt(++this.pos) !== 117) {
        this.invalidStringToken(this.pos, "Expecting Unicode escape sequence \\uXXXX");
      }
      ++this.pos;
      var esc = this.readCodePoint();
      if (!(first ? isIdentifierStart : isIdentifierChar)(esc, astral)) {
        this.invalidStringToken(escStart, "Invalid Unicode escape");
      }
      word += codePointToString(esc);
      chunkStart = this.pos;
    } else {
      break;
    }
    first = false;
  }
  return word + this.input.slice(chunkStart, this.pos);
};
pp.readWord = function() {
  var word = this.readWord1();
  var type = types$1.name;
  if (this.keywords.test(word)) {
    type = keywords[word];
  }
  return this.finishToken(type, word);
};
var version = "8.16.0";
Parser.acorn = {
  Parser,
  version,
  defaultOptions,
  Position,
  SourceLocation,
  getLineInfo,
  Node,
  TokenType,
  tokTypes: types$1,
  keywordTypes: keywords,
  TokContext,
  tokContexts: types,
  isIdentifierChar,
  isIdentifierStart,
  Token,
  isNewLine,
  lineBreak,
  lineBreakG,
  nonASCIIwhitespace
};
function parse(input, options) {
  return Parser.parse(input, options);
}
function parseExpressionAt(input, pos, options) {
  return Parser.parseExpressionAt(input, pos, options);
}

// node_modules/tjs-lang/src/lang/types.ts
class TranspileError extends Error {
  line;
  column;
  source;
  filename;
  constructor(message, location, source, filename) {
    const loc = `${filename || "<source>"}:${location.line}:${location.column}`;
    super(`${message} at ${loc}`);
    this.name = "TranspileError";
    this.line = location.line;
    this.column = location.column;
    this.source = source;
    this.filename = filename;
  }
}

class SyntaxError2 extends TranspileError {
  constructor(message, location, source, filename) {
    super(message, location, source, filename);
    this.name = "SyntaxError";
  }
  formatWithContext(contextLines = 2) {
    if (!this.source)
      return this.message;
    const lines = this.source.split(`
`);
    const errorLine = this.line - 1;
    const startLine = Math.max(0, errorLine - contextLines);
    const endLine = Math.min(lines.length - 1, errorLine + contextLines);
    const output = [];
    const lineNumWidth = String(endLine + 1).length;
    for (let i = startLine;i <= endLine; i++) {
      const lineNum = String(i + 1).padStart(lineNumWidth);
      const marker = i === errorLine ? ">" : " ";
      output.push(`${marker} ${lineNum} | ${lines[i]}`);
      if (i === errorLine) {
        const caretPadding = " ".repeat(lineNumWidth + 4 + this.column);
        output.push(`${caretPadding}^ ${this.message.split(" at ")[0]}`);
      }
    }
    return output.join(`
`);
  }
}
function createChildContext(parent) {
  return {
    depth: parent.depth + 1,
    locals: new Map,
    parent,
    parameters: parent.parameters,
    atoms: parent.atoms,
    warnings: parent.warnings,
    source: parent.source,
    filename: parent.filename,
    options: parent.options,
    helpers: parent.helpers,
    helperSteps: parent.helperSteps,
    helperTransforming: parent.helperTransforming,
    regexCompiler: parent.regexCompiler,
    helperReturnTypes: parent.helperReturnTypes,
    returnCheck: parent.returnCheck
  };
}
function lookupVariable(name, ctx) {
  if (ctx.locals.has(name)) {
    return ctx.locals.get(name);
  }
  if (ctx.parameters.has(name)) {
    return ctx.parameters.get(name)?.type;
  }
  if (ctx.parent) {
    return lookupVariable(name, ctx.parent);
  }
  return;
}
function getLocation(node) {
  if (node.loc) {
    return { line: node.loc.start.line, column: node.loc.start.column };
  }
  return { line: 1, column: 0 };
}

// node_modules/tjs-lang/src/lang/type-or.ts
function orInType(node) {
  const n = node;
  if (!n)
    return;
  switch (n.type) {
    case "LogicalExpression":
      return n.operator === "||" ? n : undefined;
    case "BinaryExpression":
      return n.operator === "|" ? orInType(n.left) ?? orInType(n.right) : undefined;
    case "ObjectExpression":
      for (const p of n.properties)
        if (p.type === "Property") {
          const hit = orInType(p.value);
          if (hit)
            return hit;
        }
      return;
    case "ArrayExpression":
      for (const e of n.elements) {
        const hit = orInType(e);
        if (hit)
          return hit;
      }
      return;
    case "ParenthesizedExpression":
      return orInType(n.expression);
  }
  return;
}
function orInTypeMessage(text) {
  const fixed = text.replace(/\s*\|\|\s*/g, " | ");
  return `\`||\` is not a union in a type: \`${text}\` reads as JavaScript OR, so its type is ` + `only the left side. Write \`${fixed}\` (one bar).`;
}
function typeText(node) {
  const n = node;
  if (!n)
    return "";
  switch (n.type) {
    case "Literal":
      return n.raw ?? JSON.stringify(n.value);
    case "Identifier":
      return n.name;
    case "LogicalExpression":
    case "BinaryExpression":
      return `${typeText(n.left)} ${n.operator} ${typeText(n.right)}`;
    case "UnaryExpression":
      return `${n.operator}${typeText(n.argument)}`;
    case "ParenthesizedExpression":
      return `(${typeText(n.expression)})`;
    case "ArrayExpression":
      return `[${n.elements.map((e) => typeText(e)).join(", ")}]`;
    case "ObjectExpression":
      return `{ ${n.properties.map((p) => p.type === "Property" ? `${p.key.type === "Identifier" ? p.key.name : typeText(p.key)}: ${typeText(p.value)}` : "…").join(", ")} }`;
  }
  return "…";
}

// node_modules/tjs-lang/src/lang/inference.ts
var TS_TYPE_NAMES = {
  string: { kind: "string" },
  number: { kind: "number" },
  int: { kind: "integer" },
  unsigned: { kind: "non-negative-integer" },
  uint: { kind: "non-negative-integer" },
  float: { kind: "number" },
  boolean: { kind: "boolean" },
  bigint: { kind: "bigint" },
  object: { kind: "object" },
  any: { kind: "any" },
  unknown: { kind: "any" },
  void: { kind: "any" },
  never: { kind: "any" },
  null: { kind: "null" },
  undefined: { kind: "undefined" }
};
function typeNameExample(name) {
  switch (name.trim()) {
    case "number":
    case "float":
      return "0.0";
    case "int":
      return "0";
    case "unsigned":
    case "uint":
      return "+0";
    case "string":
      return "''";
    case "boolean":
      return "false";
    case "bigint":
      return "0n";
    default:
      return null;
  }
}
function typeForName(name) {
  return Object.hasOwn(TS_TYPE_NAMES, name) ? TS_TYPE_NAMES[name] : undefined;
}
function typeArgumentSource(name) {
  const d = TS_TYPE_NAMES[name.trim()];
  if (!d)
    return null;
  switch (d.kind) {
    case "string":
    case "number":
    case "boolean":
    case "bigint":
      return `((v) => typeof v === '${d.kind}')`;
    case "integer":
      return `(Number.isInteger)`;
    case "non-negative-integer":
      return `((v) => typeof v === 'number' && Number.isInteger(v) && v >= 0)`;
    case "object":
      return `((v) => v !== null && typeof v === 'object' && !Array.isArray(v))`;
    case "null":
      return `((v) => v === null)`;
    case "undefined":
      return `((v) => v === undefined)`;
    case "any":
      return `(() => true)`;
    default:
      return null;
  }
}
function isTypeNameAnnotation(text) {
  const t = text.trim();
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(t))
    return false;
  if (t === "undefined" || t === "NaN" || t === "Infinity")
    return false;
  return true;
}
function literalUnionValues(node) {
  const out = [];
  const walk = (n) => {
    if (!n)
      return false;
    if (n.type === "BinaryExpression" && n.operator === "|") {
      return walk(n.left) && walk(n.right);
    }
    if (n.type === "Literal") {
      out.push(n.value === undefined ? null : n.value);
      return true;
    }
    if (n.type === "UnaryExpression" && (n.operator === "+" || n.operator === "-") && n.argument?.type === "Literal" && typeof n.argument.value === "number") {
      out.push(n.operator === "-" ? -n.argument.value : n.argument.value);
      return true;
    }
    if (n.type === "Identifier" && n.name === "undefined") {
      out.push(null);
      return true;
    }
    return false;
  };
  if (!walk(node))
    return null;
  if (!out.length)
    return null;
  const kinds = new Set(out.map((v) => typeof v));
  if (kinds.size !== 1)
    return null;
  return [...new Set(out)];
}
function inferTypeFromValue(node) {
  if (node.type === "CallExpression" && node.callee?.type === "Identifier" && node.callee.name === "LegacyDefault" && node.arguments?.length === 1) {
    return inferTypeFromValue(node.arguments[0]);
  }
  if (node.type === "CallExpression" && node.callee?.type === "Identifier" && node.callee.name === "Exactly") {
    const args = node.arguments ?? [];
    const values = [];
    for (const a of args) {
      const v = literalUnionValues(a);
      if (!v)
        return { kind: "any", unresolved: "Exactly" };
      values.push(...v);
    }
    if (values.length === 0)
      return { kind: "any", unresolved: "Exactly" };
    return { kind: "literal-union", values };
  }
  switch (node.type) {
    case "Literal": {
      const value = node.value;
      if (value === null) {
        return { kind: "null" };
      }
      if (typeof value === "string") {
        return { kind: "string" };
      }
      if (typeof value === "number") {
        const raw = node.raw;
        if (raw && raw.includes(".")) {
          return { kind: "number" };
        }
        return { kind: "integer" };
      }
      if (typeof value === "bigint") {
        return { kind: "bigint" };
      }
      if (typeof value === "boolean") {
        return { kind: "boolean" };
      }
      return { kind: "any" };
    }
    case "ArrayExpression": {
      const elements = node.elements;
      if (elements.length === 0) {
        return { kind: "array", items: { kind: "any" } };
      }
      const itemTypes = elements.filter((el) => el != null).map((el) => inferTypeFromValue(el));
      if (itemTypes.length === 0) {
        return { kind: "array", items: { kind: "any" } };
      }
      const seen = new Map;
      for (const t of itemTypes) {
        const key = JSON.stringify(t);
        if (!seen.has(key))
          seen.set(key, t);
      }
      const unique = [...seen.values()];
      const items = unique.length === 1 ? unique[0] : { kind: "union", members: unique };
      return { kind: "array", items };
    }
    case "ObjectExpression": {
      const properties = node.properties;
      const shape = {};
      for (const prop of properties) {
        if (prop.type !== "Property")
          continue;
        if (prop.computed && prop.key.type !== "Literal")
          return { kind: "object" };
        const key = literalPropertyKey(prop);
        if (key !== undefined)
          shape[key] = inferTypeFromValue(prop.value);
      }
      return { kind: "object", shape };
    }
    case "LogicalExpression": {
      const { operator, left, right } = node;
      if (operator === "||") {
        return inferTypeFromValue(left);
      }
      if (operator === "&&") {
        const rightType = inferTypeFromValue(right);
        return rightType;
      }
      if (operator === "??") {
        const rightType = inferTypeFromValue(right);
        return rightType;
      }
      return { kind: "any" };
    }
    case "BinaryExpression": {
      const { operator, left, right } = node;
      if (operator === "|") {
        const leftType = inferTypeFromValue(left);
        const rightType = inferTypeFromValue(right);
        if (rightType.kind === "null") {
          return { ...leftType, nullable: true };
        }
        if (leftType.kind === "null") {
          return { ...rightType, nullable: true };
        }
        const values = literalUnionValues(node);
        if (values)
          return { kind: "literal-union", values };
        return groupedUnion(node);
      }
      return { kind: "any" };
    }
    case "Identifier": {
      if (node.name === "undefined") {
        return { kind: "undefined" };
      }
      const tsType = TS_TYPE_NAMES[node.name];
      if (tsType)
        return { ...tsType };
      return { kind: "any", unresolved: node.name };
    }
    case "TSArrayType": {
      const el = node.elementType;
      return {
        kind: "array",
        items: el ? inferTypeFromValue(el) : { kind: "any" }
      };
    }
    case "ArrowFunctionExpression":
    case "FunctionExpression": {
      const fn = node;
      const params = fn.params.map((p) => paramShape(p));
      let returns = { kind: "any" };
      if (fn.type === "ArrowFunctionExpression" && fn.body && fn.body.type !== "BlockStatement") {
        returns = inferTypeFromValue(fn.body);
      }
      return { kind: "function", params, returns };
    }
    case "UnaryExpression": {
      const op = node.operator;
      const arg = node.argument;
      if (op === "+" && arg.type === "Literal") {
        const value = arg.value;
        if (typeof value === "number") {
          refuseNonNegativeDecimal(arg.raw, node.loc?.start);
          return { kind: "non-negative-integer" };
        }
      }
      if (op === "-" && arg.type === "Literal") {
        const value = arg.value;
        if (typeof value === "number") {
          const raw = arg.raw;
          if (raw && raw.includes(".")) {
            return { kind: "number" };
          }
          return { kind: "integer" };
        }
      }
      return { kind: "any" };
    }
    case "CallExpression":
    case "MemberExpression":
      return { kind: "any", unexamined: expressionLabel(node) };
    default:
      return { kind: "any" };
  }
}
function expressionLabel(node) {
  if (node?.type === "Identifier")
    return node.name;
  if (node?.type === "ThisExpression")
    return "this";
  if (node?.type === "MemberExpression")
    return node.computed ? `${expressionLabel(node.object)}[…]` : `${expressionLabel(node.object)}.${node.property?.name ?? "…"}`;
  if (node?.type === "CallExpression")
    return `${expressionLabel(node.callee)}(…)`;
  return "…";
}
function paramShape(p) {
  if (p.type === "Identifier") {
    return { name: p.name, type: { kind: "any" } };
  }
  if (p.type === "AssignmentPattern" && p.left?.type === "Identifier") {
    return { name: p.left.name, type: inferTypeFromValue(p.right) };
  }
  if (p.type === "RestElement" && p.argument?.type === "Identifier") {
    return {
      name: `...${p.argument.name}`,
      type: { kind: "array", items: { kind: "any" } }
    };
  }
  return { name: "?", type: { kind: "any" } };
}
function parseParameter(param, requiredParams) {
  if (param.type === "Identifier") {
    return {
      name: param.name,
      type: { kind: "any" },
      required: true
    };
  }
  if (param.type === "AssignmentPattern") {
    const { left, right } = param;
    if (left.type !== "Identifier") {
      throw new TranspileError("Only simple parameter names are supported", getLocation(param));
    }
    const name = left.name;
    const isRequired = requiredParams?.has(name) ?? false;
    const type = inferTypeFromValue(right);
    const exampleValue = extractLiteralValue(right);
    return {
      name,
      type,
      required: isRequired,
      default: isRequired ? null : exampleValue,
      example: exampleValue,
      loc: { start: param.start, end: param.end }
    };
  }
  if (param.type === "ObjectPattern") {
    const properties = param.properties;
    const shape = {};
    const destructuredParams = {};
    for (const prop of properties) {
      if (prop.type === "Property") {
        if (!prop.shorthand)
          continue;
        const key = prop.key.type === "Identifier" ? prop.key.name : String(prop.key.value);
        if (prop.value.type === "Identifier") {
          shape[key] = { kind: "any" };
          destructuredParams[key] = {
            name: key,
            type: { kind: "any" },
            required: true
          };
        } else if (prop.value.type === "AssignmentPattern") {
          const innerParam = parseParameter(prop.value, requiredParams);
          const isRequired = requiredParams?.has(key) ?? false;
          shape[key] = innerParam.type;
          destructuredParams[key] = {
            name: key,
            type: innerParam.type,
            required: isRequired,
            default: isRequired ? null : innerParam.example,
            example: innerParam.example
          };
        }
      }
    }
    return {
      name: "__destructured__",
      type: { kind: "object", shape, destructuredParams },
      required: true
    };
  }
  throw new TranspileError(`Unsupported parameter pattern: ${param.type}`, getLocation(param));
}
function literalPropertyKey(prop) {
  if (prop?.type !== "Property")
    return;
  const key = prop.key.type === "Identifier" && !prop.computed ? prop.key.name : prop.key.type === "Literal" ? String(prop.key.value) : undefined;
  return key === "__proto__" ? undefined : key;
}
function extractLiteralValue(node) {
  switch (node.type) {
    case "Literal":
      return node.value;
    case "ArrayExpression":
      return node.elements.map((el) => el ? extractLiteralValue(el) : null);
    case "ObjectExpression": {
      const result = {};
      for (const prop of node.properties) {
        const key = literalPropertyKey(prop);
        if (key !== undefined)
          result[key] = extractLiteralValue(prop.value);
      }
      return result;
    }
    case "UnaryExpression":
      if (node.operator === "-") {
        const arg = extractLiteralValue(node.argument);
        return typeof arg === "number" ? -arg : undefined;
      }
      if (node.operator === "+") {
        const arg = extractLiteralValue(node.argument);
        return typeof arg === "number" ? +arg : undefined;
      }
      return;
    case "BinaryExpression": {
      const { operator, left } = node;
      if (operator === "|") {
        return extractLiteralValue(left);
      }
      return;
    }
    case "LogicalExpression": {
      const { operator, left, right } = node;
      if (operator === "&&") {
        if (left.type === "Literal" && left.value === null) {
          return null;
        }
      }
      if (operator === "||") {
        const leftVal = extractLiteralValue(left);
        return leftVal ?? extractLiteralValue(right);
      }
      if (operator === "??") {
        const leftVal = extractLiteralValue(left);
        return leftVal ?? extractLiteralValue(right);
      }
      return;
    }
    default:
      return;
  }
}
function unionsFromLogical(node) {
  if (!node || typeof node !== "object")
    return node;
  if (Array.isArray(node))
    return node.map(unionsFromLogical);
  const out = {};
  for (const [k, v] of Object.entries(node))
    out[k] = v && typeof v === "object" ? unionsFromLogical(v) : v;
  if (out.type === "LogicalExpression" && out.operator === "||") {
    out.type = "BinaryExpression";
    out.operator = "|";
  }
  return out;
}
function parseReturnType(typeExpr) {
  try {
    const ast = parseExpressionAt(typeExpr, 0, {
      ecmaVersion: 2022
    });
    return inferTypeFromValue(unionsFromLogical(ast));
  } catch {
    return { kind: "any" };
  }
}
function refuseNonNegativeDecimal(raw, loc) {
  if (raw && /[.eE]/.test(raw) && !/^0x/i.test(raw))
    throw new SyntaxError2(`+${raw}: a leading + marks a non-negative INTEGER, and ${raw} is not one. ` + `Write ${raw} for any number, or +${Math.round(Number(raw))} for a non-negative integer.`, loc ?? { line: 1, column: 0 });
}
function groupedUnion(node) {
  const flat = [];
  const walk = (n) => {
    if (n.type === "BinaryExpression" && n.operator === "|") {
      walk(n.left);
      walk(n.right);
    } else
      flat.push(n);
  };
  walk(node);
  let nullable = false;
  const members = [];
  for (const n of flat) {
    if (n.type === "Literal" && n.value === null) {
      nullable = true;
      continue;
    }
    members.push(inferTypeFromValue(n));
  }
  const result = members.length === 1 ? members[0] : { kind: "union", members };
  return nullable ? { ...result, nullable: true } : result;
}

// node_modules/tjs-lang/src/vm/regex-folds.ts
var FOLDS_I = "1t,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;2j,kn,w;b,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;2,w;1,w;1,w;1,w;1,w;1,w;1,w;x,3d;1,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;4,1;2,1;2,1;3,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;3,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;3,1;2,1;2,1;3,5f;1,5u;1,1;2,1;2,5q;1,1;2,5p;1,5p;1,1;3,27;1,5m;1,5n;1,1;2,5p;1,5r;1,2p;1,5v;1,5t;1,1;2,4j;2,5v;1,5x;1,3m;1,5y;1,1;2,1;2,1;2,62;1,1;2,62;3,1;2,62;1,1;2,61;1,61;1,1;2,1;2,63;1,1;4,1;3,1k;5,1,1;3,1,1;3,1,1;3,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;3,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;3,1,1;3,1;4,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;4,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;8,8bv;1,1;3,8bs;1,8cf;1,8cf;1,1;3,1x;1,1z;1,1;2,1;2,1;2,1;2,1;2,8bj;1,8bg;1,8bi;a,wnj;5,wnf;4,wmg;1,wn8;4,wn8;1,8af;1,wn5;5,8al;c,89z;5,wn7;5,wmi;m,wlx;1,wlu;4n,2c,w,5j9;17,1;2,1;4,1;5,3m;1,3m;1,3m;2,38;7,12;2,11;1,11;1,11;2,1s;2,1r;1,1r;2,w;1,w,u;1,w;1,w;1,w,1s;1,w;1,w;1,w,p;2,w,1i;1,w;2,w;1,w;1,w;1,w,m;1,w,1c;2,v,1;1,w;1,w;1,w,f;1,w;1,w;1,w;1,w;1,w;10,8;9,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;4,7;5,1;3,1;6,28;1,28;1,28;1,28;1,28;1,28;1,28;1,28;1,28;1,28;1,28;1,28;1,28;1,28;1,28;1,28;1,w;1,w;1,w,4su;1,w;1,w,4st;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w,4sk;1,w;1,w;1,w,4si;1,w,4si,1;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w,4sc;1,w;1,w;1,w;1,w;1,w;1d,1;2,1,4ro;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;a,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,f;1,1;2,1;2,1;2,1;2,1;2,1;2,1;3,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;3,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;28a,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;2,5ls;6,5ls;3,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;3,2bk;1,2bk;1,2bk;ip,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,8;1,8;1,8;1,8;1,8;1,8;1oz,r7m,1;6p,r9g;4,2xy;h,raw;36,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1,1m;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;c,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,8;1,8;1,8;1,8;1,8;1,8;1,8;1,8;9,8;1,8;1,8;1,8;1,8;1,8;b,8;1,8;1,8;1,8;1,8;1,8;1,8;1,8;9,8;1,8;1,8;1,8;1,8;1,8;1,8;1,8;9,8;1,8;1,8;1,8;1,8;1,8;c,8;2,8;2,8;2,8;9,8;1,8;1,8;1,8;1,8;1,8;1,8;1,8;9,22;1,22;1,2e;1,2e;1,2e;1,2e;1,2s;1,2s;1,3k;1,3k;1,34;1,34;1,3i;1,3i;1f,8;1,8;v,8;1,8;f,8;1,8;4,7;99,s;1a,g;1,g;1,g;1,g;1,g;1,g;1,g;1,g;1,g;1,g;1,g;1,g;1,g;1,g;1,g;1,g;k,1;mr,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1f5,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1d,1;7,1;2,1;2,1;7,1;3,1;b,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;9,1;2,1;5,1;nym,1;2,1;2,1;2,1;2,1;4,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;k,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;3s,1;2,1;2,1;2,1;2,1;2,1;2,1;4,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;b,1;2,1;3,1;2,1;2,1;2,1;2,1;5,1;5,1;2,1;2,1c;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;b,ps;1,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;5,1;2,1;7,1;6,1;2,1;t,1;h7w,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w";
var FOLDS_IU = "1t,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w,6gv;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w,7g;1,w;1,w;1,w;1,w;1,w;1,w;1,w;2j,kn,w;b,w;1,w;1,w;1,w;1,w;1,w,6di;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;2,w;1,w;1,w;1,w;1,w;1,w;1,w;1,5vj;w,3d;1,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;4,1;2,1;2,1;3,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;3,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;3,1;2,1;2,1;3,5f;1,5u;1,1;2,1;2,5q;1,1;2,5p;1,5p;1,1;3,27;1,5m;1,5n;1,1;2,5p;1,5r;1,2p;1,5v;1,5t;1,1;2,4j;1,wu9;1,5v;1,5x;1,3m;1,5y;1,1;2,1;2,1;2,62;1,1;2,62;3,1;2,62;1,1;2,61;1,61;1,1;2,1;2,63;1,1;4,1;3,1k;5,1,1;3,1,1;3,1,1;3,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;3,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;3,1,1;3,1;4,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;4,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;8,8bv;1,1;3,8bs;1,8cf;1,8cf;1,1;3,1x;1,1z;1,1;2,1;2,1;2,1;2,1;2,8bj;1,8bg;1,8bi;a,wnj;5,wnf;3,wo7;1,wmg;1,wn8;4,wn8;1,8af;1,wn5;5,8al;c,89z;5,wn7;5,wmi;m,wlx;1,wlu;4n,2c,w,5j9;17,1;2,1;4,1;5,3m;1,3m;1,3m;2,38;7,12;2,11;1,11;1,11;2,1s;2,1r;1,1r;1,5kz;1,w;1,w,u;1,w;1,w;1,w,1s;1,w;1,w;1,w,p,z;2,w,1i;1,w;2,w;1,w;1,w;1,w,m;1,w,1c;2,v,1;1,w;1,w;1,w,f;1,w;1,w;1,w,5st;1,w;1,w;5,5kj;v,8;9,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;4,7;5,1;3,1;6,28;1,28;1,28;1,28;1,28;1,28;1,28;1,28;1,28;1,28;1,28;1,28;1,28;1,28;1,28;1,28;1,w;1,w;1,w,4su;1,w;1,w,4st;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w,4sk;1,w;1,w;1,w,4si;1,w,4si,1;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w,4sc;1,w;1,w;1,w;1,w;1,w;1d,1;2,1,4ro;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;a,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,f;1,1;2,1;2,1;2,1;2,1;2,1;2,1;3,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;3,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;28a,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;1,5ls;2,5ls;6,5ls;3,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;1,2bk;3,2bk;1,2bk;1,2bk;ip,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,tzk;1,8;1,8;1,8;1,8;1,8;1,8;1oz,r7m,1;1,1;6o,r9g;4,2xy;h,raw;36,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1,1m;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;c,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,8;1,8;1,8;1,8;1,8;1,8;1,8;1,8;9,8;1,8;1,8;1,8;1,8;1,8;b,8;1,8;1,8;1,8;1,8;1,8;1,8;1,8;9,8;1,8;1,8;1,8;1,8;1,8;1,8;1,8;9,8;1,8;1,8;1,8;1,8;1,8;c,8;2,8;2,8;2,8;9,8;1,8;1,8;1,8;1,8;1,8;1,8;1,8;9,22;1,22;1,2e;1,2e;1,2e;1,2e;1,2s;1,2s;1,3k;1,3k;1,34;1,34;1,3i;1,3i;3,8;1,8;1,8;1,8;1,8;1,8;1,8;1,8;9,8;1,8;1,8;1,8;1,8;1,8;1,8;1,8;9,8;1,8;1,8;1,8;1,8;1,8;1,8;1,8;9,8;1,8;2,9;g,9;d,8;1,8;f,8;1,8;4,7;e,9;8v,s;1a,g;1,g;1,g;1,g;1,g;1,g;1,g;1,g;1,g;1,g;1,g;1,g;1,g;1,g;1,g;1,g;k,1;mr,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1,q;1f5,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1,1c;1d,1;7,1;2,1;2,1;7,1;3,1;b,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;9,1;2,1;5,1;nym,1;2,1;2,1;2,1;2,1;4,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;k,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;3s,1;2,1;2,1;2,1;2,1;2,1;2,1;4,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;b,1;2,1;3,1;2,1;2,1;2,1;2,1;5,1;5,1;2,1;2,1c;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;b,ps;1,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;5,1;2,1;3,1;2,1;2,1;2,1;2,1;2,1;2,1;2,1;r,1;geo,1;t8,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;xy,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;3t,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;1,14;4d,13;1,13;1,13;1,13;1,13;1,13;1,13;1,13;1,13;1,13;1,13;2,13;1,13;1,13;1,13;1,13;1,13;1,13;1,13;1,13;1,13;1,13;1,13;1,13;1,13;1,13;2,13;1,13;1,13;1,13;1,13;1,13;1,13;2,13;1,13;1d7,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;1,1s;4e,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;27v,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;gw1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1,w;1t,r;1,r;1,r;1,r;1,r;1,r;1,r;1,r;1,r;1,r;1,r;1,r;1,r;1,r;1,r;1,r;1,r;1,r;1,r;1,r;1,r;1,r;1,r;1,r;1,r;o5k,y;1,y;1,y;1,y;1,y;1,y;1,y;1,y;1,y;1,y;1,y;1,y;1,y;1,y;1,y;1,y;1,y;1,y;1,y;1,y;1,y;1,y;1,y;1,y;1,y;1,y;1,y;1,y;1,y;1,y;1,y;1,y;1,y;1,y";

// node_modules/tjs-lang/src/vm/regex.ts
var MAX_REGEX_PROGRAM = 20000;
var MAX_REGEX_COUNT = 1e4;
var MAX_REGEX_DEPTH = 200;
var MAX_REGEX_COMPILE_WORK = 1e6;
var MAX_REGEX_SLOTS = 512;
var MAX_REGEX_STATES = 200000;
var REGEX_FUEL_PER_STEP = 0.00002;

class RegexError extends Error {
}
var noCharge = () => {};
var MAX_CP = 1114111;
var isWordChar = (c) => c >= 48 && c <= 57 || c >= 65 && c <= 90 || c >= 97 && c <= 122 || c === 95;
var isDigit = (c) => c >= 48 && c <= 57;
var isLeadSurrogate = (c) => c >= 55296 && c <= 56319;
var isTrailSurrogate = (c) => c >= 56320 && c <= 57343;
var isLineTerminator = (c) => c === 10 || c === 13 || c === 8232 || c === 8233;
var DIGIT = [[48, 57]];
var WORD = [
  [48, 57],
  [65, 90],
  [95, 95],
  [97, 122]
];
var WORD_IU = [...WORD, [383, 383], [8490, 8490]];
var isWordCharIU = (c) => isWordChar(c) || c === 383 || c === 8490;
var SPACE = [
  [9, 13],
  [32, 32],
  [160, 160],
  [5760, 5760],
  [8192, 8202],
  [8232, 8233],
  [8239, 8239],
  [8287, 8287],
  [12288, 12288],
  [65279, 65279]
];
var LINE_TERMINATORS = [
  [10, 10],
  [13, 13],
  [8232, 8233]
];
function complement(ranges) {
  const out = [];
  let next = 0;
  for (const [lo, hi] of normalize(ranges)) {
    if (lo > next)
      out.push([next, lo - 1]);
    next = Math.max(next, hi + 1);
  }
  if (next <= MAX_CP)
    out.push([next, MAX_CP]);
  return out;
}
function normalize(ranges) {
  const sorted = ranges.slice().sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + 1)
      last[1] = Math.max(last[1], r[1]);
    else
      out.push([r[0], r[1]]);
  }
  return out;
}
var decodeFolds = (text) => {
  let prev = 0;
  return text.split(";").map((cls) => {
    const ds = cls.split(",").map((d) => parseInt(d, 36));
    const out = [prev + ds[0]];
    for (let i = 1;i < ds.length; i++)
      out.push(out[i - 1] + ds[i]);
    prev = out[0];
    return out;
  });
};
var foldTables = [];
function foldsOf(unicode) {
  const k = unicode ? 1 : 0;
  let table = foldTables[k];
  if (!table) {
    table = new Map;
    for (const cls of decodeFolds(unicode ? FOLDS_IU : FOLDS_I))
      for (const x of cls)
        table.set(x, cls);
    foldTables[k] = table;
  }
  return table;
}
var classWork = 0;
function inRanges(ranges, c) {
  let lo = 0;
  let hi = ranges.length - 1;
  classWork++;
  while (lo <= hi) {
    classWork++;
    const mid = lo + hi >> 1;
    if (c < ranges[mid][0])
      hi = mid - 1;
    else if (c > ranges[mid][1])
      lo = mid + 1;
    else
      return true;
  }
  return false;
}
function classTest(k, c) {
  let hit = inRanges(k.ranges, c);
  if (!hit && k.fold) {
    const equivalents = foldsOf(k.unicode).get(c);
    if (equivalents)
      for (const e of equivalents) {
        classWork++;
        if (e !== c && inRanges(k.ranges, e)) {
          hit = true;
          break;
        }
      }
  }
  return k.negate ? !hit : hit;
}
var BYTES_PER_WORK = 64;
var RANGE_BYTES = 40;
var SLOT = 8;
var NODE_BYTES = 64;
var charNode = (st, ranges, negate = false) => {
  st.alloc(2 * NODE_BYTES + ranges.length * (RANGE_BYTES + SLOT));
  return {
    t: "char",
    cls: {
      ranges: normalize(ranges),
      negate,
      fold: st.flags.ignoreCase,
      unicode: st.flags.unicode
    }
  };
};
var ahead = (st, from, n) => st.src.slice(from, from + n);
function parse2(src, flags, alloc) {
  const st = {
    src,
    i: 0,
    depth: 0,
    groups: 0,
    names: new Map,
    flags,
    alloc
  };
  const node = parseAlt(st);
  if (st.i < src.length)
    throw new RegexError(`Unexpected '${src[st.i]}' in /${src}/`);
  return { node, groups: st.groups, names: st.names };
}
function parseAlt(st) {
  if (++st.depth > MAX_REGEX_DEPTH)
    throw new RegexError(`Regex nested too deeply (over ${MAX_REGEX_DEPTH} levels)`);
  st.alloc(NODE_BYTES + SLOT);
  const options = [parseSeq(st)];
  while (st.src[st.i] === "|") {
    st.i++;
    st.alloc(SLOT);
    options.push(parseSeq(st));
  }
  st.depth--;
  return options.length === 1 ? options[0] : { t: "alt", options };
}
function parseSeq(st) {
  st.alloc(NODE_BYTES);
  const items = [];
  while (st.i < st.src.length && st.src[st.i] !== "|" && st.src[st.i] !== ")") {
    let atom = parseAtom(st);
    atom = parseQuantifier(st, atom);
    st.alloc(SLOT);
    items.push(atom);
  }
  return items.length === 1 ? items[0] : { t: "seq", items };
}
function parseQuantifier(st, atom) {
  const c = st.src[st.i];
  let min;
  let max;
  if (c === "*")
    [min, max] = [0, Infinity];
  else if (c === "+")
    [min, max] = [1, Infinity];
  else if (c === "?")
    [min, max] = [0, 1];
  else if (c === "{") {
    const m = /^\{(\d+)(,(\d*))?\}/.exec(ahead(st, st.i, 64));
    if (!m)
      return atom;
    min = Number(m[1]);
    max = m[2] === undefined ? min : m[3] === "" ? Infinity : Number(m[3]);
    if (min > MAX_REGEX_COUNT || max !== Infinity && max > MAX_REGEX_COUNT)
      throw new RegexError(`Regex count too large (over ${MAX_REGEX_COUNT}) in /${st.src}/`);
    if (max < min)
      throw new RegexError(`Numbers out of order in {} in /${st.src}/`);
    st.i += m[0].length - 1;
  } else
    return atom;
  if (atom.t === "assert")
    throw new RegexError(`Nothing to repeat in /${st.src}/`);
  st.i++;
  let lazy = false;
  if (st.src[st.i] === "?") {
    lazy = true;
    st.i++;
  }
  st.alloc(NODE_BYTES);
  return { t: "rep", body: atom, min, max, lazy };
}
function parseAtom(st) {
  const c = st.src[st.i];
  if (c === "(")
    return parseGroup(st);
  if (c === "[")
    return parseClass(st);
  if (c === ".") {
    st.i++;
    return st.flags.dotAll ? charNode(st, [[0, MAX_CP]]) : charNode(st, LINE_TERMINATORS, true);
  }
  if (c === "^" || c === "$") {
    st.i++;
    return { t: "assert", kind: c };
  }
  if (c === "\\")
    return parseEscape(st, false);
  if (c === "*" || c === "+" || c === "?" || c === "{" && /^\{\d+(,\d*)?\}/.test(ahead(st, st.i, 64)))
    throw new RegexError(`Nothing to repeat in /${st.src}/`);
  if (c === ")" || c === "]" && st.flags.unicode)
    throw new RegexError(`Unmatched '${c}' in /${st.src}/`);
  st.i++;
  const cp = st.flags.unicode ? codePointAt(st, st.i - 1) : c.charCodeAt(0);
  return charNode(st, [[cp, cp]]);
}
function codePointAt(st, at) {
  const cp = st.src.codePointAt(at);
  if (cp > 65535)
    st.i = at + 2;
  return cp;
}
function parseGroup(st) {
  st.i++;
  let index = null;
  if (st.src[st.i] === "?") {
    const next = st.src[st.i + 1];
    if (next === ":")
      st.i += 2;
    else if (next === "<" && st.src[st.i + 2] !== "=" && st.src[st.i + 2] !== "!") {
      const m = /^\?<([A-Za-z_$][\w$]*)>/.exec(ahead(st, st.i, 260));
      if (!m)
        throw new RegexError(`Invalid group name in /${st.src}/`);
      if (m[1] === "__proto__")
        throw new RegexError(`'__proto__' is not allowed as a group name (it would replace the groups object's prototype)`);
      index = ++st.groups;
      if (st.names.has(m[1]))
        throw new RegexError(`Duplicate group name '${m[1]}'`);
      st.names.set(m[1], index);
      st.i += m[0].length;
    } else
      throw new RegexError(`Lookahead and lookbehind are not supported in AsyncJS regexes (/${st.src}/)`);
  } else
    index = ++st.groups;
  const body = parseAlt(st);
  if (st.src[st.i] !== ")")
    throw new RegexError(`Unterminated group in /${st.src}/`);
  st.i++;
  st.alloc(NODE_BYTES);
  return { t: "group", index, body };
}
var NOT_DIGIT = complement(DIGIT);
var NOT_WORD = complement(WORD);
var NOT_WORD_IU = complement(WORD_IU);
var NOT_SPACE = complement(SPACE);
function classEscape(c, flags) {
  const word = flags.ignoreCase && flags.unicode ? WORD_IU : WORD;
  switch (c) {
    case "d":
      return DIGIT;
    case "D":
      return NOT_DIGIT;
    case "w":
      return word;
    case "W":
      return word === WORD_IU ? NOT_WORD_IU : NOT_WORD;
    case "s":
      return SPACE;
    case "S":
      return NOT_SPACE;
  }
  return null;
}
function charEscape(st, inClass) {
  const c = st.src[st.i];
  st.i++;
  switch (c) {
    case "t":
      return 9;
    case "n":
      return 10;
    case "v":
      return 11;
    case "f":
      return 12;
    case "r":
      return 13;
    case "0":
      if (isDigit(st.src.charCodeAt(st.i)))
        throw new RegexError(`Backreferences are not supported in AsyncJS regexes (/${st.src}/)`);
      return 0;
    case "b":
      if (inClass)
        return 8;
      break;
    case "x": {
      const m = /^[0-9a-fA-F]{2}/.exec(ahead(st, st.i, 2));
      if (!m)
        return 120;
      st.i += 2;
      return parseInt(m[0], 16);
    }
    case "u": {
      if (st.src[st.i] === "{" && st.flags.unicode) {
        const m = /^\{([0-9a-fA-F]{1,6})\}/.exec(ahead(st, st.i, 8));
        if (!m || parseInt(m[1], 16) > MAX_CP)
          throw new RegexError(`Invalid unicode escape in /${st.src}/`);
        st.i += m[0].length;
        return parseInt(m[1], 16);
      }
      const m = /^[0-9a-fA-F]{4}/.exec(ahead(st, st.i, 4));
      if (!m)
        return 117;
      st.i += 4;
      return parseInt(m[0], 16);
    }
    case "c": {
      const l = st.src.charCodeAt(st.i);
      if (l >= 65 && l <= 90 || l >= 97 && l <= 122) {
        st.i++;
        return l % 32;
      }
      st.i--;
      return 92;
    }
  }
  if (c === "p" || c === "P")
    throw new RegexError(`Unicode property escapes are not supported in AsyncJS regexes (/${st.src}/)`);
  if (c === "k")
    throw new RegexError(`Backreferences are not supported in AsyncJS regexes (/${st.src}/)`);
  if (c !== undefined && /[1-9]/.test(c))
    throw new RegexError(`Backreferences are not supported in AsyncJS regexes (/${st.src}/)`);
  if (c === undefined)
    throw new RegexError(`\\ at end of /${st.src}/`);
  return c.charCodeAt(0);
}
function parseEscape(st, inClass) {
  st.i++;
  const c = st.src[st.i];
  const ranges = classEscape(c, st.flags);
  if (ranges) {
    st.i++;
    return charNode(st, ranges);
  }
  if (!inClass && (c === "b" || c === "B")) {
    st.i++;
    return { t: "assert", kind: c };
  }
  const cp = charEscape(st, inClass);
  return charNode(st, [[cp, cp]]);
}
function parseClass(st) {
  st.i++;
  let negate = false;
  if (st.src[st.i] === "^") {
    negate = true;
    st.i++;
  }
  const ranges = [];
  const one = () => {
    if (st.src[st.i] === "\\") {
      st.i++;
      const r = classEscape(st.src[st.i], st.flags);
      if (r) {
        st.i++;
        return { ranges: r };
      }
      return { cp: charEscape(st, true) };
    }
    const cp = st.flags.unicode ? codePointAt(st, st.i) : st.src.charCodeAt(st.i);
    if (cp <= 65535 || !st.flags.unicode)
      st.i++;
    return { cp };
  };
  while (st.i < st.src.length && st.src[st.i] !== "]") {
    const a = one();
    if ("ranges" in a) {
      st.alloc(a.ranges.length * SLOT);
      ranges.push(...a.ranges);
      continue;
    }
    if (st.src[st.i] === "-" && st.src[st.i + 1] !== "]" && st.i + 1 < st.src.length) {
      st.i++;
      const b = one();
      if ("ranges" in b) {
        st.alloc(2 * (RANGE_BYTES + SLOT) + b.ranges.length * SLOT);
        ranges.push([a.cp, a.cp], [45, 45], ...b.ranges);
        continue;
      }
      if (b.cp < a.cp)
        throw new RegexError(`Range out of order in character class in /${st.src}/`);
      st.alloc(RANGE_BYTES + SLOT);
      ranges.push([a.cp, b.cp]);
    } else {
      st.alloc(RANGE_BYTES + SLOT);
      ranges.push([a.cp, a.cp]);
    }
  }
  if (st.src[st.i] !== "]")
    throw new RegexError(`Unterminated character class in /${st.src}/`);
  st.i++;
  return charNode(st, ranges, negate);
}
function groupsOf(node, out = []) {
  switch (node.t) {
    case "group":
      if (node.index !== null)
        out.push(node.index);
      groupsOf(node.body, out);
      break;
    case "seq":
      node.items.forEach((n) => groupsOf(n, out));
      break;
    case "alt":
      node.options.forEach((n) => groupsOf(n, out));
      break;
    case "rep":
      groupsOf(node.body, out);
      break;
  }
  return out;
}
function compileWork(cs, n) {
  cs.work += n;
  if (cs.work > MAX_REGEX_COMPILE_WORK)
    throw new RegexError(`Regex too large to compile (over ${MAX_REGEX_COMPILE_WORK} steps)`);
  cs.charge(n);
}
function emit(prog, ins, cs) {
  if (prog.length >= MAX_REGEX_PROGRAM)
    throw new RegexError(`Regex too large (over ${MAX_REGEX_PROGRAM} instructions)`);
  compileWork(cs, 1);
  const bytes = 64 + cs.live.length * 8 + (ins.op === "char" ? 48 + ins.cls.ranges.length * 40 : ins.op === "reset" ? ins.groups.length * 8 : 0);
  cs.alloc(bytes);
  cs.bytes += bytes;
  prog.push(ins);
  cs.liveOf.push(cs.live);
}
function compileNode(node, prog, cs) {
  switch (node.t) {
    case "char":
      emit(prog, { op: "char", cls: node.cls }, cs);
      return;
    case "assert":
      emit(prog, { op: "assert", kind: node.kind }, cs);
      return;
    case "seq":
      for (const n of node.items)
        compileNode(n, prog, cs);
      return;
    case "group":
      if (node.index !== null)
        emit(prog, { op: "save", n: node.index * 2 }, cs);
      compileNode(node.body, prog, cs);
      if (node.index !== null)
        emit(prog, { op: "save", n: node.index * 2 + 1 }, cs);
      return;
    case "alt": {
      const jumps = [];
      for (let k = 0;k < node.options.length; k++) {
        if (k < node.options.length - 1) {
          const split = { op: "split", x: prog.length + 1, y: -1 };
          emit(prog, split, cs);
          compileNode(node.options[k], prog, cs);
          const j = { op: "jmp", x: -1 };
          emit(prog, j, cs);
          jumps.push(j);
          split.y = prog.length;
        } else
          compileNode(node.options[k], prog, cs);
      }
      for (const j of jumps)
        j.x = prog.length;
      return;
    }
    case "rep": {
      let inner = cs.groupsOf.get(node);
      if (!inner) {
        inner = groupsOf(node.body);
        cs.alloc(NODE_BYTES + inner.length * SLOT);
        cs.groupsOf.set(node, inner);
      }
      let r = cs.regOf.get(node);
      if (r === undefined && node.max > node.min)
        cs.regOf.set(node, r = cs.regs++);
      const iteration = (optional) => {
        compileWork(cs, 1);
        if (optional)
          emit(prog, { op: "mark", r }, cs);
        const outer = cs.live;
        if (optional)
          cs.live = [...outer, r];
        if (inner.length)
          emit(prog, { op: "reset", groups: inner }, cs);
        compileNode(node.body, prog, cs);
        if (optional)
          emit(prog, { op: "progress", r }, cs);
        cs.live = outer;
      };
      for (let k = 0;k < node.min; k++)
        iteration(false);
      if (node.max === Infinity) {
        const loop = prog.length;
        const split = { op: "split", x: -1, y: -1 };
        emit(prog, split, cs);
        iteration(true);
        emit(prog, { op: "jmp", x: loop }, cs);
        const exit = prog.length;
        if (node.lazy)
          [split.x, split.y] = [exit, loop + 1];
        else
          [split.x, split.y] = [loop + 1, exit];
      } else {
        const splits = [];
        for (let k = node.min;k < node.max; k++) {
          const split = { op: "split", x: -1, y: -1 };
          emit(prog, split, cs);
          splits.push({ split, body: prog.length });
          iteration(true);
        }
        const exit = prog.length;
        for (const { split, body } of splits) {
          if (node.lazy)
            [split.x, split.y] = [exit, body];
          else
            [split.x, split.y] = [body, exit];
        }
      }
      return;
    }
  }
}
var PROGRAM = Symbol("tjs.regexProgram");
function regexScratch(re) {
  const { stateBase, prog } = re[PROGRAM];
  return {
    mark: new Int32Array(stateBase[prog.length]).fill(-1),
    generation: 0
  };
}
function regexBytes(re) {
  return re[PROGRAM].bytes;
}
function isGuestRegex(x) {
  return !!x && typeof x === "object" && PROGRAM in x;
}
function compileRegex(source, flagText = "", charge = noCharge, allocCharge = noCharge) {
  const alloc = (bytes) => {
    charge(Math.ceil(bytes / BYTES_PER_WORK));
    allocCharge(bytes);
  };
  if (typeof source !== "string")
    throw new RegexError("A regex pattern must be a string");
  if (!/^[gimsuy]*$/.test(flagText) || new Set(flagText).size !== flagText.length)
    throw new RegexError(`Unsupported regex flags '${flagText}' (AsyncJS supports g i m s u y)`);
  const flags = {
    global: flagText.includes("g"),
    ignoreCase: flagText.includes("i"),
    multiline: flagText.includes("m"),
    dotAll: flagText.includes("s"),
    unicode: flagText.includes("u"),
    sticky: flagText.includes("y")
  };
  charge(source.length);
  const { node, groups, names } = parse2(source, flags, alloc);
  const cs = {
    regs: 0,
    regOf: new Map,
    live: [],
    liveOf: [],
    groupsOf: new Map,
    work: 0,
    charge,
    bytes: 64 + source.length * 2,
    alloc
  };
  const prog = [];
  emit(prog, { op: "save", n: 0 }, cs);
  compileNode(node, prog, cs);
  emit(prog, { op: "save", n: 1 }, cs);
  emit(prog, { op: "match" }, cs);
  alloc((prog.length + 1) * 4);
  cs.bytes += (prog.length + 1) * 4;
  const stateBase = new Int32Array(prog.length + 1);
  for (let pc = 0;pc < prog.length; pc++) {
    if (cs.liveOf[pc].length > 16 || stateBase[pc] > MAX_REGEX_STATES)
      throw new RegexError(`Regex has too many nested optional quantifiers (over ${MAX_REGEX_STATES} states)`);
    stateBase[pc + 1] = stateBase[pc] + 2 ** cs.liveOf[pc].length;
  }
  if (stateBase[prog.length] > MAX_REGEX_STATES)
    throw new RegexError(`Regex has too many nested optional quantifiers (over ${MAX_REGEX_STATES} states)`);
  compileWork(cs, prog.length);
  if ((groups + 1) * 2 + cs.regs > MAX_REGEX_SLOTS)
    throw new RegexError(`Regex has too many groups or quantifiers (over ${MAX_REGEX_SLOTS} slots)`);
  const re = {
    source,
    flags: [..."gimsuy"].filter((f) => flagText.includes(f)).join(""),
    global: flags.global,
    ignoreCase: flags.ignoreCase,
    multiline: flags.multiline,
    sticky: flags.sticky,
    unicode: flags.unicode,
    dotAll: flags.dotAll
  };
  Object.defineProperty(re, PROGRAM, {
    value: {
      prog,
      regs: cs.regs,
      groups,
      names,
      flags,
      anchored: prog[1]?.op === "assert" && prog[1].kind === "^" && !flags.multiline,
      liveOf: cs.liveOf,
      stateBase,
      bytes: cs.bytes
    }
  });
  return Object.freeze(re);
}
var REGEX_COMPILE_WORK_PER_SOURCE_BYTE = 200;
var REGEX_COMPILE_WORK_FLOOR = 250000;

class RegexCompiler {
  used = 0;
  limit;
  cache = new Map;
  constructor(sourceLength) {
    this.limit = Math.max(REGEX_COMPILE_WORK_FLOOR, sourceLength * REGEX_COMPILE_WORK_PER_SOURCE_BYTE);
  }
  compile(pattern, flags = "") {
    const key = flags + "/" + pattern;
    const hit = this.cache.get(key);
    if (hit)
      return hit;
    const tooLarge = (what) => new RegexError(`The regexes in this source are too large to compile (${what})`);
    const re = compileRegex(pattern, flags, (n) => {
      if ((this.used += n) > this.limit)
        throw tooLarge(`over ${this.limit} steps`);
    });
    this.cache.set(key, re);
    return re;
  }
}
function threadBytes(re) {
  const { prog, groups, regs, stateBase } = re[PROGRAM];
  return (2 * prog.length + stateBase[prog.length]) * (((groups + 1) * 2 + regs) * 8 + 48) + stateBase[prog.length] * 4;
}
var isWordAt = (input, i, wordChar) => i >= 0 && i < input.length && wordChar(input.charCodeAt(i));
function assertOk(kind, input, pos, multiline, wordChar) {
  switch (kind) {
    case "^":
      return pos === 0 || multiline && isLineTerminator(input.charCodeAt(pos - 1));
    case "$":
      return pos === input.length || multiline && isLineTerminator(input.charCodeAt(pos));
    case "b":
      return isWordAt(input, pos - 1, wordChar) !== isWordAt(input, pos, wordChar);
    default:
      return isWordAt(input, pos - 1, wordChar) === isWordAt(input, pos, wordChar);
  }
}
function execRegex(re, input, from, charge, stickyOverride, scratch) {
  const compiled = re[PROGRAM];
  const { prog, regs, groups, names, flags, liveOf, stateBase } = compiled;
  const own = !scratch;
  const table = scratch ?? regexScratch(re);
  const { mark } = table;
  const sticky = stickyOverride ?? flags.sticky;
  const restart = !sticky && !compiled.anchored;
  const capSlots = (groups + 1) * 2;
  const nCaps = capSlots + regs;
  const copyCost = 1 + (nCaps >> 3);
  const unicode = flags.unicode;
  const multiline = flags.multiline;
  const wordChar = flags.ignoreCase && unicode ? isWordCharIU : isWordChar;
  let work = own ? 1 + (stateBase[prog.length] >> 3) : 0;
  classWork = 0;
  const flush = () => {
    work += classWork;
    classWork = 0;
    if (work) {
      const n = work;
      work = 0;
      charge(n);
    }
  };
  const nextGeneration = () => {
    if (++table.generation >= 2147483647) {
      mark.fill(-1);
      table.generation = 1;
    }
  };
  const stackPc = [];
  const stackCaps = [];
  let curPc = [];
  let curCaps = [];
  let nextPc;
  let nextCaps;
  let matched = null;
  const add = (listPc, listCaps, pc, caps, pos) => {
    stackPc[0] = pc;
    stackCaps[0] = caps;
    let sp = 1;
    while (sp > 0) {
      sp--;
      const p = stackPc[sp];
      const c = stackCaps[sp];
      const ins = prog[p];
      const live = liveOf[p];
      let state = stateBase[p];
      for (let k = 0;k < live.length; k++)
        if (c[capSlots + live[k]] === pos)
          state += 1 << k;
      work += 1 + live.length;
      if (mark[state] === table.generation)
        continue;
      mark[state] = table.generation;
      switch (ins.op) {
        case "jmp":
          stackPc[sp] = ins.x;
          stackCaps[sp++] = c;
          break;
        case "split":
          stackPc[sp] = ins.y;
          stackCaps[sp++] = c;
          stackPc[sp] = ins.x;
          stackCaps[sp++] = c;
          break;
        case "save": {
          const n = c.slice();
          work += copyCost;
          n[ins.n] = pos;
          stackPc[sp] = p + 1;
          stackCaps[sp++] = n;
          break;
        }
        case "assert":
          if (assertOk(ins.kind, input, pos, multiline, wordChar)) {
            stackPc[sp] = p + 1;
            stackCaps[sp++] = c;
          }
          break;
        case "reset": {
          const n = c.slice();
          work += copyCost + ins.groups.length;
          for (const g of ins.groups)
            n[g * 2] = n[g * 2 + 1] = -1;
          stackPc[sp] = p + 1;
          stackCaps[sp++] = n;
          break;
        }
        case "mark": {
          const n = c.slice();
          work += copyCost;
          n[capSlots + ins.r] = pos;
          stackPc[sp] = p + 1;
          stackCaps[sp++] = n;
          break;
        }
        case "progress":
          if (c[capSlots + ins.r] !== pos) {
            stackPc[sp] = p + 1;
            stackCaps[sp++] = c;
          }
          break;
        default:
          listPc.push(p);
          listCaps.push(c);
      }
    }
  };
  if (unicode && from > 0 && from < input.length && isTrailSurrogate(input.charCodeAt(from)) && isLeadSurrogate(input.charCodeAt(from - 1)))
    from--;
  let pos = from;
  nextGeneration();
  work += copyCost;
  add(curPc, curCaps, 0, new Array(nCaps).fill(-1), pos);
  while (true) {
    if (curPc.length === 0 && (matched || !restart))
      break;
    work += curPc.length + 1;
    flush();
    const cp = pos < input.length ? unicode ? input.codePointAt(pos) : input.charCodeAt(pos) : -1;
    const next = pos + (cp > 65535 ? 2 : 1);
    nextGeneration();
    nextPc = [];
    nextCaps = [];
    for (let t = 0;t < curPc.length; t++) {
      const ins = prog[curPc[t]];
      if (ins.op === "match") {
        matched = curCaps[t];
        break;
      }
      if (ins.op === "char" && cp !== -1 && classTest(ins.cls, cp))
        add(nextPc, nextCaps, curPc[t] + 1, curCaps[t], next);
    }
    flush();
    if (pos >= input.length)
      break;
    if (!matched && restart) {
      work += copyCost;
      add(nextPc, nextCaps, 0, new Array(nCaps).fill(-1), next);
    }
    curPc = nextPc;
    curCaps = nextCaps;
    pos = next;
  }
  flush();
  if (!matched)
    return null;
  const captures = [];
  for (let g = 0;g <= groups; g++) {
    const s = matched[g * 2];
    const e = matched[g * 2 + 1];
    captures.push(s >= 0 && e >= 0 ? [s, e] : undefined);
  }
  return { index: captures[0][0], end: captures[0][1], captures, names };
}

// node_modules/tjs-lang/src/vm/string-methods.ts
function prepare(p, m) {
  const re = isGuestRegex(p) ? p : compileRegex(String(p), "", m.steps, m.alloc);
  m.alloc(threadBytes(re));
  const scratch = regexScratch(re);
  return {
    re,
    exec: (s, from, sticky) => execRegex(re, s, from, m.steps, sticky, scratch)
  };
}
function advance(s, i, unicode) {
  if (!unicode || i + 1 >= s.length)
    return i + 1;
  const c = s.charCodeAt(i);
  const d = s.charCodeAt(i + 1);
  return c >= 55296 && c <= 56319 && d >= 56320 && d <= 57343 ? i + 2 : i + 1;
}
function allMatches(p, s, m, all = p.re.global, start = 0) {
  const out = [];
  let from = start;
  while (from <= s.length) {
    const hit = p.exec(s, from);
    if (!hit)
      break;
    m.alloc(64 + hit.captures.length * 24);
    out.push(hit);
    if (!all)
      break;
    from = hit.end === hit.index ? advance(s, hit.end, p.re.unicode) : hit.end;
  }
  return out;
}
function matchArray(hit, s, m) {
  m.alloc(hit.captures.reduce((n, c) => n + (c ? (c[1] - c[0]) * 2 : 0) + 16, 0) + hit.names.size * 48 + 128);
  const text = (c) => c ? s.slice(c[0], c[1]) : undefined;
  const out = hit.captures.map(text);
  out.index = hit.index;
  out.input = s;
  out.groups = hit.names.size ? Object.assign(Object.create(null), Object.fromEntries([...hit.names].map(([name, g]) => [name, text(hit.captures[g])]))) : undefined;
  return out;
}
function parseReplacement(repl, groupCount, hasNames, m) {
  m.steps(repl.length + 1);
  m.alloc(repl.length * 2 + 64);
  const pieces = [];
  let lit = "";
  for (let i = 0;i < repl.length; i++) {
    const c = repl[i];
    if (c !== "$" || i + 1 >= repl.length) {
      lit += c;
      continue;
    }
    const n = repl[i + 1];
    const push = (p, skip) => {
      if (lit)
        pieces.push({ lit });
      lit = "";
      pieces.push(p);
      i += skip;
    };
    if (n === "$") {
      lit += "$";
      i++;
    } else if (n === "&")
      push({ ref: "match" }, 1);
    else if (n === "`")
      push({ ref: "before" }, 1);
    else if (n === "'")
      push({ ref: "after" }, 1);
    else if (n >= "0" && n <= "9") {
      const two = repl[i + 2];
      const nn = two >= "0" && two <= "9" ? Number(n + two) : -1;
      if (nn >= 1 && nn <= groupCount)
        push({ group: nn }, 2);
      else if (Number(n) >= 1 && Number(n) <= groupCount)
        push({ group: Number(n) }, 1);
      else
        lit += "$";
    } else if (n === "<" && hasNames) {
      const close = repl.indexOf(">", i + 2);
      if (close === -1)
        lit += "$";
      else
        push({ name: repl.slice(i + 2, close) }, close - i);
    } else
      lit += "$";
  }
  if (lit)
    pieces.push({ lit });
  return pieces;
}
function pieceSource(p, sub, s) {
  if ("lit" in p)
    return p.lit;
  if ("ref" in p)
    return p.ref === "match" ? [sub.start, sub.end] : p.ref === "before" ? [0, sub.start] : [sub.end, s.length];
  if ("group" in p)
    return sub.captures[p.group];
  const g = sub.names?.get(p.name);
  return g === undefined ? undefined : sub.captures[g];
}
var substitutionOf = (hit) => ({
  start: hit.index,
  end: hit.end,
  captures: hit.captures,
  names: hit.names.size ? hit.names : null
});
function shapeOf(pieces) {
  const t = {
    literal: 0,
    match: 0,
    before: 0,
    after: 0,
    groups: new Map,
    names: new Map
  };
  for (const p of pieces)
    if ("lit" in p)
      t.literal += p.lit.length;
    else if ("ref" in p)
      t[p.ref]++;
    else if ("group" in p)
      t.groups.set(p.group, (t.groups.get(p.group) ?? 0) + 1);
    else
      t.names.set(p.name, (t.names.get(p.name) ?? 0) + 1);
  return t;
}
var spanLength = (c) => c ? c[1] - c[0] : 0;
function substitutionLength(t, sub, n) {
  let length = t.literal + t.match * (sub.end - sub.start) + t.before * sub.start + t.after * (n - sub.end);
  for (const [g, k] of t.groups)
    length += k * spanLength(sub.captures[g]);
  for (const [name, k] of t.names) {
    const g = sub.names?.get(name);
    if (g !== undefined)
      length += k * spanLength(sub.captures[g]);
  }
  return length;
}
function substitute(s, subs, repl, groupCount, hasNames, m) {
  if (!subs.length)
    return s;
  const pieces = parseReplacement(repl, groupCount, hasNames, m);
  const shape = shapeOf(pieces);
  m.steps(pieces.length);
  m.alloc(64);
  let out = "";
  let last = 0;
  for (const sub of subs) {
    m.steps(pieces.length + 1);
    m.alloc((sub.start - last + substitutionLength(shape, sub, s.length)) * 2);
    out += s.slice(last, sub.start);
    for (const p of pieces) {
      const from = pieceSource(p, sub, s);
      if (from !== undefined)
        out += typeof from === "string" ? from : s.slice(from[0], from[1]);
    }
    last = sub.end;
  }
  m.alloc((s.length - last) * 2);
  return out + s.slice(last);
}
function replace(s, pattern, repl, m) {
  if (!isGuestRegex(pattern)) {
    const at = s.indexOf(pattern);
    if (at === -1)
      return s;
    const end = at + pattern.length;
    return substitute(s, [{ start: at, end, captures: [[at, end]], names: null }], repl, 0, false, m);
  }
  return replaceHits(s, allMatches(prepare(pattern, m), s, m), repl, m);
}
function replaceHits(s, hits, repl, m) {
  if (typeof repl !== "function") {
    const groups = hits[0] ? hits[0].captures.length - 1 : 0;
    return substitute(s, hits.map(substitutionOf), repl, groups, !!hits[0]?.names.size, m);
  }
  let out = "";
  let last = 0;
  for (const hit of hits) {
    const a = matchArray(hit, s, m);
    const args = [...a, hit.index, s];
    if (a.groups)
      args.push(a.groups);
    const piece = String(repl(...args));
    m.alloc((hit.index - last + piece.length) * 2);
    out += s.slice(last, hit.index) + piece;
    last = hit.end;
  }
  m.alloc((s.length - last) * 2);
  return out + s.slice(last);
}
function replaceAll(s, pattern, repl, m) {
  if (isGuestRegex(pattern)) {
    if (!pattern.global)
      throw new TypeError("replaceAll must be called with a global RegExp");
    return replace(s, pattern, repl, m);
  }
  const subs = [];
  const step = Math.max(1, pattern.length);
  for (let at = s.indexOf(pattern);at !== -1; at = s.indexOf(pattern, at + step)) {
    m.alloc(64);
    const end = at + pattern.length;
    subs.push({ start: at, end, captures: [[at, end]], names: null });
    if (at >= s.length)
      break;
  }
  return substitute(s, subs, repl, 0, false, m);
}
function search(s, pattern, m) {
  const hit = prepare(pattern, m).exec(s, 0);
  return hit ? hit.index : -1;
}
function match(s, pattern, m) {
  const p = prepare(pattern, m);
  if (!p.re.global) {
    const hit = p.exec(s, 0);
    return hit ? matchArray(hit, s, m) : null;
  }
  const hits = allMatches(p, s, m);
  if (!hits.length)
    return null;
  m.alloc(hits.reduce((n, h) => n + (h.end - h.index) * 2 + 8, 0) + 64);
  return hits.map((h) => s.slice(h.index, h.end));
}
function split(s, sep, limit, m) {
  const lim = limit === undefined ? 2 ** 32 - 1 : limit >>> 0;
  const out = [];
  const push = (piece) => {
    m.alloc((piece?.length ?? 0) * 2 + 32);
    out.push(piece);
  };
  if (lim === 0)
    return out;
  if (sep === undefined) {
    push(s);
    return out;
  }
  if (!isGuestRegex(sep)) {
    if (sep === "") {
      for (let i = 0;i < s.length && out.length < lim; i++)
        push(s[i]);
      return out;
    }
    let p = 0;
    for (let at = s.indexOf(sep);at !== -1 && out.length < lim; at = s.indexOf(sep, p)) {
      push(s.slice(p, at));
      p = at + sep.length;
    }
    if (out.length < lim)
      push(s.slice(p));
    return out;
  }
  const sepRe = prepare(sep, m);
  if (s.length === 0) {
    if (!sepRe.exec(s, 0, true))
      push(s);
    return out;
  }
  let p = 0;
  let q = 0;
  while (q < s.length) {
    const hit = sepRe.exec(s, q, true);
    if (!hit || hit.end === p) {
      q = advance(s, q, sepRe.re.unicode);
      continue;
    }
    push(s.slice(p, q));
    if (out.length === lim)
      return out;
    p = hit.end;
    for (let g = 1;g < hit.captures.length; g++) {
      const c = hit.captures[g];
      push(c ? s.slice(c[0], c[1]) : undefined);
      if (out.length === lim)
        return out;
    }
    q = p;
  }
  push(s.slice(p));
  return out;
}

// node_modules/tjs-lang/src/lang/parser-transforms.ts
function locAt(source, pos) {
  let line = 1;
  let column = 0;
  for (let i = 0;i < pos && i < source.length; i++) {
    if (source[i] === `
`) {
      line++;
      column = 0;
    } else {
      column++;
    }
  }
  return { line, column };
}

// node_modules/tjs-lang/src/lang/expression-context.ts
function ternaryColons(source) {
  const masked = maskLiterals(source);
  const out = new Set;
  const frames = [0];
  let prevNonWs = -1;
  for (let i = 0;i < masked.length; i++) {
    const c = masked[i];
    const top = frames.length - 1;
    if (c === "(" || c === "[" || c === "{")
      frames.push(0);
    else if (c === ")" || c === "]" || c === "}") {
      if (frames.length > 1)
        frames.pop();
      else
        frames[0] = 0;
    } else if (c === ";" || c === ",")
      frames[top] = 0;
    else if (c === "?") {
      const next = masked[i + 1];
      const skip = masked[i - 1] === "?" || next === "?" || next === "." || next === ":" || next === "!";
      if (!skip) {
        const p = prevNonWs < 0 ? "" : masked[prevNonWs];
        if (prevNonWs < 0 || p === "(" || p === ",")
          frames[top] = 0;
        else
          frames[top]++;
      }
    } else if (c === ":") {
      if (frames[top] > 0)
        out.add(i);
      if (masked[i - 1] !== ":" && masked[i + 1] !== ":" && frames[top] > 0)
        frames[top]--;
    }
    if (!/\s/.test(c))
      prevNonWs = i;
  }
  return out;
}

// node_modules/tjs-lang/src/lang/parser-params.ts
var DESTRUCTURED_SHAPE_MARK = "__tjs_shape:";
var TYPED_DEFAULT_MARK = "__tjs_type:";
function topLevelDefaultEquals(text) {
  const m = maskLiterals(text);
  let depth = 0;
  for (let i = 0;i < m.length; i++) {
    const c = m[i];
    if (c === "{" || c === "[" || c === "(" || c === "<")
      depth++;
    else if (c === "}" || c === "]" || c === ")" || c === ">" && m[i - 1] !== "=")
      depth--;
    else if (c === "=" && depth === 0 && m[i + 1] !== "=" && m[i + 1] !== ">" && !"=!<>".includes(m[i - 1] ?? ""))
      return i;
  }
  return -1;
}
var PARAM_REQUIRED_MARKER = "/*!tjs-req*/";
var PARAM_TYPENAME_MARKER = "/*!tjs-opt*/";
var MARKER_PREFIX = "/*!tjs-";
var EXPRESSION_PREFIX_KEYWORDS = new Set([
  "default",
  "else",
  "do",
  "try",
  "new",
  "return",
  "typeof",
  "await",
  "yield",
  "void",
  "delete",
  "throw",
  "case",
  "in",
  "of",
  "instanceof"
]);
function extractParamMarkers(src) {
  const required = new Set;
  const typeName = new Set;
  if (!src.includes(PARAM_REQUIRED_MARKER) && !src.includes(PARAM_TYPENAME_MARKER)) {
    return { source: src, required, typeName };
  }
  const regions = scanLiterals(src).filter((r) => r.kind === "string" || r.kind === "template" || r.kind === "regex");
  let ri = 0;
  const literalAt = (pos) => {
    while (ri < regions.length && regions[ri].innerEnd <= pos)
      ri++;
    return ri < regions.length && pos >= regions[ri].innerStart;
  };
  const chunks = [];
  let outLen = 0;
  const emit = (s) => {
    if (!s)
      return;
    chunks.push(s);
    outLen += s.length;
  };
  let i = 0;
  for (;; ) {
    const at = src.indexOf(MARKER_PREFIX, i);
    if (at < 0) {
      emit(src.slice(i));
      break;
    }
    const isReq = src.startsWith(PARAM_REQUIRED_MARKER, at);
    const isOpt = !isReq && src.startsWith(PARAM_TYPENAME_MARKER, at);
    if (!isReq && !isOpt || literalAt(at)) {
      emit(src.slice(i, at + MARKER_PREFIX.length));
      i = at + MARKER_PREFIX.length;
      continue;
    }
    emit(src.slice(i, at));
    const last = chunks[chunks.length - 1];
    if (last && last.endsWith(" ")) {
      chunks[chunks.length - 1] = last.slice(0, -1);
      outLen--;
    }
    (isReq ? required : typeName).add(outLen);
    i = at + (isReq ? PARAM_REQUIRED_MARKER : PARAM_TYPENAME_MARKER).length;
  }
  return { source: chunks.join(""), required, typeName };
}
var REGEX_KEYWORDS_BEFORE = new Set([
  "return",
  "case",
  "throw",
  "in",
  "of",
  "typeof",
  "instanceof",
  "new",
  "delete",
  "void"
]);
var WORK_PER_CHAR = 64;
var WORK_FLOOR = 200000;
function transformWorkFor(source) {
  const n = source.length;
  return {
    used: 0,
    limit: n * WORK_PER_CHAR + Math.floor(n * n / 4) + WORK_FLOOR
  };
}
function charge(work, n, source) {
  if (!work)
    return;
  if ((work.used += n) > work.limit)
    throw new SyntaxError2(`Source is too complex to transpile within its work budget ` + `(${WORK_PER_CHAR}× its length). The parser refuses it rather than run super-linear ` + `work before any fuel applies.`, locAt(source, 0), source);
}
var MAX_PAREN_DEPTH = 64;
function transformParenExpressions(source, ctx) {
  const refuseMarker = (marker, at) => {
    if (!ctx.refuseSafetyMarkers)
      return;
    throw new SyntaxError2(`AJS has no safety marker \`${marker}\`: in TJS it switches validation off or on, and ` + `an agent's inputs are always checked against its signature. Remove it.`, locAt(source, at), ctx.originalSource ?? source);
  };
  const parenDepth = ctx.parenDepth ?? 0;
  if (parenDepth > (ctx.maxParenDepth ?? Infinity))
    throw new SyntaxError2(`Parentheses nest more than ${ctx.maxParenDepth} deep. That is refused before ` + `parsing, which is super-linear in nesting depth.`, locAt(ctx.originalSource, 0), ctx.originalSource);
  let result = "";
  let i = 0;
  const parenMemo = new Map;
  const regexMemo = {};
  let ternary;
  const classBodyMemo = new Map;
  const classBracketMemo = new Map;
  let firstReturnType;
  let firstReturnSafety;
  const returnTypes = Object.create(null);
  let state = "normal";
  const templateStack = [];
  const contextStack = [{ type: "top-level", braceDepth: 0 }];
  let braceDepth = 0;
  const _currentContext = () => contextStack[contextStack.length - 1]?.type || "top-level";
  const isInClassBody = () => {
    const frame = contextStack[contextStack.length - 1];
    return frame?.type === "class-body" && braceDepth === frame.braceDepth + 1;
  };
  const work = ctx.work;
  while (i < source.length) {
    charge(work, 1, ctx.originalSource);
    const char = source[i];
    const nextChar = source[i + 1];
    switch (state) {
      case "single-string":
        result += char;
        if (char === "\\" && i + 1 < source.length) {
          result += nextChar;
          i += 2;
          continue;
        }
        if (char === "'") {
          state = "normal";
        }
        i++;
        continue;
      case "double-string":
        result += char;
        if (char === "\\" && i + 1 < source.length) {
          result += nextChar;
          i += 2;
          continue;
        }
        if (char === '"') {
          state = "normal";
        }
        i++;
        continue;
      case "template-string":
        result += char;
        if (char === "\\" && i + 1 < source.length) {
          result += nextChar;
          i += 2;
          continue;
        }
        if (char === "$" && nextChar === "{") {
          result += nextChar;
          i += 2;
          templateStack.push(1);
          state = "normal";
          continue;
        }
        if (char === "`") {
          state = "normal";
        }
        i++;
        continue;
      case "line-comment":
        result += char;
        if (char === `
`) {
          state = "normal";
        }
        i++;
        continue;
      case "block-comment":
        result += char;
        if (char === "*" && nextChar === "/") {
          result += nextChar;
          i += 2;
          state = "normal";
          continue;
        }
        i++;
        continue;
      case "regex":
        result += char;
        if (char === "\\" && i + 1 < source.length) {
          result += nextChar;
          i += 2;
          continue;
        }
        if (char === "[") {
          i++;
          while (i < source.length && source[i] !== "]") {
            result += source[i];
            if (source[i] === "\\" && i + 1 < source.length) {
              result += source[i + 1];
              i += 2;
            } else {
              i++;
            }
          }
          if (i < source.length) {
            result += source[i];
            i++;
          }
          continue;
        }
        if (char === "/") {
          i++;
          while (i < source.length && /[gimsuy]/.test(source[i])) {
            result += source[i];
            i++;
          }
          state = "normal";
          continue;
        }
        i++;
        continue;
      case "normal":
        if (templateStack.length > 0) {
          if (char === "{") {
            templateStack[templateStack.length - 1]++;
          } else if (char === "}") {
            templateStack[templateStack.length - 1]--;
            if (templateStack[templateStack.length - 1] === 0) {
              templateStack.pop();
              result += char;
              i++;
              state = "template-string";
              continue;
            }
          }
        }
        if (char === "'") {
          result += char;
          i++;
          state = "single-string";
          continue;
        }
        if (char === '"') {
          result += char;
          i++;
          state = "double-string";
          continue;
        }
        if (char === "`") {
          result += char;
          i++;
          state = "template-string";
          continue;
        }
        if (char === "/" && nextChar === "/") {
          result += char + nextChar;
          i += 2;
          state = "line-comment";
          continue;
        }
        if (char === "/" && nextChar === "*") {
          result += char + nextChar;
          i += 2;
          state = "block-comment";
          continue;
        }
        if (char === "/") {
          let last = result.length - 1;
          while (last >= 0 && /\s/.test(result[last])) {
            last--;
            charge(work, 1, ctx.originalSource);
          }
          const lastChar = last >= 0 ? result[last] : "";
          let w = last;
          while (w >= 0 && /\w/.test(result[w])) {
            w--;
            charge(work, 1, ctx.originalSource);
          }
          const word = result.slice(w + 1, last + 1);
          const isRegexContext = !lastChar || /[=(!,;:{[&|?+\-*%<>~^]/.test(lastChar) || REGEX_KEYWORDS_BEFORE.has(word);
          if (isRegexContext) {
            result += char;
            i++;
            state = "regex";
            continue;
          }
        }
        break;
    }
    if (char === "{") {
      braceDepth++;
      result += char;
      i++;
      continue;
    }
    if (char === "}") {
      braceDepth--;
      const frame = contextStack[contextStack.length - 1];
      if (frame && braceDepth === frame.braceDepth) {
        contextStack.pop();
      }
      result += char;
      i++;
      continue;
    }
    const nameMatch = matchAt(RE_CLASS_NAME, source, i);
    let classHeaderLen = -1;
    if (nameMatch) {
      let d = 0;
      let j = i + nameMatch[0].length;
      const known = classBodyMemo.get(j);
      const zeroDepth = [];
      const opens = [];
      if (known !== undefined)
        j = known;
      else
        for (;j < source.length; j++) {
          charge(work, 1, ctx.originalSource);
          const c = source[j];
          if (d === 0)
            zeroDepth.push(j);
          if (c === '"' || c === "'" || c === "`") {
            const quote = c;
            j++;
            while (j < source.length && source[j] !== quote) {
              if (source[j] === "\\")
                j++;
              j++;
            }
            continue;
          }
          if (c === "(" || c === "[") {
            const partner = classBracketMemo.get(j);
            if (partner === -1) {
              j = source.length;
              break;
            }
            if (partner !== undefined) {
              j = partner;
              continue;
            }
            opens.push(j);
            d++;
          } else if (c === ")" || c === "]") {
            if (d === 0) {
              j = -1;
              break;
            }
            d--;
            classBracketMemo.set(opens.pop(), j);
          } else if (c === "{" && d === 0)
            break;
          else if ((c === ";" || c === "}") && d === 0) {
            j = -1;
            break;
          }
        }
      if (known === undefined) {
        const outcome = j > 0 && j < source.length ? j : -1;
        for (const z of zeroDepth)
          classBodyMemo.set(z, outcome);
        if (j >= source.length)
          for (const o of opens)
            classBracketMemo.set(o, -1);
      }
      if (j > 0 && j < source.length)
        classHeaderLen = j - i;
    }
    if (classHeaderLen > 0) {
      const classHeader = source.slice(i, i + classHeaderLen);
      result += classHeader;
      i += classHeader.length;
      contextStack.push({ type: "class-body", braceDepth });
      continue;
    }
    const funcMatch = matchAt(RE_FUNCTION_HEAD, source, i);
    if (funcMatch) {
      const declaredName = funcMatch[1];
      const star = funcMatch[0].includes("*") ? "*" : "";
      const funcName = declaredName || "anonymous";
      const matchLen = funcMatch[0].length;
      const afterParen = source[i + matchLen];
      let safetyMarker;
      let paramStart = i + matchLen;
      if (afterParen === "?" || afterParen === "!") {
        refuseMarker(afterParen, i + matchLen);
        safetyMarker = afterParen;
        paramStart++;
        if (safetyMarker === "!") {
          ctx.unsafeFunctions.add(funcName);
        } else {
          ctx.safeFunctions.add(funcName);
        }
      }
      result += declaredName ? `function${star} ${declaredName}(` : `function${star} (`;
      i = paramStart;
      const paramsResult = extractBalancedContent(source, i, "(", ")", parenMemo, work, ctx.originalSource, regexMemo);
      if (!paramsResult) {
        result += source[i];
        i++;
        continue;
      }
      const { content: params, endPos } = paramsResult;
      i = endPos;
      const processedParams = processParamString(params, ctx, true);
      result += processedParams + ")";
      let j = i;
      while (j < source.length && /\s/.test(source[j]))
        j++;
      if (source[j] === ":") {
        const colonMarker = source.slice(j, j + 2);
        let safety;
        if (colonMarker === ":?" || colonMarker === ":!") {
          refuseMarker(colonMarker, j);
          j += 2;
          safety = colonMarker === ":?" ? "safe" : "unsafe";
        } else {
          j += 1;
        }
        while (j < source.length && /\s/.test(source[j]))
          j++;
        const typeResult = extractReturnTypeValue(source, j, work, ctx.originalSource, regexMemo);
        if (typeResult) {
          if (firstReturnType === undefined) {
            firstReturnType = typeResult.type;
            if (safety)
              firstReturnSafety = safety;
          }
          if (declaredName && !(declaredName in returnTypes))
            returnTypes[declaredName] = typeResult.type;
          i = typeResult.endPos;
        }
      }
      let arrowCheck = i;
      while (arrowCheck < source.length && /\s/.test(source[arrowCheck]))
        arrowCheck++;
      if (source[arrowCheck] === "=" && source[arrowCheck + 1] === ">") {
        throw new SyntaxError2("Unexpected '=>' after function declaration. " + "Function declarations use `function name(params) { body }`, " + "not arrow syntax. Remove the `=>`.", locAt(ctx.originalSource, arrowCheck), ctx.originalSource);
      }
      continue;
    }
    const methodMatch = isInClassBody() && (source[i] === "[" || i === 0 || !/[A-Za-z0-9_$]/.test(source[i - 1])) ? matchAt(RE_METHOD_HEAD, source, i) : null;
    let isMethodDecl = false;
    if (methodMatch && isInClassBody()) {
      let prevIdx = -1;
      for (let k = result.length - 1;k >= 0; k--) {
        charge(work, 1, ctx.originalSource);
        if (!/\s/.test(result[k])) {
          prevIdx = k;
          break;
        }
      }
      const prevNonWs = prevIdx < 0 ? `
` : result[prevIdx];
      let prevWord = "";
      if (prevIdx >= 0 && /[A-Za-z0-9_$]/.test(prevNonWs)) {
        let w = prevIdx;
        while (w >= 0 && /[A-Za-z0-9_$]/.test(result[w])) {
          w--;
          charge(work, 1, ctx.originalSource);
        }
        prevWord = result.slice(w + 1, prevIdx + 1);
      }
      isMethodDecl = !EXPRESSION_PREFIX_KEYWORDS.has(prevWord) && prevNonWs !== "=" && prevNonWs !== "," && prevNonWs !== "(" && prevNonWs !== "[" && prevNonWs !== "." && prevNonWs !== ">";
    }
    if (methodMatch && isInClassBody() && !isMethodDecl) {
      const skipLen = methodMatch[1].length;
      result += source.slice(i, i + skipLen);
      i += skipLen;
      continue;
    }
    if (methodMatch && isInClassBody() && isMethodDecl) {
      const methodPart = methodMatch[1];
      const matchLen = methodMatch[0].length;
      const paramStart = i + matchLen;
      result += methodPart + "(";
      i = paramStart;
      const paramsResult = extractBalancedContent(source, i, "(", ")", parenMemo, work, ctx.originalSource, regexMemo);
      if (!paramsResult) {
        result += source[i];
        i++;
        continue;
      }
      const { content: params, endPos } = paramsResult;
      i = endPos;
      const processedParams = processParamString(params, ctx, true);
      result += processedParams + ")";
      let j = i;
      while (j < source.length && /\s/.test(source[j]))
        j++;
      if (source[j] === ":") {
        const colonMarker = source.slice(j, j + 2);
        if (colonMarker === ":?" || colonMarker === ":!") {
          refuseMarker(colonMarker, j);
          j += 2;
        } else {
          j++;
        }
        while (j < source.length && /\s/.test(source[j]))
          j++;
        const typeResult = extractReturnTypeValue(source, j, work, ctx.originalSource, regexMemo);
        if (typeResult) {
          i = typeResult.endPos;
        }
      }
      let k = i;
      while (k < source.length && /\s/.test(source[k]))
        k++;
      if (source[k] === "=" && source[k + 1] === ">") {
        throw new SyntaxError2("Unexpected '=>' after method declaration. " + "Methods use `name(params) { body }`, not arrow syntax. " + "Remove the `=>`.", locAt(ctx.originalSource, k), ctx.originalSource);
      }
      continue;
    }
    let isCallArgs = false;
    if (source[i] === "(") {
      let argPrevIdx = i - 1;
      while (argPrevIdx >= 0 && /\s/.test(source[argPrevIdx])) {
        argPrevIdx--;
        charge(work, 1, ctx.originalSource);
      }
      const prevTok = argPrevIdx < 0 ? "" : source[argPrevIdx];
      let argPrevWord = "";
      if (/[A-Za-z0-9_$]/.test(prevTok)) {
        let w = argPrevIdx;
        while (w >= 0 && /[A-Za-z0-9_$]/.test(source[w])) {
          w--;
          charge(work, 1, ctx.originalSource);
        }
        argPrevWord = source.slice(w + 1, argPrevIdx + 1);
      }
      isCallArgs = /[A-Za-z0-9_$)\]]/.test(prevTok) && !EXPRESSION_PREFIX_KEYWORDS.has(argPrevWord) && !/(^|[^A-Za-z0-9_$])async\s*$/.test(source.slice(Math.max(0, i - 12), i));
    }
    if (source[i] === "(" && !isCallArgs) {
      const fullParamsResult = extractBalancedContent(source, i + 1, "(", ")", parenMemo, work, ctx.originalSource, regexMemo);
      if (!fullParamsResult) {
        result += source[i];
        i++;
        continue;
      }
      const fullContent = fullParamsResult.content;
      const endPos = fullParamsResult.endPos;
      let j = endPos;
      while (j < source.length && /\s/.test(source[j]))
        j++;
      let arrowReturnType;
      if (source[j] === ":" && !(ternary ?? (charge(work, source.length, ctx.originalSource), ternary = ternaryColons(source))).has(j)) {
        const colonMarker = source.slice(j, j + 2);
        if (colonMarker === ":?" || colonMarker === ":!") {
          refuseMarker(colonMarker, j);
          j += 2;
        } else {
          j++;
        }
        while (j < source.length && /\s/.test(source[j]))
          j++;
        const typeResult = extractReturnTypeValue(source, j, work, ctx.originalSource, regexMemo);
        if (typeResult) {
          arrowReturnType = typeResult.type;
          j = typeResult.endPos;
          while (j < source.length && /\s/.test(source[j]))
            j++;
        }
      }
      if (source.slice(j, j + 2) === "=>") {
        let safetyMarker = null;
        let params = fullContent;
        const trimmedContent = fullContent.trimStart();
        if (trimmedContent.startsWith("?") && (trimmedContent.length === 1 || /\s/.test(trimmedContent[1]))) {
          refuseMarker("?", i);
          safetyMarker = "?";
          params = trimmedContent.slice(1);
        } else if (trimmedContent.startsWith("!") && (trimmedContent.length === 1 || /\s/.test(trimmedContent[1]))) {
          refuseMarker("!", i);
          safetyMarker = "!";
          params = trimmedContent.slice(1);
        }
        const processedParams = processParamString(params, ctx, true);
        const safetyComment = safetyMarker === "?" ? "/* safe */ " : safetyMarker === "!" ? "/* unsafe */ " : "";
        result += `(${safetyComment}${processedParams})`;
        i = endPos;
        while (i < j && /\s/.test(source[i])) {
          result += source[i];
          i++;
        }
        if (arrowReturnType) {
          i = j;
        }
      } else {
        charge(work, fullContent.length, ctx.originalSource);
        const transformed = transformParenExpressions(fullContent, {
          ...ctx,
          parenDepth: parenDepth + 1
        });
        result += `(${transformed.source})`;
        i = endPos;
      }
      continue;
    }
    result += source[i];
    i++;
  }
  return {
    source: result,
    returnType: firstReturnType,
    returnSafety: firstReturnSafety,
    returnTypes
  };
}
function extractBalancedContent(source, start, open, close, memo, work, original = source, regexMemo) {
  const known = memo?.get(start);
  if (known !== undefined) {
    if (known > 0)
      charge(work, known - start, original);
    return known < 0 ? null : { content: source.slice(start, known - 1), endPos: known };
  }
  const opened = [];
  let depth = 1;
  let i = start;
  let inString = false;
  let stringChar = "";
  let sigTail = open;
  while (i < source.length && depth > 0) {
    charge(work, 1, original);
    const char = source[i];
    if (inString && char === "\\") {
      i += 2;
      continue;
    }
    if (!inString && (char === "'" || char === '"' || char === "`")) {
      inString = true;
      stringChar = char;
    } else if (inString && char === stringChar) {
      inString = false;
    } else if (!inString) {
      if (char === "/" && isRegexStart(sigTail)) {
        const end = findRegexEnd(source, i, regexMemo);
        if (end !== -1) {
          i = end + 1;
          sigTail = "/";
          continue;
        }
      }
      if (char === open) {
        depth++;
        if (memo)
          opened.push(i + 1);
      } else if (char === close) {
        depth--;
        if (memo && opened.length)
          memo.set(opened.pop(), i + 1);
      }
      sigTail = (sigTail + char).slice(-24);
    }
    i++;
  }
  if (depth !== 0) {
    if (memo) {
      memo.set(start, -1);
      for (const p of opened)
        memo.set(p, -1);
    }
    return null;
  }
  memo?.set(start, i);
  return {
    content: source.slice(start, i - 1),
    endPos: i
  };
}
function checkedReturnType(source, start, end, original) {
  const raw = source.slice(start, end).trim();
  if (raw.includes("||")) {
    let node;
    try {
      node = parseExpressionAt(raw, 0, { ecmaVersion: "latest" });
    } catch {
      node = undefined;
    }
    if (node && node.end === raw.length && orInType(node)) {
      throw new SyntaxError2(orInTypeMessage(raw), locAt(source, start), original);
    }
  }
  return normalizeUnionSyntax(raw);
}
function normalizeUnionSyntax(type) {
  return type.replace(/(?<!\|)\|(?!\|)/g, " || ");
}
var ID = "[A-Za-z_$][A-Za-z0-9_$]*";
var ID_START = /[A-Za-z_$]/;
var ID_CHAR = /[A-Za-z0-9_$]/;
var RE_CLASS_NAME = new RegExp(`class\\s+${ID}`, "y");
var RE_FUNCTION_HEAD = new RegExp(`function\\s*\\*?(?:\\s+(${ID}))?\\s*\\(`, "y");
var RE_METHOD_HEAD = new RegExp(`(constructor|(?:get|set)\\s+(?:${ID}|\\[[^\\]]{1,256}\\])|async\\s+(?:${ID}|\\[[^\\]]{1,256}\\])|${ID}|\\[[^\\]]{1,256}\\])\\s*\\(`, "y");
function matchAt(re, source, at) {
  re.lastIndex = at;
  return re.exec(source);
}
function extractReturnTypeValue(source, start, work, original = source, regexMemo) {
  let i = start;
  let depth = 0;
  let inString = false;
  let stringChar = "";
  let sawContent = false;
  const makeResult = (endPos) => ({
    type: checkedReturnType(source, start, endPos, original),
    endPos
  });
  while (i < source.length) {
    charge(work, 1, original);
    const char = source[i];
    if (!inString && char === "/") {
      const end = findRegexEnd(source, i, regexMemo);
      if (end !== -1 && (charge(work, i - start, original), isRegexStart(source.slice(start, i)))) {
        i = end + 1;
        while (i < source.length && /[a-z]/.test(source[i]))
          i++;
        sawContent = true;
        if (depth === 0) {
          let j = i;
          while (j < source.length && /\s/.test(source[j]))
            j++;
          if (source[j] !== "|" && source[j] !== "&")
            return makeResult(i);
        }
        continue;
      }
    }
    if (!inString && (char === "'" || char === '"' || char === "`")) {
      inString = true;
      stringChar = char;
      sawContent = true;
      i++;
      continue;
    }
    if (inString) {
      if (char === stringChar && !isEscapedAt(source, i)) {
        inString = false;
        i++;
        if (depth === 0) {
          let j = i;
          while (j < source.length && /\s/.test(source[j]))
            j++;
          if (source[j] === "{") {
            const afterBrace = source.slice(j + 1).match(/^\s*(\w+)\s*:/);
            if (!afterBrace) {
              return makeResult(i);
            }
          }
          if (source[j] !== "|" && source[j] !== "&") {
            return makeResult(i);
          }
        }
        continue;
      }
      i++;
      continue;
    }
    if (char === "{" || char === "[" || char === "(") {
      depth++;
      sawContent = true;
      i++;
      continue;
    }
    if (char === "}" || char === "]" || char === ")") {
      depth--;
      if (depth === 0) {
        i++;
        let j = i;
        while (j < source.length && /\s/.test(source[j]))
          j++;
        if (source[j] === "|" || source[j] === "&") {
          continue;
        }
        return makeResult(i);
      }
      i++;
      continue;
    }
    if (depth === 0 && char === "{") {
      if (sawContent) {
        return makeResult(i);
      }
      const afterBrace = source.slice(i + 1).match(/^\s*(\w+)\s*:/);
      if (afterBrace) {
        depth++;
        sawContent = true;
        i++;
        continue;
      }
      return makeResult(i);
    }
    if (depth === 0 && (char === "|" || char === "&")) {
      i++;
      if (i < source.length && source[i] === "|")
        i++;
      while (i < source.length && /\s/.test(source[i]))
        i++;
      continue;
    }
    if (depth === 0 && (/\d/.test(char) || char === "-" && /\d/.test(source[i + 1]))) {
      let j = i;
      if (source[j] === "-")
        j++;
      while (j < source.length && /\d/.test(source[j]))
        j++;
      let isIntegral = true;
      if (j < source.length && source[j] === "." && /\d/.test(source[j + 1])) {
        isIntegral = false;
        j++;
        while (j < source.length && /\d/.test(source[j]))
          j++;
      }
      if (j < source.length && (source[j] === "e" || source[j] === "E")) {
        isIntegral = false;
        j++;
        if (j < source.length && (source[j] === "+" || source[j] === "-"))
          j++;
        while (j < source.length && /\d/.test(source[j]))
          j++;
      }
      if (isIntegral && j < source.length && source[j] === "n")
        j++;
      sawContent = true;
      i = j;
      while (i < source.length && /\s/.test(source[i]))
        i++;
      if (i < source.length && source[i] === "{") {
        return {
          type: checkedReturnType(source, start, j, original),
          endPos: j
        };
      }
      if (source[i] !== "|" && source[i] !== "&") {
        return {
          type: checkedReturnType(source, start, j, original),
          endPos: j
        };
      }
      continue;
    }
    if (depth === 0 && ID_START.test(char)) {
      let j = i;
      while (j < source.length && ID_CHAR.test(source[j]))
        j++;
      sawContent = true;
      i = j;
      while (i < source.length && /\s/.test(source[i]))
        i++;
      if (i < source.length && source[i] === "(") {
        depth++;
        i++;
        continue;
      }
      if (i < source.length && source[i] === "{") {
        const afterBrace = source.slice(i + 1).match(/^\s*(\w+)\s*:/);
        if (!afterBrace) {
          let typeEnd = j;
          while (typeEnd > start && /\s/.test(source[typeEnd - 1]))
            typeEnd--;
          return {
            type: checkedReturnType(source, start, typeEnd, original),
            endPos: j
          };
        }
      }
      if (source[i] !== "|" && source[i] !== "&") {
        return {
          type: checkedReturnType(source, start, j, original),
          endPos: j
        };
      }
      continue;
    }
    i++;
  }
  if (sawContent) {
    return makeResult(i);
  }
  return null;
}
function rewriteTypeArguments(type, ctx) {
  const arr = rewriteArraySuffix(type);
  if (arr !== null)
    return arr;
  if (!ctx.declaredTypes || !ctx.hoistedTypeArgs)
    return type;
  const expr = applyTypeArguments(type, ctx.declaredTypes);
  if (expr === null)
    return type;
  const base = type.trim().replace(/[^A-Za-z0-9_$]+/g, "_").replace(/_+$/, "");
  let alias = base;
  for (let n = 2;ctx.declaredTypes.has(alias); n++)
    alias = `${base}_${n}`;
  ctx.hoistedTypeArgs.push({
    alias,
    head: expr.slice(0, expr.indexOf("(")),
    text: `const ${alias} = ${expr}`
  });
  ctx.declaredTypes.add(alias);
  return alias;
}
function topLevelAssignment(src) {
  const masked = maskLiterals(src);
  let depth = 0;
  for (let i = 0;i < masked.length; i++) {
    const c = masked[i];
    if (c === "(" || c === "[" || c === "{")
      depth++;
    else if (c === ")" || c === "]" || c === "}")
      depth--;
    else if (c === "=" && depth === 0) {
      if (masked[i + 1] === "=" || masked[i + 1] === ">")
        continue;
      if ("=!<>".includes(masked[i - 1] ?? ""))
        continue;
      return i;
    }
  }
  return -1;
}
function rewriteArraySuffix(type) {
  const t = type.trim();
  if (!t.endsWith("[]"))
    return null;
  const inner = t.slice(0, -2).trim();
  if (!inner)
    return null;
  const nested = rewriteArraySuffix(inner);
  if (nested !== null)
    return `[${nested}]`;
  const example = typeNameExample(inner);
  return example ? `[${example}]` : null;
}
function applyTypeArguments(type, declaredTypes) {
  const m = type.trim().match(/^([A-Z][A-Za-z0-9_$]*)\s*<(.+)>$/);
  if (!m)
    return null;
  const [, name, argsSrc] = m;
  if (!declaredTypes.has(name))
    return null;
  const args = [];
  let depth = 0;
  let start = 0;
  for (let i = 0;i < argsSrc.length; i++) {
    const c = argsSrc[i];
    if (c === "<" || c === "(" || c === "[" || c === "{")
      depth++;
    else if (c === ">" || c === ")" || c === "]" || c === "}")
      depth--;
    else if (c === "," && depth === 0) {
      args.push(argsSrc.slice(start, i));
      start = i + 1;
    }
  }
  args.push(argsSrc.slice(start));
  const resolved = [];
  for (const a of args) {
    const t = a.trim();
    if (!t)
      return null;
    const nested = applyTypeArguments(t, declaredTypes);
    if (nested) {
      resolved.push(nested);
      continue;
    }
    const prim = typeArgumentSource(t);
    if (prim) {
      resolved.push(prim);
      continue;
    }
    if (declaredTypes.has(t)) {
      resolved.push(t);
      continue;
    }
    return null;
  }
  return `${name}(${resolved.join(", ")})`;
}
function splitParameters(params) {
  return splitTopLevel(params);
}
function processParamString(params, ctx, trackRequired) {
  const withArrows = transformParenExpressions(params, {
    originalSource: params,
    requiredParams: ctx.requiredParams,
    typeNameOptionals: ctx.typeNameOptionals,
    unsafeFunctions: ctx.unsafeFunctions,
    safeFunctions: ctx.safeFunctions,
    maxParenDepth: ctx.maxParenDepth,
    parenDepth: (ctx.parenDepth ?? 0) + 1,
    work: ctx.work,
    refuseTypedDefaults: ctx.refuseTypedDefaults,
    refuseSafetyMarkers: ctx.refuseSafetyMarkers
  }).source;
  const paramList = splitParameters(withArrows);
  let sawOptional = false;
  const seenNames = new Set;
  const checkDuplicate = (name) => {
    if (trackRequired && /^\w+$/.test(name)) {
      if (seenNames.has(name)) {
        throw new Error(`Duplicate parameter name '${name}'`);
      }
      seenNames.add(name);
    }
  };
  const processed = paramList.map((param) => {
    const trimmed = param.trim();
    if (!trimmed)
      return param;
    if (trackRequired && (trimmed.startsWith("{") || trimmed.startsWith("["))) {
      const open = trimmed[0];
      const masked = maskLiterals(trimmed);
      let depth = 0;
      let end = -1;
      for (let i = 0;i < masked.length; i++) {
        const c = masked[i];
        if (c === "{" || c === "[")
          depth++;
        else if (c === "}" || c === "]") {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end !== -1) {
        const inner = trimmed.slice(1, end);
        const rest = trimmed.slice(end + 1).trim();
        const processedInner = processDestructuredObjectParams(inner, ctx);
        const pattern = open === "{" ? `{ ${processedInner} }` : `[ ${processedInner} ]`;
        if (rest.startsWith(":")) {
          const tail = rest.slice(1);
          const eq = topLevelDefaultEquals(tail);
          const annotation = (eq === -1 ? tail : tail.slice(0, eq)).trim();
          const dflt = eq === -1 ? "" : ` ${tail.slice(eq).trim()}`;
          const consumed = open === "{" || open === "[";
          return consumed && annotation && !annotation.includes("*/") ? `${pattern} /*${DESTRUCTURED_SHAPE_MARK}${annotation}*/${dflt}` : `${pattern}${dflt}`;
        }
        return rest ? `${pattern} ${rest}` : pattern;
      }
    }
    if (trimmed.startsWith("...")) {
      const restColonPos = findTopLevelColon(trimmed);
      if (restColonPos !== -1) {
        const restName = trimmed.slice(0, restColonPos).trim();
        const annotation = trimmed.slice(restColonPos + 1);
        const eq = topLevelAssignment(annotation);
        if (eq !== -1) {
          throw new SyntaxError2(`A rest parameter cannot have a default. \`${restName}\` is always bound — ` + `to \`[]\` when no arguments are passed — so \`= ${annotation.slice(eq + 1).trim()}\` could never apply.

` + `  Drop it:  ${restName}: ${annotation.slice(0, eq).trim()}

` + `JavaScript rejects \`${restName} = …\` for the same reason; only the ` + `annotated spelling slipped through.`, locAt(trimmed, 0));
        }
        return restName;
      }
      return param;
    }
    const optionalMatch = trimmed.match(/^(\w+)\s*\?\s*:\s*(.+)$/);
    if (optionalMatch) {
      const [, name, type] = optionalMatch;
      checkDuplicate(name);
      sawOptional = true;
      if (type.includes("||")) {
        let node;
        try {
          node = parseExpressionAt(type, 0, { ecmaVersion: "latest" });
        } catch {
          node = undefined;
        }
        if (node && node.end === type.trim().length && orInType(node)) {
          const original = ctx.originalSource ?? params;
          const at = original.indexOf(trimmed);
          throw new SyntaxError2(orInTypeMessage(type.trim()), locAt(original, at >= 0 ? at : 0), original);
        }
      }
      if (isTypeNameAnnotation(type)) {
        ctx.typeNameOptionals.add(name);
        return `${name} = ${type} ${PARAM_TYPENAME_MARKER}`;
      }
      return `${name} = ${type}`;
    }
    if (trackRequired) {
      const tColon = findTopLevelColon(trimmed);
      const tName = tColon === -1 ? "" : trimmed.slice(0, tColon).trim();
      if (tColon !== -1 && /^[A-Za-z_$][\w$]*$/.test(tName)) {
        const afterColon = trimmed.slice(tColon + 1);
        const eq = topLevelDefaultEquals(afterColon);
        if (eq !== -1) {
          const annotation = rewriteTypeArguments(afterColon.slice(0, eq).trim(), ctx);
          const dflt = afterColon.slice(eq + 1).trim();
          if (annotation && dflt && !annotation.includes("*/")) {
            if (ctx.refuseTypedDefaults)
              throw new SyntaxError2(`AJS does not support a typed parameter with a default yet ` + `(\`${tName}: ${annotation} = ${dflt}\`): the type would not reach the ` + `agent's input schema, so it would check nothing.

` + `  Use the default as the example:  ${tName} = ${dflt}

` + `That declares the parameter optional, typed by its default.`, locAt(ctx.originalSource ?? params, 0), ctx.originalSource ?? params);
            checkDuplicate(tName);
            sawOptional = true;
            return `${tName} /*${TYPED_DEFAULT_MARK}${annotation}*/ = ${dflt}`;
          }
        }
      }
    }
    if (!hasColonNotEquals(trimmed)) {
      const eqMatch = trimmed.match(/^(\w+)\s*=/);
      if (eqMatch) {
        checkDuplicate(eqMatch[1]);
      }
      sawOptional = true;
      return param;
    }
    const colonPos = findTopLevelColon(trimmed);
    if (colonPos !== -1) {
      const name = trimmed.slice(0, colonPos).trim();
      const afterColon = trimmed.slice(colonPos + 1);
      const type = rewriteTypeArguments(afterColon.trim(), ctx);
      checkDuplicate(name);
      if (sawOptional && trackRequired && /^\w+$/.test(name)) {}
      if (trackRequired && /^\w+$/.test(name)) {
        if (isOptionalUnion(type)) {
          ctx.typeNameOptionals.add(name);
          return `${name} = ${type} ${PARAM_TYPENAME_MARKER}`;
        }
        ctx.requiredParams.add(name);
        return `${name} = ${type} ${PARAM_REQUIRED_MARKER}`;
      }
      return `${name} = ${type}`;
    }
    return param;
  });
  return processed.join(",");
}
function isOptionalUnion(type) {
  return splitTopLevelTrimmed(type, "|").some((p) => p === "undefined");
}
var LITERAL_KEYWORDS = new Set([
  "null",
  "true",
  "false",
  "undefined",
  "NaN",
  "Infinity"
]);
function isDestructuringRename(value) {
  const m = /^([A-Za-z_$][\w$]*)\s*(=(?!=)[\s\S]*)?$/.exec(value.trim());
  return !!m && !LITERAL_KEYWORDS.has(m[1]);
}
function processDestructuredObjectParams(inner, ctx) {
  const parts = splitParameters(inner);
  const processed = parts.map((part) => {
    const trimmed = part.trim();
    if (!trimmed)
      return part;
    const nestedObjectMatch = trimmed.match(/^(\w+)\s*:\s*(\{[\s\S]*\})$/);
    if (nestedObjectMatch) {
      const [, name, objectLiteral] = nestedObjectMatch;
      const processedLiteral = processObjectLiteralValue(objectLiteral);
      ctx.requiredParams.add(name);
      return `${name} = ${processedLiteral} ${PARAM_REQUIRED_MARKER}`;
    }
    const nestedArrayMatch = trimmed.match(/^(\w+)\s*:\s*(\[[\s\S]*\])$/);
    if (nestedArrayMatch) {
      const [, name, arrayLiteral] = nestedArrayMatch;
      const processedLiteral = processArrayLiteralValue(arrayLiteral);
      ctx.requiredParams.add(name);
      return `${name} = ${processedLiteral} ${PARAM_REQUIRED_MARKER}`;
    }
    const colonMatch = trimmed.match(/^(\w+)\s*:\s*([\s\S]+)$/);
    if (colonMatch && isDestructuringRename(colonMatch[2])) {
      return part;
    }
    if (colonMatch) {
      const [, name, value] = colonMatch;
      ctx.requiredParams.add(name);
      return `${name} = ${value} ${PARAM_REQUIRED_MARKER}`;
    }
    return part;
  });
  return processed.join(", ");
}
function processObjectLiteralValue(literal) {
  const inner = literal.slice(1, -1).trim();
  const parts = splitParameters(inner);
  const processed = parts.map((part) => {
    const trimmed = part.trim();
    if (!trimmed)
      return part;
    const nestedObjColonMatch = trimmed.match(/^(\w+)\s*:\s*(\{[\s\S]*\})$/);
    if (nestedObjColonMatch) {
      const [, key, nested] = nestedObjColonMatch;
      return `${key}: ${processObjectLiteralValue(nested)}`;
    }
    const nestedObjEqualsMatch = trimmed.match(/^(\w+)\s*=\s*(\{[\s\S]*\})$/);
    if (nestedObjEqualsMatch) {
      const [, key, nested] = nestedObjEqualsMatch;
      return `${key}: ${processObjectLiteralValue(nested)}`;
    }
    const nestedArrColonMatch = trimmed.match(/^(\w+)\s*:\s*(\[[\s\S]*\])$/);
    if (nestedArrColonMatch) {
      const [, key, nested] = nestedArrColonMatch;
      return `${key}: ${processArrayLiteralValue(nested)}`;
    }
    const nestedArrEqualsMatch = trimmed.match(/^(\w+)\s*=\s*(\[[\s\S]*\])$/);
    if (nestedArrEqualsMatch) {
      const [, key, nested] = nestedArrEqualsMatch;
      return `${key}: ${processArrayLiteralValue(nested)}`;
    }
    const equalsMatch = trimmed.match(/^(\w+)\s*=\s*([\s\S]+)$/);
    if (equalsMatch) {
      const [, key, value] = equalsMatch;
      return `${key}: ${value}`;
    }
    return part;
  });
  return `{ ${processed.join(", ")} }`;
}
function processArrayLiteralValue(literal) {
  const inner = literal.slice(1, -1).trim();
  const parts = splitParameters(inner);
  const processed = parts.map((part) => {
    const trimmed = part.trim();
    if (!trimmed)
      return part;
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return processObjectLiteralValue(trimmed);
    }
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      return processArrayLiteralValue(trimmed);
    }
    return part;
  });
  return `[ ${processed.join(", ")} ]`;
}
function hasColonNotEquals(param) {
  let depth = 0;
  let hasColon = false;
  let hasEquals = false;
  let inString = false;
  let stringChar = "";
  for (let i = 0;i < param.length; i++) {
    const char = param[i];
    if (!inString && (char === "'" || char === '"' || char === "`")) {
      inString = true;
      stringChar = char;
      continue;
    }
    if (inString) {
      if (char === stringChar && !isEscapedAt(param, i))
        inString = false;
      continue;
    }
    if (char === "(" || char === "{" || char === "[") {
      depth++;
    } else if (char === ")" || char === "}" || char === "]") {
      depth--;
    } else if (depth === 0) {
      if (char === ":")
        hasColon = true;
      if (char === "=" && param[i + 1] !== ">")
        hasEquals = true;
    }
  }
  return hasColon && !hasEquals;
}
function findTopLevelColon(param) {
  let depth = 0;
  let inString = false;
  let stringChar = "";
  for (let i = 0;i < param.length; i++) {
    const char = param[i];
    if (!inString && (char === "'" || char === '"' || char === "`")) {
      inString = true;
      stringChar = char;
      continue;
    }
    if (inString) {
      if (char === stringChar && !isEscapedAt(param, i))
        inString = false;
      continue;
    }
    if (char === "(" || char === "{" || char === "[") {
      depth++;
    } else if (char === ")" || char === "}" || char === "]") {
      depth--;
    } else if (depth === 0 && char === ":") {
      return i;
    }
  }
  return -1;
}

// node_modules/tjs-lang/src/lang/parser.ts
function extractFunctions(ast, filename) {
  for (const node of ast.body) {
    if (node.type === "ImportDeclaration") {
      throw new SyntaxError2("Imports are not supported. All atoms must be registered with the VM.", node.loc?.start || { line: 1, column: 0 }, undefined, filename);
    }
    if (node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration") {
      throw new SyntaxError2("Exports are not supported. The function is automatically exported.", node.loc?.start || { line: 1, column: 0 }, undefined, filename);
    }
    if (node.type === "ClassDeclaration") {
      throw new SyntaxError2("Classes are not supported. Agent99 uses functional composition.", node.loc?.start || { line: 1, column: 0 }, undefined, filename);
    }
  }
  for (const node of ast.body) {
    if (node.type !== "FunctionDeclaration" && node.type !== "EmptyStatement" && !(node.type === "ExpressionStatement" && node.directive)) {
      throw new SyntaxError2(node.type === "VariableDeclaration" ? "A top-level variable is never run: only the functions are. Declare it inside the " + "entry function, or take it as a parameter." : "A top-level statement is never run: only the functions are. Move it into the entry " + "function.", node.loc?.start || { line: 1, column: 0 }, undefined, filename);
    }
  }
  const functions = ast.body.filter((node) => node.type === "FunctionDeclaration");
  if (functions.length === 0) {
    throw new SyntaxError2("Source must contain a function declaration", { line: 1, column: 0 }, undefined, filename);
  }
  const entry = functions[functions.length - 1];
  const helpers = new Map;
  for (let i = 0;i < functions.length - 1; i++) {
    const fn = functions[i];
    const name = fn.id?.name;
    if (!name) {
      throw new SyntaxError2("Helper function must have a name", fn.loc?.start || { line: 1, column: 0 }, undefined, filename);
    }
    if (helpers.has(name)) {
      throw new SyntaxError2(`Duplicate helper function name: ${name}`, fn.loc?.start || { line: 1, column: 0 }, undefined, filename);
    }
    if (name === entry.id?.name) {
      throw new SyntaxError2(`Helper function cannot share a name with the entry function: ${name}`, fn.loc?.start || { line: 1, column: 0 }, undefined, filename);
    }
    helpers.set(name, fn);
  }
  return { entry, helpers };
}
function onlyGapFiller(gap) {
  for (let i = 0;i < gap.length; i++) {
    const c = gap[i];
    if (c === " " || c === "\t" || c === `
` || c === "\r")
      continue;
    if (c === "/" && gap[i + 1] === "/") {
      const nl = gap.indexOf(`
`, i);
      if (nl === -1)
        return true;
      i = nl;
      continue;
    }
    return false;
  }
  return true;
}
var docCommentCache = new Map;
function docComments(source) {
  const hit = docCommentCache.get(source);
  if (hit)
    return hit;
  const out = [];
  for (const r of scanLiterals(source)) {
    if (r.kind !== "block-comment")
      continue;
    const inner = source.slice(r.innerStart, r.innerEnd);
    if (inner.startsWith("#")) {
      const lineStart = source.lastIndexOf(`
`, r.start) + 1;
      if (!/^[ \t]*$/.test(source.slice(lineStart, r.start)))
        continue;
      out.push({
        start: r.start,
        end: r.end,
        kind: "tdoc",
        body: inner.slice(1)
      });
    } else if (inner.startsWith("*")) {
      out.push({
        start: r.start,
        end: r.end,
        kind: "jsdoc",
        body: source.slice(r.start, r.end)
      });
    }
  }
  if (docCommentCache.size > 24)
    docCommentCache.clear();
  docCommentCache.set(source, out);
  return out;
}
function docCommentBefore(blocks, pos, kind) {
  let found;
  let lo = 0;
  let hi = blocks.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = lo + hi >> 1;
    if (blocks[mid].end <= pos) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  for (let i = idx;i >= 0; i--) {
    if (blocks[i].kind === kind) {
      found = blocks[i];
      break;
    }
  }
  return found;
}
function extractTDoc(source, func) {
  const result = {
    params: {}
  };
  if (!func.loc)
    return result;
  const blocks = docComments(source);
  const tdoc = docCommentBefore(blocks, func.start, "tdoc");
  if (tdoc) {
    const afterBlock = source.slice(tdoc.end, func.start);
    if (onlyGapFiller(afterBlock)) {
      let content = tdoc.body;
      const lines = content.split(`
`);
      const minIndent = lines.filter((line) => line.trim().length > 0).reduce((min, line) => {
        const indent = line.match(/^(\s*)/)?.[1].length || 0;
        return Math.min(min, indent);
      }, Infinity);
      if (minIndent > 0 && minIndent < Infinity) {
        content = lines.map((line) => line.slice(minIndent)).join(`
`);
      }
      result.description = content.trim();
      return result;
    }
  }
  const jsdocBlock = docCommentBefore(blocks, func.start, "jsdoc");
  if (!jsdocBlock)
    return result;
  if (!/^\s*$/.test(source.slice(jsdocBlock.end, func.start)))
    return result;
  const jsdoc = jsdocBlock.body;
  const descMatch = jsdoc.match(/\/\*\*\s*\n?\s*\*?\s*([^@\n][^\n]*)/m);
  if (descMatch) {
    result.description = descMatch[1].trim();
  }
  const paramRegex = /@param\s+(?:\{[^}]+\}\s+)?(\w+)\s*-?\s*(.*)/g;
  let match;
  while ((match = paramRegex.exec(jsdoc)) !== null) {
    result.params[match[1]] = match[2].trim();
  }
  return result;
}

// node_modules/tjs-lang/src/lang/parser-agent.ts
function preprocessAgentSource(source, _options = {}) {
  const shebang = hashbangOf(source);
  if (shebang)
    source = " ".repeat(shebang.length) + source.slice(shebang.length);
  source = blankDocComments(source);
  const originalSource = source;
  source = stripLineComments(source);
  const requiredParams = new Set;
  const typeNameOptionals = new Set;
  const {
    source: transformed,
    returnType,
    returnTypes
  } = transformParenExpressions(source, {
    maxParenDepth: MAX_PAREN_DEPTH,
    work: transformWorkFor(source),
    originalSource,
    requiredParams,
    typeNameOptionals,
    unsafeFunctions: new Set,
    safeFunctions: new Set,
    refuseTypedDefaults: true,
    refuseSafetyMarkers: true
  });
  source = transformed;
  const marked = extractParamMarkers(source);
  return {
    source: marked.source,
    originalSource,
    requiredParams,
    requiredValueOffsets: marked.required,
    returnType,
    returnTypes
  };
}
var AWAIT_REMEDY = `AJS has no \`await\`: an atom call already waits for its result, and \`async\` changes nothing. Write the call without it:
  const res = httpFetch({ url })`;
function parseAgentSource(source, options = {}) {
  const { filename = "<source>" } = options;
  const pre = preprocessAgentSource(source, options);
  try {
    const ast = parse(pre.source, {
      ecmaVersion: 2022,
      sourceType: "module",
      locations: true,
      allowReturnOutsideFunction: false
    });
    return { ...pre, ast, processedSource: pre.source };
  } catch (e) {
    const loc = e.loc || { line: 1, column: 0 };
    let message = e.message.replace(/\s*\(\d+:\d+\)$/, "");
    if (/keyword 'await'/.test(message))
      message = AWAIT_REMEDY;
    throw new SyntaxError2(message, loc, pre.originalSource, filename);
  }
}

// node_modules/tosijs-schema/dist/index.js
var D = "\\p{Extended_Pictographic}";
var Se = /^(\d{4})-(\d{2})-(\d{2})$/;
var we = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
var oe = (e) => {
  let t = Se.exec(e);
  if (!t)
    return false;
  let r = +t[1], n = +t[2], i = +t[3];
  if (n < 1 || n > 12 || i < 1)
    return false;
  let u = n === 2 && r % 4 === 0 && (r % 100 !== 0 || r % 400 === 0) ? 29 : we[n - 1];
  return i <= u;
};
var Te = /^(\d{4}-\d{2}-\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/;
var j = { email: (e) => {
  if (/\s/.test(e))
    return false;
  let t = e.indexOf("@", 1);
  if (t === -1)
    return false;
  let r = e.indexOf(".", t + 2);
  return r !== -1 && r < e.length - 1;
}, uuid: (e) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(e), uri: (e) => {
  try {
    return new URL(e), true;
  } catch {
    return false;
  }
}, ipv4: (e) => /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(e), date: oe, "date-time": (e) => {
  let t = Te.exec(e);
  if (!t || !oe(t[1]))
    return false;
  let r = +t[2], n = +t[3], i = +t[4];
  if (r > 23 || n > 59)
    return false;
  return i <= 59 || i === 60 && r === 23 && n === 59;
}, emoji: (e) => new RegExp("\\p{Extended_Pictographic}", "u").test(e) };
var U = new Set(Object.keys(j));
var M = new Map;
var _ = (e, t) => {
  let r = t ? "u" : "", n = r + "\x00" + e, i = M.get(n);
  if (i === undefined) {
    if (i = new RegExp(e, r), M.size >= 500)
      M.clear();
    M.set(n, i);
  }
  return i;
};
var fe = Symbol.for("tosijs-schema.builder");
var F = (e) => e != null && typeof e === "object" && (e[fe] === true || typeof e.validate === "function") && ("schema" in e);
var m = (e, t = false) => ({ [fe]: true, schema: e, _type: null, _optional: t, validate: (r, n) => b(r, e, n), get optional() {
  let r = { ...e };
  if (e.type !== undefined) {
    let n = Array.isArray(e.type) ? e.type : [e.type];
    r.type = n.includes("null") ? n : [...n, "null"];
  }
  if (r.const !== undefined) {
    let n = r.const === null ? "null" : typeof r.const;
    if (r.enum = [r.const, null], delete r.const, r.type === undefined && n !== "null")
      r.type = [n, "null"];
  }
  if (Array.isArray(r.enum) && !r.enum.includes(null))
    r.enum = [...r.enum, null];
  if (r.type === undefined && r.enum === undefined && Array.isArray(r.anyOf) && !r.anyOf.some((n) => n === true || n?.type === "null" || Array.isArray(n?.type) && n.type.includes("null")))
    r.anyOf = [...r.anyOf, { type: "null" }];
  return m(r, true);
}, get open() {
  return m({ ...e, additionalProperties: true }, t);
}, title: (r) => m({ ...e, title: r }, t), describe: (r) => m({ ...e, description: r }, t), default: (r) => m({ ...e, default: r }, t), meta: (r) => m({ ...r, ...e, ...r }, t), min: (r) => {
  let n = e.type === "string" ? "minLength" : e.type === "array" ? "minItems" : e.type === "object" ? "minProperties" : "minimum";
  return m({ ...e, [n]: r }, t);
}, max: (r) => {
  let n = e.type === "string" ? "maxLength" : e.type === "array" ? "maxItems" : e.type === "object" ? "maxProperties" : "maximum";
  return m({ ...e, [n]: r }, t);
}, pattern: (r) => m({ ...e, pattern: typeof r === "string" ? r : r.source }, t), get email() {
  return m({ ...e, format: "email" }, t);
}, get uuid() {
  return m({ ...e, format: "uuid" }, t);
}, get ipv4() {
  return m({ ...e, format: "ipv4" }, t);
}, get url() {
  return m({ ...e, format: "uri" }, t);
}, get datetime() {
  return m({ ...e, format: "date-time" }, t);
}, get date() {
  return m({ ...e, format: "date" }, t);
}, get emoji() {
  return m({ ...e, pattern: `^${D}+$`, format: "emoji" }, t);
}, get int() {
  return m({ ...e, type: "integer" }, t);
}, step: (r) => m({ ...e, multipleOf: r }, t) });
var R = null;
var ae = (e) => {
  try {
    return Array.isArray(e);
  } catch {
    return false;
  }
};
var P = (e, t) => {
  let r = false, n = "a plain schema";
  try {
    if (r = F(e), !r)
      n = Array.isArray(e) ? "an array" : typeof e === "object" && e ? n : String(e);
  } catch {}
  if (!r)
    throw TypeError(`${t}: expected a builder like s.string, not ${n}`);
};
var G = { get email() {
  return m({ type: "string", format: "email" });
}, get uuid() {
  return m({ type: "string", format: "uuid" });
}, get ipv4() {
  return m({ type: "string", format: "ipv4" });
}, get url() {
  return m({ type: "string", format: "uri" });
}, get datetime() {
  return m({ type: "string", format: "date-time" });
}, get date() {
  return m({ type: "string", format: "date" });
}, get emoji() {
  return m({ type: "string", pattern: `^${D}+$`, format: "emoji" });
}, get null() {
  return m({ type: "null" });
}, get undefined() {
  return m({ type: "null", "x-tjs-undefined": true });
}, get any() {
  return m({});
}, pattern: (e) => m({ type: "string", pattern: typeof e === "string" ? e : e.source }), union: (e) => {
  if (!ae(e))
    throw TypeError("s.union expects an array of builders: s.union([s.string, s.number])");
  return e.forEach((t, r) => P(t, `s.union: schemas[${r}]`)), m({ anyOf: e.map((t) => t.schema) });
}, enum: (e) => m({ type: typeof e[0], enum: e }), const: (e) => m({ const: e }), array: (e) => (P(e, "s.array(items)"), m({ type: "array", items: e.schema })), tuple: (e) => {
  if (!ae(e))
    throw TypeError("s.tuple expects an array of builders: s.tuple([s.string, s.number])");
  return e.forEach((t, r) => P(t, `s.tuple: items[${r}]`)), m({ type: "array", items: e.map((t) => t.schema), minItems: e.length, maxItems: e.length });
}, object: (e, t) => {
  let r = {}, n = [];
  for (let i in e) {
    P(e[i], `s.object: property ${JSON.stringify(i)}`), r[i] = e[i].schema;
    let u = r[i];
    if (e[i]._optional !== true && (!Array.isArray(u.type) || !u.type.includes("null")))
      n.push(i);
  }
  return m({ type: "object", properties: r, required: n, additionalProperties: t?.additionalProperties === true });
}, record: (e) => {
  if (e == null)
    throw Error("s.record(valueSchema) requires a value schema — use s.record(s.any) for unconstrained values");
  return P(e, "s.record(valueSchema)"), m({ type: "object", additionalProperties: e.schema });
}, infer: (e) => {
  if (e === null)
    return m({ type: "null" });
  if (e === undefined)
    return m({ type: "null", "x-tjs-undefined": true });
  let t = typeof e;
  if (t === "string")
    return m({ type: "string" });
  if (t === "number")
    return m({ type: Number.isInteger(e) ? "integer" : "number" });
  if (t === "boolean")
    return m({ type: "boolean" });
  if (Array.isArray(e)) {
    if (e.length === 0)
      return m({ type: "array" });
    return m({ type: "array", items: G.infer(e[0]).schema });
  }
  if (t === "object") {
    let r = {}, n = [];
    for (let i in e)
      r[i] = G.infer(e[i]).schema, n.push(i);
    return m({ type: "object", properties: r, required: n, additionalProperties: false });
  }
  return m({});
} };
var Ue = new Proxy(G, { get(e, t) {
  if (t in e)
    return e[t];
  if (t === "string" || t === "number" || t === "boolean" || t === "integer") {
    let r = m({ type: t });
    return e[t] = r, r;
  }
  return;
} });
var V = (e) => Object.getOwnPropertyNames(e);
var H = Symbol("unreadable");
var se = (e, t) => {
  try {
    return e[t];
  } catch {
    return H;
  }
};
var w = Symbol("tosijs-schema.ambiguous");
var k = "ambiguous: has a `schema` key but is not a builder — pass the schema itself (e.g. envelope.schema)";
var T = (e) => {
  if (e == null || typeof e !== "object")
    return e;
  try {
    if (F(e))
      return e.schema;
    return "schema" in e ? w : e;
  } catch {
    return w;
  }
};
var O = (e, t) => Object.prototype.hasOwnProperty.call(e, t);
var ce = true;
var z = false;
var $e = () => {
  if (!ce || z)
    return;
  z = true, console.warn("[tosijs-schema] `oneOf` is validated by trying every branch (no short-circuit, unlike `anyOf`) — for a discriminated union, `anyOf` is cheaper. Silence with setWarnings(false). This warns once per process.");
};
var ue = (e, t) => t === "integer" ? typeof e === "number" && Number.isInteger(e) : t === "array" ? Array.isArray(e) : t === "object" ? typeof e === "object" && !Array.isArray(e) : t === "number" ? typeof e === "number" : typeof e === t;
var W = (e, t, r) => {
  if (t === "__proto__")
    Object.defineProperty(e, t, { value: r, enumerable: true, writable: true, configurable: true });
  else
    e[t] = r;
};
var J = 97;
var le = new Set(["type", "properties", "required", "items", "enum", "const", "anyOf", "oneOf", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "pattern", "format", "minItems", "maxItems", "minProperties", "maxProperties", "additionalProperties", "$predicate", "x-tjs-undefined"]);
var ye = (e) => e.properties !== undefined || e.required !== undefined || e.additionalProperties !== undefined || e.minProperties !== undefined || e.maxProperties !== undefined;
var me = (e) => e.items !== undefined || e.minItems !== undefined || e.maxItems !== undefined;
function qe(e, t, r) {
  let n = T(t);
  if (n === w) {
    let i = typeof r === "function" ? r : r?.onError;
    if (i)
      i("root", k);
    return false;
  }
  return b(e, n, r);
}
function b(e, t, r) {
  let n = typeof r === "function" ? r : r?.onError, i = typeof r === "object" ? r?.strict ?? r?.fullScan ?? false : false, u = [], a = (s) => {
    if (n)
      n(u.join(".") || "root", s);
    return false;
  }, f = (s, o) => {
    if (o === true)
      return true;
    if (o === false)
      return a("Schema forbids value");
    if (Array.isArray(o.anyOf)) {
      let y = false;
      for (let c of o.anyOf)
        if (b(s, c, { strict: i })) {
          y = true;
          break;
        }
      if (!y)
        return a("Union mismatch");
    }
    if (Array.isArray(o.oneOf)) {
      $e();
      let y = 0;
      for (let c of o.oneOf)
        if (b(s, c, { strict: i })) {
          if (y++, y > 1)
            break;
        }
      if (y !== 1)
        return a(`oneOf: matched ${y} branches, need exactly 1`);
    }
    if (o.const !== undefined) {
      if (s !== o.const)
        return a("Const mismatch");
    }
    if (Array.isArray(o.enum) && s !== undefined && !o.enum.includes(s))
      return a("Enum mismatch");
    if (s === null) {
      let y = o.type === "null" && !o["x-tjs-undefined"], c = Array.isArray(o.type) && o.type.includes("null");
      return y || c || !o.type || a("Expected value, got null");
    }
    if (s === undefined) {
      let y = o.type === "null" && o["x-tjs-undefined"], c = Array.isArray(o.type) && o.type.includes("null");
      return y || c || !o.type || a("Expected value, got undefined");
    }
    let p;
    if (typeof o.type === "string") {
      if (o.type === "null")
        return a("Expected null");
      if (!ue(s, o.type))
        return a(`Expected ${o.type}`);
      p = o.type;
    } else if (Array.isArray(o.type)) {
      let y = false;
      for (let c of o.type) {
        if (typeof c !== "string" || c === "null")
          continue;
        if (y = true, ue(s, c)) {
          p = c;
          break;
        }
      }
      if (y && p === undefined)
        return a(`Expected ${o.type.filter((c) => typeof c === "string" && c !== "null").join(" | ")}`);
      if (!y && o.type.includes("null"))
        return a("Expected null");
    }
    if (o.$predicate && R) {
      if (!R(o.$predicate, s))
        return a("Predicate mismatch");
    }
    if (typeof s === "number") {
      if (!Number.isFinite(s))
        return a("Expected finite number");
      if (o.minimum !== undefined && s < o.minimum)
        return a("Value < min");
      if (o.maximum !== undefined && s > o.maximum)
        return a("Value > max");
      if (o.exclusiveMinimum !== undefined && s <= o.exclusiveMinimum)
        return a("Value <= exclusive min");
      if (o.exclusiveMaximum !== undefined && s >= o.exclusiveMaximum)
        return a("Value >= exclusive max");
      if (o.multipleOf !== undefined) {
        let y = Math.abs(s % o.multipleOf), c = 0.0000000001;
        if (y > 0.0000000001 && Math.abs(y - Math.abs(o.multipleOf)) > 0.0000000001)
          return a("Value not step");
      }
    }
    if (typeof s === "string") {
      if (o.minLength !== undefined && s.length < o.minLength)
        return a("Len < min");
      if (o.maxLength !== undefined && s.length > o.maxLength)
        return a("Len > max");
      if (o.pattern)
        try {
          if (!_(o.pattern, o.format === "emoji").test(s))
            return a("Pattern mismatch");
        } catch {
          return a("Invalid pattern");
        }
      if (o.format && j[o.format] && !j[o.format](s))
        return a("Format invalid");
    }
    if (p === "object" || !p && typeof s === "object" && !Array.isArray(s) && ye(o)) {
      let { minProperties: y, maxProperties: c } = o;
      if (y !== undefined || c !== undefined) {
        let l = V(s).length;
        if (c !== undefined && l > c)
          return a("Too many props");
        if (y !== undefined && l < y)
          return a("Too few props");
      }
      if (o.required) {
        for (let l of o.required)
          if (!O(s, l))
            return a(`Missing ${l}`);
      }
      if (o.additionalProperties === false)
        for (let l of V(s)) {
          if (o.properties && O(o.properties, l))
            continue;
          return a(`Unexpected ${l}`);
        }
      if (o.properties) {
        for (let l in o.properties)
          if (O(s, l)) {
            u.push(l);
            let d = se(s, l);
            if (d === H)
              return a(`Unreadable ${l}`);
            let g = f(d, o.properties[l]);
            if (u.pop(), !g)
              return false;
          }
      }
      if (o.additionalProperties) {
        let l = [];
        for (let h of V(s)) {
          if (o.properties && O(o.properties, h))
            continue;
          l.push(h);
        }
        let d = l.length, g = i || d <= J ? 1 : Math.floor(d / J);
        for (let h = 0;h < d; h += g) {
          let x = g > 1 && h > d - 1 - g ? d - 1 : h, E = l[x];
          u.push(E);
          let v = se(s, E);
          if (v === H)
            return a(`Unreadable ${E}`);
          let B = f(v, o.additionalProperties);
          if (u.pop(), !B)
            return false;
          if (x === d - 1)
            break;
        }
      }
      return true;
    }
    if (p === "array" || !p && Array.isArray(s) && me(o)) {
      let y = s.length;
      if (o.minItems !== undefined && y < o.minItems)
        return a("Array too short");
      if (o.maxItems !== undefined && y > o.maxItems)
        return a("Array too long");
      if (o.items === undefined)
        return true;
      if (Array.isArray(o.items)) {
        for (let l = 0;l < o.items.length; l++) {
          if (u.push(String(l)), !f(s[l], o.items[l]))
            return u.pop(), false;
          u.pop();
        }
        return true;
      }
      let c = i || y <= J ? 1 : Math.floor(y / J);
      for (let l = 0;l < y; l += c) {
        let d = c > 1 && l > y - 1 - c ? y - 1 : l;
        u.push(String(d));
        let g = f(s[d], o.items);
        if (u.pop(), !g)
          return false;
        if (d === y - 1)
          break;
      }
      return true;
    }
    return true;
  };
  return f(e, t);
}
function Ge(e, t, r) {
  let n = T(t), i = typeof r === "function" ? r : r?.onError, u = typeof r === "object" ? r?.strict ?? r?.fullScan ?? false : false, a = typeof r === "object" ? r?.skipValidation : false;
  if (n === w) {
    if (i)
      i("root", k);
    return Error(`root: ${k}`);
  }
  let f = A(e, n, u);
  if (!a) {
    let s = "", o = "", p = (c, l) => {
      if (!s)
        s = c, o = l;
      if (i)
        i(c, l);
    }, y;
    try {
      y = b(f, n, { onError: p, fullScan: u });
    } catch (c) {
      return Error(`internal validation error: ${c.message}`);
    }
    if (!y)
      return Error(`${s}: ${o}`);
  }
  return f;
}
function A(e, t, r = false) {
  if (e === null || e === undefined)
    return e;
  if (t === null || typeof t !== "object")
    return e;
  if (t instanceof X)
    return t.sides.reduce((f, s) => N(f, s), e);
  if (Array.isArray(t.anyOf) || Array.isArray(t.oneOf)) {
    let { anyOf: f, oneOf: s, ...o } = t, p = Object.keys(o).length ? o : null;
    if (Array.isArray(s))
      return je(e, s, Array.isArray(f) ? { ...o, anyOf: f } : p, r);
    return Ee(e, f, p, r);
  }
  let n = t.type, i = (n === "object" || !n && ye(t)) && typeof e === "object" && !Array.isArray(e), u = (n === "array" || !n && me(t)) && Array.isArray(e);
  if (i && !t.properties && t.additionalProperties === false)
    return {};
  let a = t.additionalProperties && typeof t.additionalProperties === "object" ? t.additionalProperties : t.additionalProperties === true ? {} : null;
  if (i && (t.properties || a)) {
    let f = {};
    if (t.properties) {
      for (let s of Object.keys(t.properties))
        if (O(e, s))
          W(f, s, A(e[s], t.properties[s], r));
    }
    if (a)
      for (let s of Object.keys(e)) {
        if (t.properties && O(t.properties, s))
          continue;
        W(f, s, A(e[s], a, r));
      }
    return f;
  }
  if (u) {
    if (t.items)
      if (Array.isArray(t.items))
        return e.slice(0, t.items.length).map((f, s) => A(f, t.items[s], r));
      else
        return e.map((f) => A(f, t.items, r));
    return e;
  }
  return e;
}

class X {
  sides;
  constructor(e) {
    this.sides = e;
  }
}
function N(e, t) {
  if (e === null || typeof e !== "object" || t === null || typeof t !== "object")
    return e;
  if (Array.isArray(e)) {
    let u = t.items;
    if (u === null || typeof u !== "object")
      return e;
    return e.map((a, f) => N(a, Array.isArray(u) ? u[f] : u));
  }
  let r = t.properties && typeof t.properties === "object" ? t.properties : null, n = t.additionalProperties;
  if (!r && n !== false && (n === null || typeof n !== "object"))
    return e;
  let i = {};
  for (let u of Object.keys(e)) {
    let a = r !== null && O(r, u);
    if (!a && n === false)
      continue;
    W(i, u, N(e[u], a ? r[u] : n));
  }
  return i;
}
function I(e, t) {
  if (e === true || e == null || typeof e !== "object")
    return t;
  if (t === true || t == null || typeof t !== "object")
    return e;
  let r = (i) => Array.isArray(i.anyOf) || Array.isArray(i.oneOf);
  if (r(e) && r(t))
    return new X([e, t]);
  let n = { ...e, ...t };
  if (e.properties || t.properties) {
    let i = { ...e.properties, ...t.properties };
    if (e.properties && t.properties) {
      for (let u of Object.keys(t.properties))
        if (O(e.properties, u))
          i[u] = I(e.properties[u], t.properties[u]);
    }
    for (let u of [e, t]) {
      if (u.additionalProperties !== false)
        continue;
      for (let a of Object.keys(i))
        if (!u.properties || !O(u.properties, a))
          delete i[a];
    }
    n.properties = i;
  }
  if (e.items && t.items && typeof e.items === "object" && typeof t.items === "object" && !Array.isArray(e.items) && !Array.isArray(t.items))
    n.items = I(e.items, t.items);
  if (n.additionalProperties = e.additionalProperties === false || t.additionalProperties === false ? false : t.additionalProperties ?? e.additionalProperties, n.additionalProperties === undefined)
    delete n.additionalProperties;
  return n;
}
var Y = (e, t, r, n) => {
  try {
    return b(e, r, { strict: n }) && (t === null || b(e, t, { strict: n }));
  } catch {
    return false;
  }
};
function Ee(e, t, r, n) {
  for (let i of t) {
    let u = A(e, I(r, i), n);
    if (Y(u, r, i, n))
      return u;
  }
  return N(e, r);
}
function je(e, t, r, n) {
  let i = [];
  for (let o of t) {
    if (Y(e, r, o, n))
      i.push(o);
    if (i.length > 1)
      break;
  }
  if (i.length === 1)
    return A(e, I(r, i[0]), n);
  if (i.length > 1)
    return e;
  let u = (o) => {
    if (o === null || typeof o !== "object")
      return 0;
    let p = 0;
    for (let y in o)
      if (O(o, y))
        p += 1 + u(o[y]);
    return p;
  }, a = null, f = -1, s = false;
  for (let o of t) {
    let p = A(e, I(r, o), n);
    if (!Y(p, r, o, n))
      continue;
    let y = u(p);
    if (y > f)
      a = p, f = y, s = false;
    else if (y === f)
      s = true;
  }
  return a !== null && !s ? a : N(e, r);
}
var ke = new Set(["title", "description", "default", "examples", "$counterexamples", "$inferred", "$schema", "$id", "$comment", "deprecated", "readOnly", "writeOnly"]);
var Pe = [["type", (e) => typeof e === "string" || Array.isArray(e) && e.every((t) => typeof t === "string"), "a string or array of strings"], ["anyOf", Array.isArray, "an array"], ["oneOf", Array.isArray, "an array"], ["required", (e) => Array.isArray(e) && e.every((t) => typeof t === "string"), "an array of strings"], ["enum", Array.isArray, "an array"], ["properties", (e) => e !== null && typeof e === "object" && !Array.isArray(e), "an object"], ["items", (e) => e !== null && typeof e === "object", "a schema or array"], ["additionalProperties", (e) => typeof e === "boolean" || e !== null && typeof e === "object", "a boolean or schema"], ["pattern", (e) => typeof e === "string", "a string"], ["format", (e) => typeof e === "string", "a string"], ["$predicate", (e) => typeof e === "string", "a string"], ...["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "minItems", "maxItems", "minProperties", "maxProperties"].map((e) => [e, (t) => typeof t === "number", "a number"])];
var Oe = [["minLength", ["string"]], ["maxLength", ["string"]], ["pattern", ["string"]], ["format", ["string"]], ["minimum", ["number", "integer"]], ["maximum", ["number", "integer"]], ["exclusiveMinimum", ["number", "integer"]], ["exclusiveMaximum", ["number", "integer"]], ["multipleOf", ["number", "integer"]], ["items", ["array"]], ["minItems", ["array"]], ["maxItems", ["array"]], ["properties", ["object"]], ["required", ["object"]], ["additionalProperties", ["object"]], ["minProperties", ["object"]], ["maxProperties", ["object"]]];
var Re = [...Oe.map(([e]) => e), "enum", "$predicate"];

// node_modules/tjs-lang/src/lang/atom-contract.ts
function contractOf(inputSchema) {
  const sc = F(inputSchema) ? inputSchema.schema : inputSchema;
  const props = sc?.properties;
  if (!props || typeof props !== "object")
    return;
  return {
    keys: sc.additionalProperties === false ? Object.keys(props) : null,
    required: Array.isArray(sc.required) ? sc.required : []
  };
}

// node_modules/tjs-lang/src/vm/core-atom-inputs.ts
var CORE_ATOM_INPUTS = {
  Error: { keys: ["args"], required: [] },
  agentRun: { keys: ["agentId", "input"], required: ["agentId", "input"] },
  cache: { keys: ["key", "steps", "ttlMs"], required: ["key", "steps"] },
  callLocal: { keys: ["name", "args"], required: ["name", "args"] },
  clearExpiredProcedures: { keys: [], required: [] },
  consoleError: { keys: ["message"], required: ["message"] },
  consoleLog: { keys: ["message"], required: ["message"] },
  consoleWarn: { keys: ["message"], required: ["message"] },
  constSet: { keys: ["key", "value"], required: ["key", "value"] },
  evaluate: { keys: ["value"], required: ["value"] },
  filter: {
    keys: ["items", "as", "condition"],
    required: ["items", "as", "condition"]
  },
  find: {
    keys: ["items", "as", "condition"],
    required: ["items", "as", "condition"]
  },
  hash: { keys: ["value", "algorithm"], required: ["value"] },
  httpFetch: {
    keys: ["url", "method", "headers", "body", "responseType"],
    required: ["url"]
  },
  if: { keys: ["condition", "then", "else"], required: ["condition", "then"] },
  join: { keys: ["list", "sep"], required: ["list", "sep"] },
  jsonParse: { keys: ["str"], required: ["str"] },
  jsonStringify: { keys: ["value"], required: ["value"] },
  keys: { keys: ["obj"], required: ["obj"] },
  len: { keys: ["list"], required: ["list"] },
  llmPredict: { keys: ["prompt", "options"], required: ["prompt"] },
  map: {
    keys: ["items", "as", "steps", "loop"],
    required: ["items", "as", "steps"]
  },
  memoize: { keys: ["key", "steps"], required: ["key", "steps"] },
  merge: { keys: ["a", "b"], required: ["a", "b"] },
  omit: { keys: ["obj", "keys"], required: ["obj", "keys"] },
  pick: { keys: ["obj", "keys"], required: ["obj", "keys"] },
  push: { keys: ["list", "item"], required: ["list", "item"] },
  random: { keys: ["min", "max", "format", "length"], required: [] },
  reduce: {
    keys: ["items", "as", "accumulator", "initial", "steps"],
    required: ["items", "as", "accumulator", "initial", "steps"]
  },
  regexMatch: { keys: ["pattern", "value"], required: ["pattern", "value"] },
  releaseProcedure: { keys: ["token"], required: ["token"] },
  runCode: { keys: ["code", "args"], required: ["code"] },
  scope: { keys: ["steps"], required: ["steps"] },
  seq: { keys: ["steps"], required: ["steps"] },
  split: { keys: ["str", "sep"], required: ["str", "sep"] },
  storeGet: { keys: ["key"], required: ["key"] },
  storeProcedure: { keys: ["ast", "ttl", "maxSize"], required: ["ast"] },
  storeQuery: { keys: ["query"], required: ["query"] },
  storeQueryWhere: {
    keys: ["predicate", "collection", "limit"],
    required: ["predicate"]
  },
  storeSet: { keys: ["key", "value"], required: ["key", "value"] },
  storeVectorSearch: {
    keys: ["collection", "vector", "k"],
    required: ["vector"]
  },
  template: { keys: ["tmpl", "vars"], required: ["tmpl", "vars"] },
  transpileCode: { keys: ["code"], required: ["code"] },
  try: { keys: ["try", "catch", "catchParam", "finally"], required: ["try"] },
  uuid: { keys: [], required: [] },
  varAssign: { keys: ["key", "value"], required: ["key", "value"] },
  varGet: { keys: ["key"], required: ["key"] },
  varSet: { keys: ["key", "value"], required: ["key", "value"] },
  varsExport: { keys: ["keys"], required: ["keys"] },
  varsImport: { keys: ["keys"], required: ["keys"] },
  while: { keys: ["condition", "body"], required: ["condition", "body"] },
  xmlParse: { keys: ["str"], required: ["str"] }
};

// node_modules/tjs-lang/src/vm/ast-version.ts
var AST_VERSION = 2;
var BUILDER_AST_VERSION = 1;
var AST_VERSION_LEGACY = 1;
var AST_VERSION_KEY = "$ajs";
function astVersionOf(ast) {
  const root = ast;
  if (root == null || typeof root !== "object" || !(AST_VERSION_KEY in root))
    return AST_VERSION_LEGACY;
  const raw = root[AST_VERSION_KEY];
  return Number.isSafeInteger(raw) && raw >= 1 ? raw : null;
}
function describeRaw(raw) {
  let text;
  try {
    text = typeof raw === "bigint" ? `${raw}n` : JSON.stringify(raw) ?? String(raw);
  } catch {
    text = `<${typeof raw}, not serialisable>`;
  }
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}
function astVersionProblem(ast) {
  const version = astVersionOf(ast);
  if (version === null)
    return `This AST's \`${AST_VERSION_KEY}\` field is present but unreadable ` + `(${describeRaw(ast[AST_VERSION_KEY])}) — ` + `not a format version. A version must be a positive integer. Refusing to run it ` + `rather than guess: a present field means something that stamps versions wrote this ` + `AST, so reading it as legacy would be a guess, not a fallback. A stringified number ` + `usually means a codec converted it in transit.`;
  if (version === AST_VERSION)
    return null;
  if (version < AST_VERSION)
    return null;
  return `This AST declares format version ${version}, but this build of tjs-lang understands ` + `at most ${AST_VERSION}. Refusing to run it rather than guess at ops it may use that ` + `this interpreter does not implement. Upgrade tjs-lang, or re-transpile the source ` + `with this version.`;
}
function checkAstVersion(ast, where) {
  const problem = astVersionProblem(ast);
  if (problem)
    throw new Error(`${where}: ${problem}`);
}

// node_modules/tjs-lang/src/vm/guest-methods.ts
var GUEST_METHODS = new Set([
  "abs",
  "acos",
  "acosh",
  "add",
  "array",
  "asin",
  "asinh",
  "assign",
  "at",
  "atan",
  "atan2",
  "atanh",
  "cbrt",
  "ceil",
  "charAt",
  "charCodeAt",
  "clear",
  "clz32",
  "codePointAt",
  "concat",
  "const",
  "copyWithin",
  "cos",
  "cosh",
  "diff",
  "endsWith",
  "entries",
  "enum",
  "error",
  "exp",
  "expm1",
  "fill",
  "flat",
  "floor",
  "format",
  "from",
  "fromCharCode",
  "fromCodePoint",
  "fromEntries",
  "fromExample",
  "fround",
  "getDate",
  "getDay",
  "getFullYear",
  "getHours",
  "getMilliseconds",
  "getMinutes",
  "getMonth",
  "getSeconds",
  "getTime",
  "getTimezoneOffset",
  "getUTCDate",
  "getUTCDay",
  "getUTCFullYear",
  "getUTCHours",
  "getUTCMilliseconds",
  "getUTCMinutes",
  "getUTCMonth",
  "getUTCSeconds",
  "getYear",
  "has",
  "hasOwn",
  "hasOwnProperty",
  "hypot",
  "imul",
  "includes",
  "indexOf",
  "infer",
  "info",
  "intersection",
  "isAfter",
  "isArray",
  "isBefore",
  "isFinite",
  "isInteger",
  "isNaN",
  "isSafeInteger",
  "isValid",
  "isWellFormed",
  "join",
  "keys",
  "lastIndexOf",
  "localeCompare",
  "log",
  "log10",
  "log1p",
  "log2",
  "match",
  "max",
  "min",
  "normalize",
  "now",
  "object",
  "of",
  "padEnd",
  "padStart",
  "parse",
  "parseFloat",
  "parseInt",
  "pop",
  "pow",
  "propertyIsEnumerable",
  "push",
  "random",
  "record",
  "remove",
  "repeat",
  "replace",
  "replaceAll",
  "response",
  "reverse",
  "round",
  "search",
  "setDate",
  "setFullYear",
  "setHours",
  "setMilliseconds",
  "setMinutes",
  "setMonth",
  "setSeconds",
  "setTime",
  "setUTCDate",
  "setUTCFullYear",
  "setUTCHours",
  "setUTCMilliseconds",
  "setUTCMinutes",
  "setUTCMonth",
  "setUTCSeconds",
  "setYear",
  "shift",
  "sign",
  "sin",
  "sinh",
  "slice",
  "sort",
  "splice",
  "split",
  "sqrt",
  "startsWith",
  "stringify",
  "substr",
  "substring",
  "tan",
  "tanh",
  "toArray",
  "toDateString",
  "toExponential",
  "toFixed",
  "toGMTString",
  "toISOString",
  "toJSON",
  "toLocaleDateString",
  "toLocaleLowerCase",
  "toLocaleString",
  "toLocaleTimeString",
  "toLocaleUpperCase",
  "toLowerCase",
  "toPrecision",
  "toReversed",
  "toSorted",
  "toSpliced",
  "toString",
  "toTimeString",
  "toUTCString",
  "toUpperCase",
  "toWellFormed",
  "trim",
  "trimEnd",
  "trimLeft",
  "trimRight",
  "trimStart",
  "trunc",
  "tuple",
  "union",
  "unshift",
  "valueOf",
  "values",
  "warn",
  "with"
]);

// node_modules/tjs-lang/src/lang/emitters/ast.ts
function typeToJsonSchema(type, refuse) {
  const base = kindToJsonSchema(type, refuse);
  return type.nullable ? { anyOf: [base, { type: "null" }] } : base;
}
function kindToJsonSchema(type, refuse) {
  const kind = type.kind;
  switch (kind) {
    case "string":
      if (type.pattern)
        refuse(`a regex example (${type.pattern}) cannot be part of an agent's contract: ` + `guest schemas may not carry host regex patterns. Take a string ('') and check ` + `it in the body with regexMatch.`);
      return { type: "string" };
    case "number":
      return { type: "number" };
    case "integer":
      return { type: "integer" };
    case "non-negative-integer":
      return { type: "integer", minimum: 0 };
    case "literal-union":
      return literalUnionSchema(type.values ?? []);
    case "boolean":
      return { type: "boolean" };
    case "null":
      return {};
    case "undefined":
      return {};
    case "any":
      return {};
    case "array":
      return {
        type: "array",
        items: type.items ? typeToJsonSchema(type.items, refuse) : {}
      };
    case "object":
      if (type.shape && Object.keys(type.shape).length > 0) {
        const properties = {};
        for (const [key, propType] of Object.entries(type.shape)) {
          properties[key] = typeToJsonSchema(propType, refuse);
        }
        const required = Object.entries(type.shape).filter(([, t]) => !mayBeAbsent(t)).map(([key]) => key);
        return {
          type: "object",
          properties,
          additionalProperties: false,
          ...required.length > 0 && { required }
        };
      }
      return { type: "object" };
    case "union":
      if (type.members) {
        const present = type.members.filter((m) => m.kind !== "undefined");
        if (present.length === 0)
          return {};
        if (present.length === 1)
          return typeToJsonSchema(present[0], refuse);
        return { anyOf: present.map((m) => typeToJsonSchema(m, refuse)) };
      }
      return {};
    case "bigint":
      return refuse(`an agent's inputs and result are JSON, which has no bigint. Take a string ('') or a ` + `number (0) and convert it in the body.`);
    case "function":
      return refuse(`an agent's inputs and result are JSON, which cannot carry a function. Pass data, and ` + `give the agent the behaviour as an atom (a capability) instead.`);
    case "declared":
    case "declared-import":
      return refuse(`the named type ${type.typeName ?? ""} cannot be checked in an agent's ` + `contract. Use an example value instead.`);
    default: {
      const unhandled = kind;
      throw new Error(`tjs internal error: no input schema for kind ${unhandled}`);
    }
  }
}
function literalUnionSchema(values) {
  const typeOf = (v) => v === null ? "null" : typeof v === "string" ? "string" : typeof v;
  const byType = new Map;
  for (const v of values) {
    const t = typeOf(v);
    byType.set(t, [...byType.get(t) ?? [], v]);
  }
  const branches = [...byType].map(([t, vs]) => ({ type: t, enum: vs }));
  return branches.length === 1 ? branches[0] : { anyOf: branches };
}
function mayBeAbsent(t) {
  if (t.kind === "undefined")
    return true;
  return t.kind === "union" && (t.members ?? []).some(mayBeAbsent);
}
function returnTypeToJsonSchema(type, refuse) {
  const objectLike = (t) => t.kind === "object" || t.kind === "any" || t.kind === "union" && (t.members ?? []).every(objectLike);
  if (!objectLike(type))
    refuse(`an agent returns an object, so a declared ${type.kind} result can never be met. ` + `Declare the object it returns, e.g. ): { value: 0 }`);
  return typeToJsonSchema(type, refuse);
}
function parametersToJsonSchema(parameters, refuse) {
  const properties = {};
  const required = [];
  for (const [name, param] of Object.entries(parameters)) {
    properties[name] = typeToJsonSchema(param.type, (why) => refuse(name, why));
    if (param.required && !mayBeAbsent(param.type)) {
      required.push(name);
    }
  }
  return {
    type: "object",
    properties,
    required: required.length > 0 ? required : undefined,
    additionalProperties: Object.keys(properties).length === 0 ? undefined : false
  };
}
function transformFunction(func, source, returnTypeAnnotation, options = {}, requiredParamsFromPreprocess, helpers, requiredValueOffsets, helperReturnTypes) {
  const tdoc = extractTDoc(source, func);
  const requiredHere = new Set;
  if (requiredValueOffsets?.size) {
    const collect = (p) => {
      if (!p)
        return;
      if (p.type === "AssignmentPattern" && p.right && p.left?.name) {
        if (requiredValueOffsets.has(p.right.end)) {
          if (orInType(p.right))
            throw new TranspileError(orInTypeMessage(typeText(p.right)), getLocation(p.right), source);
          requiredHere.add(p.left.name);
        }
        return;
      }
      if (p.type === "ObjectPattern") {
        for (const prop of p.properties ?? []) {
          if (prop?.type === "RestElement")
            continue;
          collect(prop.value);
        }
        return;
      }
      if (p.type === "ArrayPattern") {
        for (const el of p.elements ?? [])
          collect(el);
      }
    };
    for (const param of func.params ?? [])
      collect(param);
  }
  if (requiredHere.size === 0 && requiredParamsFromPreprocess) {
    for (const n of requiredParamsFromPreprocess)
      requiredHere.add(n);
  }
  const parameters = new Map;
  for (const param of func.params) {
    const ex = param.type === "AssignmentPattern" ? param.right : null;
    if (ex?.type === "Literal" && ex.regex)
      throw new TranspileError(`Parameter '${param.left?.name ?? "?"}': a regex example cannot be part of an ` + `agent's input contract (guest schemas may not carry host regex patterns). Take a ` + `string ('') and check it in the body with regexMatch.`, getLocation(param), source, options.filename || "<source>");
    const parsed = parseParameter(param, requiredHere);
    if (param.type === "ObjectPattern" && parsed.type.destructuredParams) {
      for (const prop of param.properties)
        if (prop.type === "Property" && !prop.shorthand && !prop.computed && prop.key.type === "Identifier" && prop.value.type === "Identifier" && typeForName(prop.value.name)) {
          const type = typeForName(prop.value.name);
          parsed.type.destructuredParams[prop.key.name] = {
            name: prop.key.name,
            type,
            required: true
          };
          if (parsed.type.shape)
            parsed.type.shape[prop.key.name] = type;
        } else if (prop.type === "Property" && !prop.shorthand && !prop.computed && prop.key.type === "Identifier" && prop.value.type === "Identifier") {
          throw new TranspileError(`Parameter '${prop.key.name}': '${prop.value.name}' is not a type AJS knows. ` + `Write an example (${prop.key.name}: 0 for an integer, ${prop.key.name}: 0.0 for any ` + `number, ${prop.key.name}: '' for a string) or a known type name (string, number, ` + `int, unsigned, float, boolean, object, any).`, getLocation(prop), source, options.filename || "<source>");
        }
    }
    if (parsed.name === "__destructured__" && parsed.type.kind === "object" && parsed.type.destructuredParams) {
      for (const [key, paramDesc] of Object.entries(parsed.type.destructuredParams)) {
        parameters.set(key, {
          ...paramDesc,
          description: tdoc.params[key]
        });
      }
    } else {
      parsed.description = tdoc.params[parsed.name];
      parameters.set(parsed.name, parsed);
    }
  }
  let returnType;
  if (returnTypeAnnotation) {
    returnType = parseReturnType(returnTypeAnnotation);
  }
  const ctx = {
    depth: 0,
    locals: new Map,
    parameters,
    atoms: new Set(Object.keys(options.atoms || {})),
    warnings: [],
    source,
    filename: options.filename || "<source>",
    options,
    helpers,
    helperSteps: helpers ? new Map : undefined,
    helperReturnTypes,
    helperTransforming: helpers ? new Set : undefined,
    regexCompiler: new RegexCompiler(source.length)
  };
  const hoisted = hoistedVars(func.body, new Set(parameters.keys()), ctx);
  const bodySteps = transformBlock(func.body, ctx);
  const steps = [];
  const requiredParams = [];
  const optionalParams = [];
  for (const [name, param] of parameters.entries()) {
    if (param.required) {
      requiredParams.push(name);
    } else if (param.default !== undefined) {
      optionalParams.push({ name, defaultValue: param.default });
    } else {
      requiredParams.push(name);
    }
  }
  if (requiredParams.length > 0) {
    steps.push({
      op: "varsImport",
      keys: requiredParams
    });
  }
  for (const { name, defaultValue } of optionalParams) {
    steps.push({
      op: "varsImport",
      keys: [name]
    });
    steps.push({
      op: "if",
      condition: {
        $expr: "binary",
        op: "==",
        left: { $expr: "ident", name },
        right: { $expr: "literal", value: null }
      },
      then: [
        {
          op: "varAssign",
          key: name,
          value: defaultValue
        }
      ]
    });
  }
  steps.push(...hoisted);
  steps.push(...bodySteps);
  if (steps[steps.length - 1]?.op !== "return")
    steps.push({ op: "return", value: {} });
  const signatureParams = Object.fromEntries(parameters);
  const signature = {
    name: func.id?.name || "anonymous",
    description: tdoc.description,
    parameters: signatureParams,
    returns: returnType
  };
  const inputSchema = parametersToJsonSchema(signatureParams, (name, why) => {
    throw new TranspileError(`Parameter '${name}': ${why}`, getLocation(func), ctx.source, ctx.filename);
  });
  const outputSchema = returnType ? returnTypeToJsonSchema(returnType, (why) => {
    throw new TranspileError(`Declared result: ${why}`, getLocation(func), ctx.source, ctx.filename);
  }) : undefined;
  const helperBodies = ctx.helperSteps && ctx.helperSteps.size > 0 ? Object.fromEntries(ctx.helperSteps) : undefined;
  return {
    ast: {
      [AST_VERSION_KEY]: AST_VERSION,
      op: "seq",
      steps,
      inputSchema,
      ...outputSchema && { outputSchema },
      ...helperBodies && { helpers: helperBodies }
    },
    signature,
    warnings: ctx.warnings
  };
}
function transformBlock(block, ctx) {
  const steps = [];
  for (const stmt of block.body) {
    const transformed = transformStatement(stmt, ctx);
    if (transformed) {
      if (Array.isArray(transformed)) {
        steps.push(...transformed);
      } else {
        steps.push(transformed);
      }
    }
  }
  return steps;
}
function transformStatement(stmt, ctx) {
  switch (stmt.type) {
    case "VariableDeclaration":
      return transformVariableDeclaration(stmt, ctx);
    case "ExpressionStatement":
      return transformExpressionStatement(stmt, ctx);
    case "IfStatement":
      return transformIfStatement(stmt, ctx);
    case "WhileStatement":
      return transformWhileStatement(stmt, ctx);
    case "ForOfStatement":
      return transformForOfStatement(stmt, ctx);
    case "TryStatement":
      return transformTryStatement(stmt, ctx);
    case "ReturnStatement":
      return transformReturnStatement(stmt, ctx);
    case "ThrowStatement":
      throw new TranspileError(`'throw' is not supported in AsyncJS. Use Error('message') to trigger error flow`, getLocation(stmt), ctx.source, ctx.filename);
    case "BlockStatement":
      return {
        op: "scope",
        steps: transformBlock(stmt, createChildContext(ctx))
      };
    case "EmptyStatement":
      return null;
    default:
      throw new TranspileError(`Unsupported statement type: ${stmt.type}${remedyFor(stmt.type)}`, getLocation(stmt), ctx.source, ctx.filename);
  }
}
var CONSTRUCT_REMEDIES = {
  ForStatement: `AJS has no \`for\` loops. Use \`while\` with a counter:
  let i = 0
  while (i < items.length) {
    // ...
    i = i + 1
  }`,
  ForInStatement: `AJS has no \`for...in\`. Walk the keys with \`for...of\`:
  for (const k of Object.keys(data)) {
    // ...
  }`,
  SwitchStatement: `AJS has no \`switch\`. Use \`if\`/\`else if\`:
  if (kind == 'a') {
    // ...
  } else if (kind == 'b') {
    // ...
  }`,
  DoWhileStatement: `AJS has no \`do...while\`. Use \`while\`; to run the body at least once, test a flag:
  let i = 0
  let again = true
  while (again) {
    // ...
    i = i + 1
    again = i < n
  }`,
  BreakStatement: `AJS has no \`break\`. End the loop through its own test:
  let i = 0
  let done = false
  while (!done && i < items.length) {
    if (items[i] == kind) { done = true } else { i = i + 1 }
  }`,
  ContinueStatement: `AJS has no \`continue\`. Put the rest of the body under \`if\`:
  let i = 0
  while (i < items.length) {
    let skip = items[i] == kind
    i = i + 1
    if (!skip) {
      // ...
    }
  }`
};
function remedyFor(type) {
  const remedy = CONSTRUCT_REMEDIES[type];
  return remedy ? `. ${remedy}` : "";
}
function regexNode(lit, ctx) {
  const rx = lit.regex;
  if (!rx)
    return;
  try {
    ctx.regexCompiler.compile(rx.pattern, rx.flags);
  } catch (e) {
    if (!(e instanceof RegexError))
      throw e;
    throw new TranspileError(e.message, getLocation(lit), ctx.source, ctx.filename);
  }
  return { $expr: "regex", pattern: rx.pattern, flags: rx.flags };
}
function hoistedVars(body, exclude, ctx) {
  const names = new Set;
  const walk = (node) => {
    if (!node || typeof node !== "object")
      return;
    if (Array.isArray(node))
      return node.forEach(walk);
    if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression")
      return;
    if (node.type === "VariableDeclaration" && node.kind === "var") {
      for (const d of node.declarations)
        if (d.id?.type === "Identifier" && !exclude.has(d.id.name))
          names.add(d.id.name);
    }
    for (const key of Object.keys(node))
      if (key !== "loc" && key !== "range")
        walk(node[key]);
  };
  walk(body);
  if (ctx)
    for (const name of names)
      ctx.locals.set(name, { kind: "any" });
  return [...names].map((key) => ({ op: "varSet", key, value: null }));
}
function transformVariableDeclaration(decl, ctx) {
  if (decl.kind === "var")
    return transformVarAsAssignment(decl, ctx);
  const steps = [];
  const isConst = decl.kind === "const";
  const opName = isConst ? "constSet" : "varSet";
  for (const declarator of decl.declarations) {
    if (declarator.id.type !== "Identifier") {
      throw new TranspileError("Only simple variable names are supported", getLocation(declarator), ctx.source, ctx.filename);
    }
    const name = declarator.id.name;
    if (declarator.init) {
      const { step, resultVar } = transformExpressionToStep(declarator.init, ctx, name, isConst);
      if (step) {
        steps.push(step);
      } else if (resultVar !== name) {
        steps.push({
          op: opName,
          key: name,
          value: resultVar
        });
      }
      const type = inferTypeFromValue(declarator.init);
      ctx.locals.set(name, type);
      if (isConst)
        (ctx.consts ??= new Set).add(name);
    } else {
      if (isConst) {
        throw new TranspileError("const declarations must be initialized", getLocation(declarator), ctx.source, ctx.filename);
      }
      steps.push({
        op: "varSet",
        key: name,
        value: null
      });
      ctx.locals.set(name, { kind: "any", nullable: true });
    }
  }
  return steps;
}
function transformVarAsAssignment(decl, ctx) {
  const steps = [];
  for (const declarator of decl.declarations) {
    if (declarator.id.type !== "Identifier")
      throw new TranspileError("Only simple variable names are supported", getLocation(declarator), ctx.source, ctx.filename);
    if (!declarator.init)
      continue;
    const name = declarator.id.name;
    steps.push(...[
      transformAssignment({
        type: "AssignmentExpression",
        operator: "=",
        left: declarator.id,
        right: declarator.init,
        start: declarator.start,
        end: declarator.end,
        loc: declarator.loc
      }, ctx)
    ].flat());
    ctx.locals.set(name, inferTypeFromValue(declarator.init));
  }
  return steps;
}
function transformExpressionStatement(stmt, ctx) {
  const expr = stmt.expression;
  if (expr.type === "AssignmentExpression") {
    return transformAssignment(expr, ctx);
  }
  if (expr.type === "UpdateExpression") {
    const up = expr;
    if (up.argument.type !== "Identifier")
      throw new TranspileError(`'${up.operator}' is supported only on a simple variable`, getLocation(expr), ctx.source, ctx.filename);
    return transformAssignment({
      ...up,
      type: "AssignmentExpression",
      operator: up.operator === "++" ? "+=" : "-=",
      left: up.argument,
      right: { ...up.argument, type: "Literal", value: 1, raw: "1" }
    }, ctx);
  }
  if (expr.type === "CallExpression") {
    const callee = expr.callee;
    if (callee?.type === "MemberExpression" && callee.object?.type === "Identifier" && callee.object.name === "Object" && callee.property?.name === "assign") {
      const target = expr.arguments[0];
      const name = target?.type === "Identifier" ? target.name : "o";
      ctx.warnings.push({
        message: `Object.assign does not change its first argument in AJS; it returns a new object, ` + `and this statement discards it. Keep the result: ${name} = Object.assign(${name}, …)`,
        line: getLocation(stmt).line,
        column: getLocation(stmt).column
      });
    }
    const { step, resultVar } = transformExpressionToStep(expr, ctx);
    if (step) {
      return step;
    }
    if (resultVar) {
      return { op: "evaluate", value: resultVar };
    }
    return null;
  }
  if (expr.type === "NewExpression") {
    const callee = expr.callee;
    const name = callee?.type === "Identifier" ? callee.name : "constructor";
    throw new TranspileError(`The 'new' keyword is not supported in AsyncJS.${getNewExpressionSuggestion(name)}`, getLocation(expr), ctx.source, ctx.filename);
  }
  ctx.warnings.push({
    message: "Expression statement has no effect",
    line: getLocation(stmt).line,
    column: getLocation(stmt).column
  });
  return null;
}
function transformAssignment(expr, ctx) {
  if (expr.left.type !== "Identifier") {
    throw new TranspileError("Only simple variable assignment is supported", getLocation(expr), ctx.source, ctx.filename);
  }
  const name = expr.left.name;
  for (let c = ctx;c; c = c.parent) {
    if (!c.locals.has(name))
      continue;
    if (c.consts?.has(name))
      throw new TranspileError(`'${name}' is a const, so it cannot be assigned. Declare it with let if it changes:
` + `  let ${name} = …`, getLocation(expr), ctx.source, ctx.filename);
    break;
  }
  let right = expr.right;
  if (expr.operator !== "=") {
    const op = expr.operator.slice(0, -1);
    const logical = op === "||" || op === "&&" || op === "??";
    right = {
      ...expr,
      type: logical ? "LogicalExpression" : "BinaryExpression",
      operator: op,
      left: expr.left,
      right: expr.right
    };
  }
  const { step, resultVar } = transformExpressionToStep(right, ctx, name);
  if (lookupVariable(name, ctx) === undefined && !AJS_GLOBAL_NAMES.has(name) && !ctx.options.globals?.includes(name))
    throw new TranspileError(`'${name}' is not declared, so assigning to it would create a new variable silently. ` + `Declare it with let (let ${name} = …), or check the spelling.`, getLocation(expr), ctx.source, ctx.filename);
  if (step) {
    const st = step;
    if (st.op === "varSet" && st.key === name)
      return { op: "varAssign", key: name, value: st.value };
    if (st.result === name)
      return { ...st, resultAssign: true };
    throw new TranspileError(`Internal: cannot compile this assignment to '${name}' (step '${st.op}')`, getLocation(expr), ctx.source, ctx.filename);
  }
  return {
    op: "varAssign",
    key: name,
    value: resultVar
  };
}
function transformIfStatement(stmt, ctx) {
  const condition = expressionToExprNode(stmt.test, ctx);
  const thenSteps = stmt.consequent.type === "BlockStatement" ? transformBlock(stmt.consequent, createChildContext(ctx)) : [transformStatement(stmt.consequent, ctx)].filter(Boolean);
  let elseSteps;
  if (stmt.alternate) {
    elseSteps = stmt.alternate.type === "BlockStatement" ? transformBlock(stmt.alternate, createChildContext(ctx)) : [transformStatement(stmt.alternate, ctx)].filter(Boolean);
  }
  return {
    op: "if",
    condition,
    then: thenSteps,
    ...elseSteps && { else: elseSteps }
  };
}
function transformWhileStatement(stmt, ctx) {
  const condition = expressionToExprNode(stmt.test, ctx);
  const body = stmt.body.type === "BlockStatement" ? transformBlock(stmt.body, createChildContext(ctx)) : [transformStatement(stmt.body, ctx)].filter(Boolean);
  return {
    op: "while",
    condition,
    body
  };
}
function transformForOfStatement(stmt, ctx) {
  if (stmt.left.type !== "VariableDeclaration" || stmt.left.kind === "var")
    throw new TranspileError("for...of in AsyncJS needs `const` or `let`: `for (const x of items)`", getLocation(stmt.left), ctx.source, ctx.filename);
  const decl = stmt.left.declarations[0];
  if (decl.id.type !== "Identifier") {
    throw new TranspileError("Only simple variable names are supported in for...of", getLocation(stmt.left), ctx.source, ctx.filename);
  }
  const varName = decl.id.name;
  const items = expressionToValue(stmt.right, ctx);
  const childCtx = createChildContext(ctx);
  childCtx.locals.set(varName, { kind: "any" });
  const steps = stmt.body.type === "BlockStatement" ? transformBlock(stmt.body, childCtx) : [transformStatement(stmt.body, childCtx)].filter(Boolean);
  return {
    op: "map",
    items,
    as: varName,
    steps,
    loop: true
  };
}
function transformTryStatement(stmt, ctx) {
  const trySteps = transformBlock(stmt.block, createChildContext(ctx));
  let catchSteps;
  let catchParam;
  if (stmt.handler) {
    const catchCtx = createChildContext(ctx);
    if (stmt.handler.param?.type === "Identifier") {
      catchParam = stmt.handler.param.name;
      catchCtx.locals.set(catchParam, {
        kind: "any"
      });
    }
    catchCtx.locals.set("errorOp", { kind: "any" });
    catchSteps = transformBlock(stmt.handler.body, catchCtx);
  }
  const finallySteps = stmt.finalizer ? transformBlock(stmt.finalizer, createChildContext(ctx)) : undefined;
  return {
    op: "try",
    try: trySteps,
    ...catchSteps && { catch: catchSteps },
    ...catchParam && { catchParam },
    ...finallySteps && { finally: finallySteps }
  };
}
function propertyKeyName(prop, ctx) {
  if (prop.computed && prop.key.type !== "Literal")
    throw new TranspileError(`A computed key ([…]) is not supported in an AsyncJS object literal. ` + `Build the object with Object.fromEntries([[key, value]]) instead.`, getLocation(prop), ctx.source, ctx.filename);
  const key = prop.key.type === "Identifier" ? prop.key.name : String(prop.key.value);
  if (key === "__proto__")
    throw new TranspileError("'__proto__' is not allowed as an object key in AsyncJS", getLocation(prop), ctx.source, ctx.filename);
  return key;
}
function transformReturnStatement(stmt, ctx) {
  if (ctx.returnCheck)
    return checkedHelperReturn(stmt, ctx, ctx.returnCheck);
  if (!stmt.argument) {
    return { op: "return", value: {} };
  }
  const { step, resultVar } = transformExpressionToStep(stmt.argument, ctx, "__returnVal__");
  if (step) {
    return [
      step,
      {
        op: "return",
        value: typeof resultVar === "string" ? { $expr: "ident", name: resultVar } : resultVar
      }
    ];
  }
  const value = expressionToValue(stmt.argument, ctx);
  return { op: "return", value };
}
function helperReturnCheck(name, fn, ctx) {
  const annotation = ctx.helperReturnTypes?.[name];
  if (!annotation)
    return;
  const type = parseReturnType(annotation);
  if (!type || type.kind === "any")
    return;
  const schema = typeToJsonSchema(type, (why) => {
    throw new TranspileError(`Helper ${name}'s declared result: ${why}`, getLocation(fn), ctx.source, ctx.filename);
  });
  return { name, schema };
}
function checkedHelperReturn(stmt, ctx, check) {
  const RESULT = "__helperResult__";
  const steps = [];
  if (stmt.argument) {
    const { step, resultVar } = transformExpressionToStep(stmt.argument, ctx, RESULT);
    if (step)
      steps.push(step);
    else
      steps.push({
        op: "varSet",
        key: RESULT,
        value: resultVar ?? expressionToValue(stmt.argument, ctx)
      });
  } else
    steps.push({ op: "varSet", key: RESULT, value: {} });
  ctx.locals.set(RESULT, { kind: "any" });
  const guard = parse(`if (!Schema.isValid(${RESULT}, ${JSON.stringify(check.schema)})) { Error(${JSON.stringify(`helper ${check.name} returned a value that does not match its declared result`)}) }`, { ecmaVersion: "latest" });
  const inner = { ...ctx, returnCheck: undefined };
  const guardSteps = transformStatement(guard.body[0], inner);
  if (guardSteps)
    steps.push(...Array.isArray(guardSteps) ? guardSteps : [guardSteps]);
  steps.push({
    op: "return",
    value: { $expr: "ident", name: RESULT }
  });
  return steps;
}
var BUILTIN_OBJECTS = new Set([
  "Math",
  "JSON",
  "Array",
  "Object",
  "String",
  "Number",
  "console",
  "Date",
  "Schema"
]);
var BUILTIN_GLOBALS = new Set([
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "encodeURI",
  "decodeURI",
  "encodeURIComponent",
  "decodeURIComponent",
  "Set",
  "Date",
  "filter"
]);
var UNSUPPORTED_BUILTINS = new Set([
  "RegExp",
  "Promise",
  "Map",
  "WeakSet",
  "WeakMap",
  "Symbol",
  "Proxy",
  "Reflect",
  "Function",
  "eval",
  "setTimeout",
  "setInterval",
  "fetch",
  "require",
  "import",
  "process",
  "window",
  "document",
  "global",
  "globalThis"
]);
var INSTANCE_METHODS = GUEST_METHODS;
function isBuiltinCall(expr) {
  if (expr.callee.type === "Identifier") {
    const name = expr.callee.name;
    return BUILTIN_GLOBALS.has(name) || UNSUPPORTED_BUILTINS.has(name);
  }
  if (expr.callee.type === "MemberExpression") {
    const member = expr.callee;
    if (member.object.type === "Identifier") {
      const objName = member.object.name;
      if (BUILTIN_OBJECTS.has(objName) || UNSUPPORTED_BUILTINS.has(objName)) {
        return true;
      }
    }
    if (member.property.type === "Identifier") {
      const methodName = member.property.name;
      if (INSTANCE_METHODS.has(methodName)) {
        return true;
      }
    }
  }
  return false;
}
function isBuiltinMemberAccess(expr) {
  if (expr.object.type === "Identifier") {
    const objName = expr.object.name;
    return BUILTIN_OBJECTS.has(objName) || UNSUPPORTED_BUILTINS.has(objName);
  }
  return false;
}
var UNSUPPORTED_BUILTIN_MESSAGES = {
  RegExp: "RegExp is not available. Use string methods or the regexMatch atom.",
  Promise: "Promise is not needed. All operations are implicitly async.",
  Map: "Map is not available. Use plain objects instead.",
  WeakSet: "WeakSet is not available.",
  WeakMap: "WeakMap is not available.",
  Symbol: "Symbol is not available.",
  Proxy: "Proxy is not available.",
  Reflect: "Reflect is not available.",
  Function: "Function constructor is not available. Define functions normally.",
  eval: "eval is not available. Code is compiled, not evaluated.",
  setTimeout: "setTimeout is not available. Use the delay atom.",
  setInterval: "setInterval is not available. Use while loops with delay.",
  fetch: "fetch is not available. Use the httpFetch atom.",
  require: "require is not available. Atoms must be registered with the VM.",
  import: "import is not available. Atoms must be registered with the VM.",
  process: "process is not available. AsyncJS runs in a sandboxed environment.",
  window: "window is not available. AsyncJS runs in a sandboxed environment.",
  document: "document is not available. AsyncJS runs in a sandboxed environment.",
  global: "global is not available. AsyncJS runs in a sandboxed environment.",
  globalThis: "globalThis is not available. Use builtins directly."
};
function getUnsupportedBuiltinError(expr) {
  if (expr.callee.type === "Identifier") {
    const name = expr.callee.name;
    if (UNSUPPORTED_BUILTINS.has(name)) {
      return UNSUPPORTED_BUILTIN_MESSAGES[name] || `${name} is not available in AsyncJS.`;
    }
  }
  if (expr.callee.type === "MemberExpression") {
    const member = expr.callee;
    if (member.object.type === "Identifier") {
      const objName = member.object.name;
      if (UNSUPPORTED_BUILTINS.has(objName)) {
        return UNSUPPORTED_BUILTIN_MESSAGES[objName] || `${objName} is not available in AsyncJS.`;
      }
    }
  }
  return null;
}
function getNewExpressionSuggestion(constructorName) {
  const suggestions = {
    Date: " Use Date() or Date('2024-01-15') instead - no 'new' needed.",
    Set: " Use Set([items]) instead - no 'new' needed.",
    Map: " Use plain objects instead of Map.",
    Array: " Use array literals like [1, 2, 3] instead.",
    Object: " Use object literals like { key: value } instead.",
    Error: " Use Error('message') instead - no 'new' needed; it raises an error a try can catch.",
    RegExp: " Use string methods or the regexMatch atom.",
    Promise: " Not needed - all operations are implicitly async.",
    WeakSet: " WeakSet is not available.",
    WeakMap: " WeakMap is not available."
  };
  return suggestions[constructorName] || " Use factory functions or object literals instead.";
}
function transformExpressionToStep(expr, ctx, resultVar, isConst) {
  const varOp = isConst ? "constSet" : "varSet";
  if (expr.type === "ChainExpression") {
    const chain = expr;
    return transformExpressionToStep(chain.expression, ctx, resultVar, isConst);
  }
  if (expr.type === "NewExpression") {
    const newExpr = expr;
    let constructorName = "constructor";
    if (newExpr.callee.type === "Identifier") {
      constructorName = newExpr.callee.name;
    }
    const suggestion = getNewExpressionSuggestion(constructorName);
    throw new TranspileError(`The 'new' keyword is not supported in AsyncJS.${suggestion}`, getLocation(expr), ctx.source, ctx.filename);
  }
  if (expr.type === "CallExpression") {
    const unsupportedError = getUnsupportedBuiltinError(expr);
    if (unsupportedError) {
      throw new TranspileError(unsupportedError, getLocation(expr), ctx.source, ctx.filename);
    }
  }
  if (expr.type === "CallExpression" && isBuiltinCall(expr)) {
    const exprNode = expressionToExprNode(expr, ctx);
    if (resultVar) {
      return {
        step: {
          op: varOp,
          key: resultVar,
          value: exprNode
        },
        resultVar
      };
    }
    return { step: null, resultVar: exprNode };
  }
  if (expr.type === "MemberExpression" && isBuiltinMemberAccess(expr)) {
    const exprNode = expressionToExprNode(expr, ctx);
    if (resultVar) {
      return {
        step: {
          op: varOp,
          key: resultVar,
          value: exprNode
        },
        resultVar
      };
    }
    return { step: null, resultVar: exprNode };
  }
  if (expr.type === "CallExpression") {
    return transformCallExpression(expr, ctx, resultVar, isConst);
  }
  if (expr.type === "BinaryExpression" || expr.type === "LogicalExpression" || expr.type === "UnaryExpression") {
    const exprNode = expressionToExprNode(expr, ctx);
    if (resultVar) {
      return {
        step: {
          op: varOp,
          key: resultVar,
          value: exprNode
        },
        resultVar
      };
    }
    return { step: null, resultVar: exprNode };
  }
  const value = expressionToValue(expr, ctx);
  return { step: null, resultVar: value };
}
function transformCallExpression(expr, ctx, resultVar, isConst) {
  let funcName;
  let isMethodCall = false;
  let receiver;
  if (expr.callee.type === "Identifier") {
    funcName = expr.callee.name;
  } else if (expr.callee.type === "MemberExpression") {
    const member = expr.callee;
    if (member.property.type === "Identifier") {
      funcName = member.property.name;
      isMethodCall = true;
      receiver = expressionToValue(member.object, ctx);
    } else {
      throw new TranspileError("Computed method names are not supported", getLocation(expr), ctx.source, ctx.filename);
    }
  } else {
    throw new TranspileError("Only named function calls are supported", getLocation(expr), ctx.source, ctx.filename);
  }
  if (isMethodCall) {
    return transformMethodCall(funcName, receiver, expr.arguments, ctx, resultVar, isConst, getLocation(expr));
  }
  if (funcName === "console" && expr.callee.type === "MemberExpression") {}
  if (ctx.helpers?.has(funcName)) {
    const paramNames = ensureHelperTransformed(funcName, ctx, expr);
    const argExprs = expr.arguments.map((arg) => expressionToValue(arg, ctx));
    if (argExprs.length !== paramNames.length) {
      throw new TranspileError(`Helper '${funcName}' expects ${paramNames.length} argument(s), got ${argExprs.length}`, getLocation(expr), ctx.source, ctx.filename);
    }
    return {
      step: {
        op: "callLocal",
        name: funcName,
        args: argExprs,
        ...resultVar && { result: resultVar },
        ...resultVar && isConst && { resultConst: true }
      },
      resultVar
    };
  }
  const args = extractCallArguments(expr, ctx);
  const named = expr.arguments.length === 0 || expr.arguments.length === 1 && expr.arguments[0].type === "ObjectExpression";
  if (expr.arguments.length === 0 && !POSITIONAL_BUILTINS.has(funcName))
    delete args.args;
  if (!named && !POSITIONAL_BUILTINS.has(funcName) && expr.arguments.length === 1 && (expr.arguments[0].type === "Identifier" || expr.arguments[0].type === "MemberExpression")) {
    const arg = expr.arguments[0];
    const pathOf = (n) => n.type === "Identifier" ? n.name : n.type === "MemberExpression" && !n.computed ? `${pathOf(n.object)}.${n.property.name}` : "opts";
    const from = pathOf(arg);
    const keys = atomInputs(funcName, ctx)?.contract.keys ?? ["name"];
    throw new TranspileError(`'${funcName}' takes its inputs as an object literal, so they can be checked against ` + `what it declares. Name them:
  ${funcName}({ ${keys.map((k) => `${k}: ${from}.${k}`).join(", ")} })`, getLocation(expr), ctx.source, ctx.filename);
  }
  if (!named && !POSITIONAL_BUILTINS.has(funcName)) {
    throw new TranspileError(`'${funcName}' takes named arguments: write ${funcName}({ name: value, … }), not ${funcName}(a, b). ` + `Positional arguments are for local functions.`, getLocation(expr), ctx.source, ctx.filename);
  }
  checkAtomInputs(funcName, args, expr, ctx);
  return {
    step: {
      op: funcName,
      ...args,
      ...resultVar && { result: resultVar },
      ...resultVar && isConst && { resultConst: true }
    },
    resultVar
  };
}
function ensureHelperTransformed(name, ctx, callSite) {
  const fn = ctx.helpers.get(name);
  const paramNames = [];
  for (const param of fn.params) {
    let id;
    if (param.type === "Identifier") {
      id = param;
    } else if (param.type === "AssignmentPattern" && param.left?.type === "Identifier") {
      id = param.left;
    }
    if (!id) {
      throw new TranspileError(`Helper '${name}' parameters must be plain identifiers (optionally with an example value); destructuring is not supported`, param.loc?.start ?? getLocation(callSite), ctx.source, ctx.filename);
    }
    paramNames.push(id.name);
  }
  if (ctx.helperSteps.has(name) || ctx.helperTransforming.has(name)) {
    return paramNames;
  }
  ctx.helperTransforming.add(name);
  try {
    const helperCtx = {
      depth: 0,
      locals: new Map,
      parameters: new Map(paramNames.map((p) => [
        p,
        {
          name: p,
          type: { kind: "any" },
          required: true
        }
      ])),
      atoms: ctx.atoms,
      warnings: ctx.warnings,
      regexCompiler: ctx.regexCompiler,
      source: ctx.source,
      filename: ctx.filename,
      options: ctx.options,
      helpers: ctx.helpers,
      helperSteps: ctx.helperSteps,
      helperTransforming: ctx.helperTransforming,
      helperReturnTypes: ctx.helperReturnTypes,
      returnCheck: helperReturnCheck(name, fn, ctx)
    };
    const bodySteps = [
      ...hoistedVars(fn.body, new Set(paramNames), helperCtx),
      ...transformBlock(fn.body, helperCtx)
    ];
    ctx.helperSteps.set(name, { steps: bodySteps, paramNames });
  } finally {
    ctx.helperTransforming.delete(name);
  }
  return paramNames;
}
var CALLBACK_METHODS = new Set(["map", "filter", "find", "reduce"]);
function transformMethodCall(method, receiver, args, ctx, resultVar, isConst, location = { line: 0, column: 0 }) {
  refuseCallbackByName(method, args, ctx);
  switch (method) {
    case "map":
      if (args.length > 0 && (args[0].type === "ArrowFunctionExpression" || args[0].type === "FunctionExpression")) {
        const callback = args[0];
        const param = callback.params[0];
        const paramName = param?.type === "Identifier" ? param.name : "item";
        const childCtx = createChildContext(ctx);
        childCtx.returnCheck = undefined;
        childCtx.locals.set(paramName, { kind: "any" });
        let steps;
        if (callback.body.type === "BlockStatement") {
          steps = [
            ...hoistedVars(callback.body, new Set(callback.params.filter((p) => p.type === "Identifier").map((p) => p.name)), childCtx),
            ...transformBlock(callback.body, childCtx)
          ];
        } else {
          const { step, resultVar: exprResult } = transformExpressionToStep(callback.body, childCtx, "result");
          steps = step ? [step] : [{ op: "varSet", key: "result", value: exprResult }];
        }
        return {
          step: {
            op: "map",
            items: receiver,
            as: paramName,
            steps,
            ...resultVar && { result: resultVar },
            ...resultVar && isConst && { resultConst: true }
          },
          resultVar
        };
      }
      break;
    case "filter":
      if (args.length > 0 && (args[0].type === "ArrowFunctionExpression" || args[0].type === "FunctionExpression")) {
        const callback = args[0];
        const param = callback.params[0];
        const paramName = param?.type === "Identifier" ? param.name : "item";
        const childCtx = createChildContext(ctx);
        childCtx.returnCheck = undefined;
        childCtx.locals.set(paramName, { kind: "any" });
        let condition;
        if (callback.body.type === "BlockStatement") {
          throw new TranspileError("filter callback must be an expression, not a block", getLocation(args[0]), ctx.source, ctx.filename);
        } else {
          condition = expressionToExprNode(callback.body, childCtx);
        }
        return {
          step: {
            op: "filter",
            items: receiver,
            as: paramName,
            condition,
            ...resultVar && { result: resultVar },
            ...resultVar && isConst && { resultConst: true }
          },
          resultVar
        };
      }
      break;
    case "find":
      if (args.length > 0 && (args[0].type === "ArrowFunctionExpression" || args[0].type === "FunctionExpression")) {
        const callback = args[0];
        const param = callback.params[0];
        const paramName = param?.type === "Identifier" ? param.name : "item";
        const childCtx = createChildContext(ctx);
        childCtx.returnCheck = undefined;
        childCtx.locals.set(paramName, { kind: "any" });
        let condition;
        if (callback.body.type === "BlockStatement") {
          throw new TranspileError("find callback must be an expression, not a block", getLocation(args[0]), ctx.source, ctx.filename);
        } else {
          condition = expressionToExprNode(callback.body, childCtx);
        }
        return {
          step: {
            op: "find",
            items: receiver,
            as: paramName,
            condition,
            ...resultVar && { result: resultVar },
            ...resultVar && isConst && { resultConst: true }
          },
          resultVar
        };
      }
      break;
    case "reduce":
      if (args.length >= 2 && (args[0].type === "ArrowFunctionExpression" || args[0].type === "FunctionExpression")) {
        const callback = args[0];
        const accParam = callback.params[0];
        const itemParam = callback.params[1];
        const accName = accParam?.type === "Identifier" ? accParam.name : "acc";
        const itemName = itemParam?.type === "Identifier" ? itemParam.name : "item";
        const childCtx = createChildContext(ctx);
        childCtx.returnCheck = undefined;
        childCtx.locals.set(accName, { kind: "any" });
        childCtx.locals.set(itemName, { kind: "any" });
        let steps;
        if (callback.body.type === "BlockStatement") {
          steps = [
            ...hoistedVars(callback.body, new Set(callback.params.filter((p) => p.type === "Identifier").map((p) => p.name)), childCtx),
            ...transformBlock(callback.body, childCtx)
          ];
        } else {
          const { step, resultVar: exprResult } = transformExpressionToStep(callback.body, childCtx, "result");
          steps = step ? [step] : [{ op: "varSet", key: "result", value: exprResult }];
        }
        const initial = expressionToValue(args[1], ctx);
        return {
          step: {
            op: "reduce",
            items: receiver,
            as: itemName,
            accumulator: accName,
            initial,
            steps,
            ...resultVar && { result: resultVar },
            ...resultVar && isConst && { resultConst: true }
          },
          resultVar
        };
      }
      break;
    case "slice":
      break;
  }
  throw methodNotAvailable(method, location, ctx);
}
function isSchemaExpression(node, ctx) {
  let root = node;
  while (root?.type === "CallExpression" || root?.type === "MemberExpression")
    root = root.type === "CallExpression" ? root.callee : root.object;
  if (root?.type === "Identifier" && root !== node && root.name === "Schema")
    return lookupVariable("Schema", ctx) === undefined;
  if (node?.type === "Identifier")
    return !!lookupVariable(node.name, ctx)?.unexamined?.startsWith("Schema.");
  return false;
}
function methodNotAvailable(method, location, ctx) {
  return new TranspileError(`Method '${method}' is not available in AsyncJS` + ([
    "forEach",
    "some",
    "every",
    "flatMap",
    "findIndex",
    "reduceRight"
  ].includes(method) ? " — use for...of, or map/filter/find/reduce with an arrow function" : ""), location, ctx.source, ctx.filename);
}
function refuseCallbackByName(method, args, ctx) {
  if (!CALLBACK_METHODS.has(method) || args.length === 0 || args[0].type === "ArrowFunctionExpression" || args[0].type === "FunctionExpression")
    return;
  const named = args[0].type === "Identifier" ? args[0].name : "f";
  const params = method === "reduce" ? "(acc, x)" : "(x)";
  const call = method === "reduce" ? `${named}(acc, x)` : `${named}(x)`;
  throw new TranspileError(`'${method}' takes its callback written in place, not passed by name. Write:
` + `  xs.${method}(${params} => ${call}${method === "reduce" ? ", initial" : ""})`, getLocation(args[0]), ctx.source, ctx.filename);
}
function desugarSpread(expr) {
  const loc = { start: expr.start, end: expr.end };
  const id = (name) => ({ type: "Identifier", name, ...loc });
  const args = [];
  let group = [];
  const isObject = expr.type === "ObjectExpression";
  const flush = () => {
    if (!group.length)
      return;
    args.push(isObject ? { type: "ObjectExpression", properties: group, ...loc } : { type: "ArrayExpression", elements: group, ...loc });
    group = [];
  };
  const items = isObject ? expr.properties : expr.elements;
  for (const item of items) {
    if (item && item.type === "SpreadElement") {
      flush();
      args.push(item.argument);
    } else {
      group.push(item);
    }
  }
  flush();
  const receiver = isObject ? { type: "ObjectExpression", properties: [], ...loc } : { type: "ArrayExpression", elements: [], ...loc };
  const callee = isObject ? {
    type: "MemberExpression",
    object: id("Object"),
    property: id("assign"),
    computed: false,
    optional: false,
    ...loc
  } : {
    type: "MemberExpression",
    object: receiver,
    property: id("concat"),
    computed: false,
    optional: false,
    ...loc
  };
  return {
    type: "CallExpression",
    callee,
    arguments: isObject ? [receiver, ...args] : args,
    optional: false,
    ...loc
  };
}
function hasSpread(expr) {
  const items = expr.type === "ObjectExpression" ? expr.properties : expr.elements;
  return items.some((i) => i && i.type === "SpreadElement");
}
function rejectSpread(node) {
  throw new Error(node.type === "SpreadElement" ? "Spread (`...`) is not supported in AJS yet, and was silently DROPPED before " + "0.13.13 (#52) — `{ ...doc, rev: 1 }` became `{ rev: 1 }`, losing every original " + "field with no error. Use `Object.assign({}, a, b)` for objects, or `a.concat(b)` " + "for arrays." : `\`${node.type}\` is not supported in an AJS object or array literal. It was ` + `previously ignored, which produced a literal missing the part you wrote.`);
}
function expressionToExprNode(expr, ctx) {
  switch (expr.type) {
    case "Literal": {
      const lit = expr;
      const rx = regexNode(lit, ctx);
      if (rx)
        return rx;
      return { $expr: "literal", value: lit.value };
    }
    case "Identifier": {
      const id = expr;
      checkNameRead(id, ctx);
      return { $expr: "ident", name: id.name };
    }
    case "MemberExpression": {
      const mem = expr;
      const obj = expressionToExprNode(mem.object, ctx);
      const isOptional = mem.optional === true;
      if (mem.computed) {
        const prop = mem.property;
        if (prop.type === "Literal") {
          return {
            $expr: "member",
            object: obj,
            property: String(prop.value),
            computed: true,
            ...isOptional && { optional: true }
          };
        }
        return {
          $expr: "member",
          object: obj,
          property: expressionToExprNode(prop, ctx),
          computed: true,
          ...isOptional && { optional: true }
        };
      }
      const propName = mem.property.name;
      return {
        $expr: "member",
        object: obj,
        property: propName,
        ...isOptional && { optional: true }
      };
    }
    case "ChainExpression": {
      const chain = expr;
      return expressionToExprNode(chain.expression, ctx);
    }
    case "BinaryExpression": {
      const bin = expr;
      return {
        $expr: "binary",
        op: bin.operator,
        left: expressionToExprNode(bin.left, ctx),
        right: expressionToExprNode(bin.right, ctx)
      };
    }
    case "LogicalExpression": {
      const log = expr;
      return {
        $expr: "logical",
        op: log.operator,
        left: expressionToExprNode(log.left, ctx),
        right: expressionToExprNode(log.right, ctx)
      };
    }
    case "UnaryExpression": {
      const un = expr;
      return {
        $expr: "unary",
        op: un.operator,
        argument: expressionToExprNode(un.argument, ctx)
      };
    }
    case "ConditionalExpression": {
      const cond = expr;
      return {
        $expr: "conditional",
        test: expressionToExprNode(cond.test, ctx),
        consequent: expressionToExprNode(cond.consequent, ctx),
        alternate: expressionToExprNode(cond.alternate, ctx)
      };
    }
    case "ArrayExpression": {
      const arr = expr;
      return {
        $expr: "array",
        elements: arr.elements.filter((el) => el !== null).map((el) => expressionToExprNode(el, ctx))
      };
    }
    case "ObjectExpression": {
      const obj = expr;
      if (hasSpread(obj))
        return expressionToExprNode(desugarSpread(obj), ctx);
      const properties = [];
      for (const prop of obj.properties) {
        if (prop.type !== "Property")
          rejectSpread(prop);
        if (prop.type === "Property") {
          const key = propertyKeyName(prop, ctx);
          properties.push({
            key,
            value: expressionToExprNode(prop.value, ctx)
          });
        }
      }
      return { $expr: "object", properties };
    }
    case "CallExpression": {
      const call = expr;
      if (call.callee.type === "MemberExpression") {
        const member = call.callee;
        const method = member.property.type === "Identifier" ? member.property.name : String(member.property.value);
        const namespace = member.object.type === "Identifier" && AJS_GLOBAL_NAMES.has(member.object.name) && lookupVariable(member.object.name, ctx) === undefined;
        if (!namespace)
          refuseCallbackByName(method, call.arguments, ctx);
        if (!namespace && CALLBACK_METHODS.has(method))
          throw new TranspileError(`'${method}' with a callback is a statement in AJS, not part of an expression. ` + `Assign it first:
  const out = xs.${method}((x) => x * 2)
  return { out }`, getLocation(call), ctx.source, ctx.filename);
        if (!namespace && !GUEST_METHODS.has(method))
          throw methodNotAvailable(method, getLocation(call), ctx);
        const SET_FOR = { push: "add", includes: "has" };
        if (!namespace && SET_FOR[method] && member.object.type === "Identifier" && lookupVariable(member.object.name, ctx)?.unexamined?.startsWith("Set(")) {
          const v = member.object.name;
          throw new TranspileError(`'${v}' is a Set, which has '${SET_FOR[method]}', not '${method}':
` + `  ${v}.${SET_FOR[method]}(x)`, getLocation(call), ctx.source, ctx.filename);
        }
        if (namespace && member.object.name === "Schema" && method === "isValid" && isSchemaExpression(call.arguments[0], ctx) && !isSchemaExpression(call.arguments[1], ctx))
          throw new TranspileError(`Schema.isValid takes the value first and the schema second:
` + `  Schema.isValid(value, schema)`, getLocation(call), ctx.source, ctx.filename);
        const isOptional = member.optional === true || call.optional === true;
        return {
          $expr: "methodCall",
          object: expressionToExprNode(member.object, ctx),
          method,
          arguments: call.arguments.map((arg) => expressionToExprNode(arg, ctx)),
          ...isOptional && { optional: true }
        };
      }
      if (call.callee.type === "Identifier") {
        const funcName = call.callee.name;
        if (ctx.helpers?.has(funcName)) {
          throw new TranspileError(`Helper '${funcName}' cannot be called inside an expression. ` + `Assign its result to a variable first: ` + `const result = ${funcName}(...); then use result.`, getLocation(expr), ctx.source, ctx.filename);
        }
        if (!EXPRESSION_CALLABLE_ATOMS.has(funcName) && atomInputs(funcName, ctx) !== undefined) {
          throw new TranspileError(`Atom '${funcName}' cannot be called inside an expression. ` + `Assign its result to a variable first: ` + `const result = ${funcName}({ … }); then use result.`, getLocation(expr), ctx.source, ctx.filename);
        }
        return {
          $expr: "call",
          callee: funcName,
          arguments: call.arguments.map((arg) => expressionToExprNode(arg, ctx))
        };
      }
      throw new TranspileError("Complex function calls in expressions should be lifted to statements", getLocation(expr), ctx.source, ctx.filename);
    }
    case "NewExpression": {
      const newExpr = expr;
      let constructorName = "constructor";
      if (newExpr.callee.type === "Identifier") {
        constructorName = newExpr.callee.name;
      }
      const suggestion = getNewExpressionSuggestion(constructorName);
      throw new TranspileError(`The 'new' keyword is not supported in AsyncJS.${suggestion}`, getLocation(expr), ctx.source, ctx.filename);
    }
    case "TemplateLiteral": {
      const t = expr;
      let node = {
        $expr: "literal",
        value: t.quasis[0].value.cooked ?? ""
      };
      for (let i = 0;i < t.expressions.length; i++) {
        node = {
          $expr: "binary",
          op: "+",
          left: node,
          right: expressionToExprNode(t.expressions[i], ctx)
        };
        const tail = t.quasis[i + 1].value.cooked ?? "";
        if (tail)
          node = {
            $expr: "binary",
            op: "+",
            left: node,
            right: { $expr: "literal", value: tail }
          };
      }
      return node;
    }
    default:
      throw new TranspileError(`Unsupported expression type in condition: ${expr.type}`, getLocation(expr), ctx.source, ctx.filename);
  }
}
function expressionToValue(expr, ctx) {
  switch (expr.type) {
    case "Literal":
      return regexNode(expr, ctx) ?? expr.value;
    case "Identifier": {
      checkNameRead(expr, ctx);
      return { $expr: "ident", name: expr.name };
    }
    case "MemberExpression": {
      const mem = expr;
      const isOptional = mem.optional === true;
      if (isOptional) {
        return expressionToExprNode(expr, ctx);
      }
      if (mem.computed)
        return expressionToExprNode(expr, ctx);
      const objValue = expressionToValue(mem.object, ctx);
      if (objValue && typeof objValue === "object" && objValue.$expr) {
        return {
          $expr: "member",
          object: objValue,
          property: mem.property.name
        };
      }
      const prop = mem.property.name;
      if (objValue && objValue.$kind === "arg") {
        return { $kind: "arg", path: `${objValue.path}.${prop}` };
      }
      return expressionToExprNode(expr, ctx);
    }
    case "ChainExpression": {
      const chain = expr;
      return expressionToValue(chain.expression, ctx);
    }
    case "ArrayExpression":
      if (hasSpread(expr))
        return expressionToExprNode(desugarSpread(expr), ctx);
      return expr.elements.map((el) => {
        if (el && el.type === "SpreadElement")
          rejectSpread(el);
        return el ? expressionToValue(el, ctx) : null;
      });
    case "ObjectExpression": {
      if (expr.properties.some((p) => p.type === "Property" && ["$expr", "$kind"].includes(p.key.type === "Identifier" ? p.key.name : String(p.key.value))))
        return expressionToExprNode(expr, ctx);
      if (hasSpread(expr))
        return expressionToExprNode(desugarSpread(expr), ctx);
      const result = {};
      for (const prop of expr.properties) {
        if (prop.type !== "Property")
          rejectSpread(prop);
        if (prop.type === "Property") {
          const key = propertyKeyName(prop, ctx);
          result[key] = expressionToValue(prop.value, ctx);
        }
      }
      return result;
    }
    case "TemplateLiteral":
      return expressionToExprNode(expr, ctx);
    case "CallExpression":
      return expressionToExprNode(expr, ctx);
    case "BinaryExpression":
    case "LogicalExpression":
    case "UnaryExpression":
    case "ConditionalExpression":
      return expressionToExprNode(expr, ctx);
    default: {
      if (expr.type === "AwaitExpression")
        throw new TranspileError(AWAIT_REMEDY, getLocation(expr), ctx.source, ctx.filename);
      const hint = expr.type === "UpdateExpression" ? ` — use \`${expr.operator}\` as its own statement, or \`x = x + 1\`` : expr.type === "AssignmentExpression" ? " — assign in its own statement, then use the variable" : "";
      throw new TranspileError(`Unsupported expression in AsyncJS: ${expr.type}${hint}`, getLocation(expr), ctx.source, ctx.filename);
    }
  }
}
function atomInputs(name, ctx) {
  const host = ctx.options?.atoms?.[name];
  if (host) {
    const contract = contractOf(host.inputSchema);
    return contract && { contract, fromCore: false };
  }
  return Object.hasOwn(CORE_ATOM_INPUTS, name) ? { contract: CORE_ATOM_INPUTS[name], fromCore: true } : undefined;
}
function checkAtomInputs(name, args, expr, ctx) {
  for (const k of Object.keys(args))
    if (RESERVED_STEP_KEYS.has(k))
      throw new TranspileError(`'${k}' cannot be an atom input: it is reserved for the step itself. Rename the input.`, getLocation(expr), ctx.source, ctx.filename);
  if (POSITIONAL_BUILTINS.has(name))
    return;
  const found = atomInputs(name, ctx);
  if (!found)
    return;
  const { contract, fromCore } = found;
  const shape = contract.keys ? ` It takes ${name}({ ${contract.keys.join(", ")} }).` : "";
  const passed = ctx.options?.atoms !== undefined;
  const hint = !fromCore ? "" : passed ? ` (Your atoms do not include '${name}', so it was checked as the core atom.)` : ` (If your host defines its own '${name}', pass its atoms: transpile(src, { atoms: vm.atoms }), or give createAgent a VM that has .atoms.)`;
  const fail = (message) => {
    throw new TranspileError(message, getLocation(expr), ctx.source, ctx.filename);
  };
  if (contract.keys) {
    for (const k of Object.keys(args))
      if (!contract.keys.includes(k))
        fail(`'${name}' has no input '${k}'.${shape}${hint}`);
  }
  for (const k of contract.required)
    if (!Object.hasOwn(args, k))
      fail(`'${name}' needs '${k}'.${shape}${hint}`);
}
var RESERVED_STEP_KEYS = new Set([
  "op",
  "result",
  "resultConst",
  "resultAssign"
]);
var AJS_GLOBAL_NAMES = new Set([
  "Array",
  "Date",
  "Infinity",
  "JSON",
  "Math",
  "NaN",
  "Number",
  "Object",
  "Schema",
  "Set",
  "String",
  "console",
  "decodeURI",
  "decodeURIComponent",
  "encodeURI",
  "encodeURIComponent",
  "filter",
  "isFinite",
  "isNaN",
  "null",
  "parseFloat",
  "parseInt",
  "undefined"
]);
function checkNameRead(id, ctx) {
  const name = id.name;
  if (lookupVariable(name, ctx) !== undefined || AJS_GLOBAL_NAMES.has(name) || ctx.options.globals?.includes(name))
    return;
  const fail = (message) => {
    throw new TranspileError(message, getLocation(id), ctx.source, ctx.filename);
  };
  if (ctx.helpers?.has(name))
    fail(`'${name}' is a helper function, not a value. Call it (${name}(…)) and use its result.`);
  if (atomInputs(name, ctx) !== undefined)
    fail(`'${name}' is an atom, not a value. Call it (${name}({ … })) and use its result.`);
  fail(`'${name}' is not defined. Declare it with let or const, or take it as a parameter.`);
}
var POSITIONAL_BUILTINS = new Set(["Error"]);
var EXPRESSION_CALLABLE_ATOMS = new Set([
  "Error",
  "filter"
]);
function extractCallArguments(expr, ctx) {
  if (expr.arguments.length === 1 && expr.arguments[0].type === "ObjectExpression") {
    const obj = expr.arguments[0];
    const result = {};
    for (const prop of obj.properties) {
      if (prop.type !== "Property") {
        throw new TranspileError(`A spread is not supported in an atom call: name each input, e.g. foo({ a: opts.a, b: opts.b })`, getLocation(prop), ctx.source, ctx.filename);
      }
      const key = propertyKeyName(prop, ctx);
      result[key] = expressionToValue(prop.value, ctx);
    }
    return result;
  }
  return {
    args: expr.arguments.map((arg) => expressionToValue(arg, ctx))
  };
}

// node_modules/tjs-lang/src/forbidden-keys.ts
var FORBIDDEN_KEYS = ["__proto__", "constructor", "prototype"];
var FORBIDDEN_KEYS_SET = new Set(FORBIDDEN_KEYS);

// node_modules/tjs-lang/src/unwrap-boxed.ts
var TOSI_VALUE = Symbol.for("xin-value");
function unwrapBoxedSlots(v) {
  if (v === null || typeof v !== "object")
    return v;
  try {
    return String.prototype.valueOf.call(v);
  } catch {}
  try {
    return Number.prototype.valueOf.call(v);
  } catch {}
  try {
    return Boolean.prototype.valueOf.call(v);
  } catch {}
  return v;
}
var UNWRAP_TOSI_SOURCE = `const __xv=Symbol.for('xin-value');` + `function __tv(v){if(v===null||(typeof v!=='object'&&typeof v!=='function'))return v;` + `try{const w=v[__xv];if(w!==undefined)return w}catch(e){}return v}`;
var UNWRAP_BOXED_SOURCE = `const __ubxv=Symbol.for('xin-value');` + `function __ub(v){try{` + `if(v!==null&&(typeof v==='object'||typeof v==='function')){const w=v[__ubxv];if(w!==undefined)return w}` + `if(v instanceof String)return String.prototype.valueOf.call(v);` + `if(v instanceof Number)return Number.prototype.valueOf.call(v);` + `if(v instanceof Boolean)return Boolean.prototype.valueOf.call(v)` + `}catch{return v}return v}`;
// node_modules/tjs-lang/src/lang/core.ts
function transpile(source, options = {}) {
  const maxSourceBytes = options.maxSourceBytes;
  if (maxSourceBytes !== undefined) {
    const over = sourceBytesOver(source, maxSourceBytes);
    if (over !== null)
      throw new Error(`Source is ${over} bytes, over the ${maxSourceBytes}-byte limit (maxSourceBytes). ` + `Parsing runs before any budget, so oversized untrusted source is refused.`);
  }
  const {
    ast: program,
    returnTypes,
    originalSource,
    requiredValueOffsets,
    requiredParams
  } = options.parsed ?? parseAgentSource(source, { filename: options.filename });
  const { entry, helpers } = extractFunctions(program, options.filename);
  const entryName = entry.id?.name;
  const returnType = entryName && returnTypes ? returnTypes[entryName] : undefined;
  const { ast, signature, warnings } = transformFunction(entry, originalSource, returnType, options, requiredParams, helpers.size > 0 ? helpers : undefined, requiredValueOffsets, returnTypes ?? undefined);
  if (entryName && helpers.size > 0) {
    const caller = [...helpers.values()].find((h) => callsName(h.body, entryName));
    if (caller)
      warnings.push({
        message: `'${entryName}' is the entry (the last function), but '${caller.id?.name}' calls it ` + `as a helper. If '${caller.id?.name}' is the agent, move it to the end of the file.`,
        line: caller.loc?.start.line ?? 1,
        column: caller.loc?.start.column ?? 0
      });
  }
  return {
    ast,
    signature,
    warnings
  };
}
function callsName(node, name) {
  if (!node || typeof node !== "object")
    return false;
  if (node.type === "CallExpression" && node.callee?.type === "Identifier" && node.callee.name === name)
    return true;
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end")
      continue;
    const v = node[key];
    if (Array.isArray(v) ? v.some((c) => callsName(c, name)) : callsName(v, name))
      return true;
  }
  return false;
}
// node_modules/tjs-lang/src/vm/system-sources.ts
var systemClock = Object.freeze({
  now: () => globalThis.Date.now()
});
var systemRandom = Object.freeze({
  next: () => {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const arr = new Uint32Array(1);
      crypto.getRandomValues(arr);
      return arr[0] / (4294967295 + 1);
    }
    return Math.random();
  }
});

// node_modules/tjs-lang/src/vm/runtime.ts
function eqValue(a, b) {
  a = unwrapBoxedSlots(a);
  b = unwrapBoxedSlots(b);
  if (a === b)
    return true;
  if (typeof a === "number" && typeof b === "number" && isNaN(a) && isNaN(b)) {
    return true;
  }
  if ((a === null || a === undefined) && (b === null || b === undefined)) {
    return true;
  }
  return false;
}
function recordVmEvent(entry) {
  const g = globalThis;
  if (!g.__tjs || typeof g.__tjs.record !== "function")
    return false;
  try {
    g.__tjs.record(entry);
    return true;
  } catch {
    return false;
  }
}

class AgentError {
  $error = true;
  message;
  op;
  cause;
  constructor(message, op, cause) {
    this.message = typeof message === "string" ? message : reduceThrown(message);
    this.op = op;
    this.cause = cause;
    recordVmEvent({
      source: "vm",
      severity: "error",
      message,
      data: {
        op,
        cause: cause === undefined ? undefined : reduceThrown(cause)
      }
    });
  }
  toString() {
    return `AgentError[${this.op}]: ${this.message}`;
  }
  toJSON() {
    return { $error: true, message: this.message, op: this.op };
  }
}
function isAgentError(value) {
  return value instanceof AgentError || value && value.$error === true;
}
function readSource(ctx, key, method, valid, what, op) {
  const remedy = `${what} needs the '${key}' capability: the host passes capabilities: { ${key} } (${key === "clock" ? "systemClock" : "systemRandom"} for the real one)`;
  const caps = ctx.capabilities;
  const source = caps && Object.prototype.hasOwnProperty.call(caps, key) ? caps[key] : undefined;
  if (source === undefined || source === null)
    throw new AgentError(remedy, op);
  const fn = typeof source === "object" && typeof source[method] === "function" ? source[method] : undefined;
  if (!fn)
    throw new AgentError(`capabilities.${key} must be an object with a ${method}() method`, op);
  const v = fn.call(source);
  if (typeof v !== "number" || !valid(v))
    throw new AgentError(`capabilities.${key}.${method}() returned ${v && typeof v.then === "function" ? "a Promise (it must answer synchronously)" : typeof v === "number" ? String(v) : `a ${typeof v}`}; expected ${key === "clock" ? "a finite number of ms within the Date range" : "a number in [0, 1)"}`, op);
  return v;
}
var guestNow = (ctx, op) => readSource(ctx, "clock", "now", (v) => Number.isFinite(v) && Math.abs(v) <= 8640000000000000, op === "Date()" ? "Date() with no argument" : "Date.now()", op);
var guestRandom = (ctx, op) => readSource(ctx, "random", "next", (v) => v >= 0 && v < 1, op === "Math.random" ? "Math.random()" : `the ${op} atom`, op);
var CLOCK_SLICE_MS = 10;
var CLOCK_EVERY_STEPS = 64;
var channelYield;
function yieldToHost() {
  if (typeof setImmediate === "function")
    return new Promise((resolve) => setImmediate(resolve));
  if (typeof MessageChannel === "function") {
    if (!channelYield) {
      const channel = new MessageChannel;
      const waiting = [];
      channel.port1.onmessage = () => waiting.shift()?.();
      channelYield = () => new Promise((resolve) => {
        waiting.push(resolve);
        channel.port2.postMessage(0);
      });
    }
    return channelYield();
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}
var procedureStore = new Map;
var DEFAULT_PROCEDURE_TTL = 60 * 60 * 1000;
var DEFAULT_MAX_AST_SIZE = 100 * 1024;
var PROCEDURE_TOKEN_PREFIX = "proc_";
function isProcedureToken(value) {
  return typeof value === "string" && value.startsWith(PROCEDURE_TOKEN_PREFIX);
}
function resolveProcedureToken(token) {
  const entry = procedureStore.get(token);
  if (!entry) {
    throw new Error(`Procedure not found: ${token}`);
  }
  if (Date.now() > entry.expiresAt) {
    procedureStore.delete(token);
    throw new Error(`Procedure expired: ${token}`);
  }
  checkAstVersion(entry.ast, "resolveProcedureToken");
  return entry.ast;
}
function generateProcedureToken() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return PROCEDURE_TOKEN_PREFIX + crypto.randomUUID();
  }
  return PROCEDURE_TOKEN_PREFIX + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
var FORBIDDEN_PROPERTIES = FORBIDDEN_KEYS_SET;
var own = (obj, key) => obj != null && Object.prototype.hasOwnProperty.call(obj, key);
var scopeHas = (obj, key) => {
  let o = obj;
  while (o != null && o !== Object.prototype) {
    if (Object.prototype.hasOwnProperty.call(o, key))
      return true;
    o = Object.getPrototypeOf(o);
  }
  return false;
};
var MEMBRANE_MAX_BYTES = 4 * 1024 * 1024;
var MEMBRANE_MAX_DEPTH = 1e4;
function membraneValueFrom(subject, value, maxBytes, admit) {
  const r = membraneValue(value, maxBytes, admit);
  return r.ok ? r : {
    ok: false,
    reason: r.reason.replace(/capability return/g, subject),
    walked: r.walked,
    kind: r.kind
  };
}
function membraneValue(value, maxBytes, admit) {
  if (value === null || value === undefined)
    return { ok: true, value };
  const t = typeof value;
  if (t === "boolean" || t === "number")
    return { ok: true, value };
  if (t === "string") {
    if (value.length * 2 > maxBytes)
      return overBudget(maxBytes, value.length * 2);
    return { ok: true, value, bytes: value.length * 2 };
  }
  if (t === "function" || t === "symbol" || t === "bigint") {
    return {
      ok: false,
      kind: "shape",
      walked: 0,
      reason: `a ${t} cannot cross the capability boundary into guest state`
    };
  }
  let bytes = 0;
  const copies = new WeakMap;
  const root = Object.create(null);
  const prototypes = [];
  const stack = [{ v: value, depth: 0, parent: root, key: "value" }];
  const put = (slot, c) => putSlot(slot.parent, slot.key, c);
  try {
    while (stack.length) {
      const slot = stack.pop();
      const { v, depth } = slot;
      const cost = inlineCost(v);
      if (cost >= 0) {
        bytes += cost;
        if (bytes > maxBytes)
          return overBudget(maxBytes, bytes);
        put(slot, v);
        continue;
      }
      const vt = typeof v;
      if (vt !== "object") {
        return {
          ok: false,
          kind: "shape",
          walked: bytes,
          reason: `capability return contains a ${vt}, which cannot cross into guest state`
        };
      }
      if (depth > MEMBRANE_MAX_DEPTH) {
        return {
          ok: false,
          kind: "limit",
          walked: bytes,
          reason: "the value exceeds the membrane depth limit"
        };
      }
      if (copies.has(v)) {
        bytes += 8;
        if (bytes > maxBytes)
          return overBudget(maxBytes, bytes);
        put(slot, copies.get(v));
        continue;
      }
      bytes += 16;
      if (bytes > maxBytes)
        return overBudget(maxBytes, bytes);
      const admitted = admitKind(v);
      if (admitted.kind === "refused")
        return {
          ok: false,
          kind: "shape",
          walked: bytes,
          reason: admitted.reason
        };
      if (admitted.kind === "array") {
        const own = readArrayData(v, bytes, maxBytes, stack, depth, copies, prototypes);
        if (!own.ok)
          return own;
        bytes = own.bytes;
        put(slot, own.copy);
        continue;
      }
      if (admitted.kind === "date") {
        bytes += 32;
        if (bytes > maxBytes)
          return overBudget(maxBytes, bytes);
        const copy = new MembraneDate(admitted.time);
        copies.set(v, copy);
        put(slot, copy);
        continue;
      }
      const proto = admitted.proto;
      const own = readOwnData(v, bytes, maxBytes);
      if (!own.ok)
        return own;
      if (own.entries.some(([key]) => key === "__proto__"))
        return {
          ok: false,
          kind: "limit",
          walked: bytes,
          reason: `capability return contains an object with an own '__proto__' key, which would replace the prototype of anything it is merged into`
        };
      bytes += own.bytes;
      if (bytes > maxBytes)
        return overBudget(maxBytes, bytes);
      const copy = proto === null ? Object.create(null) : {};
      copies.set(v, copy);
      const queued = [];
      for (const [key, child] of own.entries) {
        const cost = inlineCost(child);
        if (cost >= 0) {
          bytes += cost;
          if (bytes > maxBytes)
            return overBudget(maxBytes, bytes);
          putSlot(copy, key, child);
        } else {
          putSlot(copy, key, undefined);
          queued.push({ v: child, depth: depth + 1, parent: copy, key });
        }
      }
      for (let q = queued.length - 1;q >= 0; q--)
        stack.push(queued[q]);
      put(slot, copy);
    }
  } catch (e) {
    return {
      ok: false,
      kind: "shape",
      walked: bytes,
      reason: `capability return could not be read as data: ${reduceThrown(e)}`
    };
  }
  admit?.(bytes);
  for (const [copy, proto] of prototypes)
    Object.setPrototypeOf(copy, proto);
  return { ok: true, value: root.value, bytes };
}
function inlineCost(x) {
  if (x === null || x === undefined)
    return 8;
  const t = typeof x;
  if (t === "number" || t === "boolean")
    return 8;
  if (t === "string")
    return x.length * 2 + 8;
  return -1;
}
function putSlot(parent, key, c) {
  if (IS_ARRAY(parent))
    parent[key] = c;
  else
    DEFINE_PROPERTY(parent, key, {
      value: c,
      writable: true,
      enumerable: true,
      configurable: true
    });
}
var MembraneDate = globalThis.Date;
var DATE_PROTOTYPE = MembraneDate.prototype;
var DATE_GET_TIME = MembraneDate.prototype.getTime;
var BUILTIN_ADVICE = new Map([
  [Map.prototype, ["Map", "use an object, or an array of [key, value] pairs"]],
  [Set.prototype, ["Set", "use an array"]],
  [
    ArrayBuffer.prototype,
    ["ArrayBuffer", "use an array of numbers, or base64 text"]
  ],
  [DataView.prototype, ["DataView", "use an array of numbers"]],
  [RegExp.prototype, ["RegExp", "pass its source text and flags as strings"]],
  [Error.prototype, ["Error", "pass { name, message }"]],
  ...[
    Int8Array,
    Uint8Array,
    Uint8ClampedArray,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Float64Array,
    BigInt64Array,
    BigUint64Array
  ].map((C) => [C.prototype, [C.name, "use Array.from(it)"]]),
  ...typeof SharedArrayBuffer === "undefined" ? [] : [
    [
      SharedArrayBuffer.prototype,
      ["SharedArrayBuffer", "use an array of numbers"]
    ]
  ]
]);
function dateTime(v) {
  try {
    return DATE_GET_TIME.call(v);
  } catch {
    return;
  }
}
function admitKind(v) {
  const proto = Object.getPrototypeOf(v);
  if (IS_ARRAY(v)) {
    if (proto === ARRAY_PROTOTYPE || proto === OBJECT_PROTOTYPE || proto === null)
      return { kind: "array" };
  } else {
    const time = dateTime(v);
    if (time !== undefined)
      return proto === DATE_PROTOTYPE && Reflect.ownKeys(v).length === 0 ? { kind: "date", time } : {
        kind: "refused",
        reason: "capability return contains a Date subclass or a Date with its own properties; only an exact Date crosses"
      };
    if (proto === OBJECT_PROTOTYPE || proto === null)
      return { kind: "plain", proto };
  }
  const builtin = BUILTIN_ADVICE.get(proto);
  if (builtin)
    return {
      kind: "refused",
      reason: `capability return contains a ${builtin[0]}; only plain data (and Date) crosses, and JSON cannot express a ${builtin[0]}: ${builtin[1]}`
    };
  let name = "an unnamed class";
  try {
    const ctorDesc = proto && Object.getOwnPropertyDescriptor(proto, "constructor");
    const ctor = ctorDesc && "value" in ctorDesc ? ctorDesc.value : undefined;
    const nameDesc = typeof ctor === "function" ? Object.getOwnPropertyDescriptor(ctor, "name") : undefined;
    if (nameDesc && typeof nameDesc.value === "string" && nameDesc.value)
      name = nameDesc.value.slice(0, 100);
  } catch {}
  return {
    kind: "refused",
    reason: `capability return contains an instance of ${name}${IS_ARRAY(v) ? " (an Array subclass, or an array from another realm)" : ""}; only plain data (and Date) crosses, and a class instance's prototype getters and private fields would silently read as undefined — convert it to a plain object first`
  };
}
var ARRAY_PROTOTYPE = Array.prototype;
var OBJECT_PROTOTYPE = Object.prototype;
var IS_ARRAY = Array.isArray;
var DEFINE_PROPERTY = Object.defineProperty;
function overBudget(maxBytes, walked) {
  return {
    ok: false,
    kind: "limit",
    walked,
    reason: `the value exceeds the ${maxBytes}-byte membrane budget`
  };
}
function readArrayData(v, startBytes, maxBytes, stack, depth, copies, prototypes) {
  let bytes = startBytes;
  let pushed = 0;
  let indexCount = 0;
  const lengthDesc = Object.getOwnPropertyDescriptor(v, "length");
  const len = lengthDesc && "value" in lengthDesc ? lengthDesc.value : undefined;
  if (typeof len !== "number" || !Number.isInteger(len) || len < 0 || len > 4294967295)
    return {
      ok: false,
      kind: "shape",
      walked: startBytes,
      reason: "capability return has an array whose length is not a valid array length"
    };
  const copy = Object.setPrototypeOf([], null);
  copy.length = len;
  prototypes.push([copy, ARRAY_PROTOTYPE]);
  copies.set(v, copy);
  const probeCap = Math.max(1024, Math.floor((maxBytes - startBytes) / 8) * 4);
  const scanned = Math.min(len, probeCap);
  const queued = [];
  const queue = (value, key) => queued.push({ v: value, depth: depth + 1, parent: copy, key });
  let i = 0;
  for (;i < scanned; i++) {
    const d = Object.getOwnPropertyDescriptor(v, i);
    if (!d)
      continue;
    if (d.get || d.set) {
      return {
        ok: false,
        kind: "shape",
        walked: bytes + pushed * 8,
        reason: `capability return has an accessor at index ${i}; the boundary takes plain data only, because reading an accessor would execute host code`
      };
    }
    indexCount++;
    const cost = inlineCost(d.value);
    if (cost >= 0) {
      bytes += cost;
      if (bytes + pushed * 8 > maxBytes)
        return overBudget(maxBytes, bytes + pushed * 8);
      copy[i] = d.value;
      continue;
    }
    queue(d.value, i);
    pushed++;
    if (bytes + pushed * 8 > maxBytes)
      return overBudget(maxBytes, bytes + pushed * 8);
  }
  for (const k of Object.keys(v)) {
    const asIndex = isArrayIndex(k) ? Number(k) : -1;
    if (asIndex >= 0 && asIndex < i)
      continue;
    if (asIndex >= len)
      return {
        ok: false,
        kind: "shape",
        walked: bytes + pushed * 8,
        reason: `capability return has an array reporting index ${k} past its length ${len}`
      };
    const d = Object.getOwnPropertyDescriptor(v, k);
    if (d && (d.get || d.set)) {
      return {
        ok: false,
        kind: "shape",
        walked: bytes + pushed * 8,
        reason: `capability return has an accessor ${asIndex >= 0 ? `at index ${k}` : `property '${k}'`}; the boundary takes plain data only, because reading an accessor would execute host code`
      };
    }
    if (asIndex < 0)
      bytes += k.length * 2 + 8;
    else
      indexCount++;
    const value = d ? d.value : undefined;
    const cost = inlineCost(value);
    if (cost >= 0) {
      bytes += cost;
      if (bytes + pushed * 8 > maxBytes)
        return overBudget(maxBytes, bytes + pushed * 8);
      putSlot(copy, asIndex >= 0 ? asIndex : k, value);
      continue;
    }
    if (asIndex < 0)
      putSlot(copy, k, undefined);
    queue(value, asIndex >= 0 ? asIndex : k);
    pushed++;
    if (bytes + pushed * 8 > maxBytes)
      return overBudget(maxBytes, bytes + pushed * 8);
  }
  const holes = len - indexCount;
  if (holes > 0) {
    bytes += holes * 8;
    if (bytes > maxBytes)
      return overBudget(maxBytes, bytes);
  }
  for (let q = queued.length - 1;q >= 0; q--)
    stack.push(queued[q]);
  return { ok: true, bytes, copy };
}
function isArrayIndex(k) {
  const n = Number(k);
  return Number.isInteger(n) && n >= 0 && n < 4294967295 && String(n) === k;
}
function readOwnData(v, startBytes, maxBytes) {
  const entries = [];
  let bytes = 0;
  const keys = Object.keys(v);
  const enumerated = keys.length * 8;
  for (const k of keys) {
    const d = Object.getOwnPropertyDescriptor(v, k);
    if (d && (d.get || d.set)) {
      return {
        ok: false,
        kind: "shape",
        walked: startBytes + Math.max(bytes, enumerated),
        reason: `capability return has an accessor property '${k}'; the boundary takes plain data only, because reading an accessor would execute host code`
      };
    }
    bytes += k.length * 2 + 8;
    if (startBytes + bytes > maxBytes)
      return overBudget(maxBytes, startBytes + Math.max(bytes, enumerated));
    entries.push([k, d ? d.value : undefined]);
  }
  return { ok: true, entries, bytes };
}
function assertSafeProperty(prop) {
  if (FORBIDDEN_PROPERTIES.has(prop)) {
    throw new Error(`Security Error: Access to '${prop}' is forbidden`);
  }
}
var BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "metadata.google.internal"
]);
function isBlockedIPv4(host) {
  return /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^169\.254\./.test(host) || /^0\./.test(host);
}
function isBlockedIPv6(host) {
  if (host === "::1" || host === "::")
    return true;
  if (/^f[cd]/.test(host))
    return true;
  if (/^fe[89ab]/.test(host))
    return true;
  const mapped = /^::(?:ffff:)?(.+)$/.exec(host);
  if (mapped) {
    const v4 = ipv4FromMappedTail(mapped[1]);
    if (v4 && isBlockedIPv4(v4))
      return true;
  }
  return false;
}
function ipv4FromMappedTail(tail) {
  if (tail.includes("."))
    return tail;
  const groups = tail.split(":");
  if (groups.length !== 2)
    return null;
  const hi = parseInt(groups[0], 16);
  const lo = parseInt(groups[1], 16);
  if (Number.isNaN(hi) || Number.isNaN(lo))
    return null;
  return `${hi >> 8 & 255}.${hi & 255}.${lo >> 8 & 255}.${lo & 255}`;
}
function isBlockedUrl(urlString) {
  try {
    const url = new URL(urlString);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return true;
    }
    const host = url.hostname.toLowerCase().replace(/\.+$/, "");
    if (BLOCKED_HOSTS.has(host))
      return true;
    if (host.endsWith(".internal") || host.endsWith(".local") || host.endsWith(".localhost"))
      return true;
    if (host.startsWith("[") && host.endsWith("]")) {
      return isBlockedIPv6(host.slice(1, -1));
    }
    return isBlockedIPv4(host);
  } catch {
    return true;
  }
}
var STATE_LEDGERS = new WeakMap;
function ledgerFor(state, ledger) {
  if (!STATE_LEDGERS.has(state))
    STATE_LEDGERS.set(state, ledger);
  return STATE_LEDGERS.get(state);
}
function createChildScope(ctx) {
  const child = {
    ...ctx,
    state: newScopeState(ctx, ctx.state),
    inputsResolved: false,
    allocFrame: { bytes: 0 }
  };
  SCOPE_FRAMES.set(child, child.allocFrame);
  child.heapAccount = ctx.heapAccount;
  child.heapPerKey = new Map;
  ledgerFor(child.state, child.heapPerKey);
  Object.defineProperty(child, "error", {
    get: () => ctx.error,
    set: (e) => {
      ctx.error = e;
    },
    enumerable: true,
    configurable: true
  });
  return child;
}
function releaseScope(child) {
  child.heapRoots.delete(child.state);
  for (const root of OWNED_ROOTS.get(child) ?? [])
    child.heapRoots.delete(root);
  const frame = SCOPE_FRAMES.get(child);
  if (frame) {
    child.heapAccount.transient -= frame.bytes;
    frame.bytes = 0;
  }
  child.heapPerKey.clear();
}
var SCOPE_FRAMES = new WeakMap;
var OWNED_ROOTS = new WeakMap;
function newScopeState(ctx, proto) {
  const state = proto ? Object.create(proto) : {};
  ctx.heapRoots.add(state);
  return state;
}
function holdRoot(ctx, ...holders) {
  const held = holders.filter((h) => h !== null && typeof h === "object");
  for (const h of held)
    ctx.heapRoots.add(h);
  return () => {
    for (const h of held)
      ctx.heapRoots.delete(h);
  };
}
function chargeResultSlot(ctx, op) {
  if (!chargeHeap(ctx, SLOT_BYTES, op, []))
    throw ctx.error ?? new Error(op);
}
function ownRoots(child, ...roots) {
  const owned = OWNED_ROOTS.get(child) ?? [];
  for (const r of roots)
    if (r && typeof r === "object") {
      child.heapRoots.add(r);
      owned.push(r);
    }
  OWNED_ROOTS.set(child, owned);
}
function diffObjects(before, after) {
  const diff = {};
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of allKeys) {
    const beforeVal = before[key];
    const afterVal = after[key];
    if (afterVal !== beforeVal) {
      setGuestKey(diff, key, afterVal);
    }
  }
  return diff;
}
function refuseProtoKey() {
  throw new Error("Security Error: '__proto__' is not allowed as an object key (it would replace the object's prototype)");
}
function setGuestKey(obj, key, value) {
  if (key === "__proto__")
    refuseProtoKey();
  obj[key] = value;
}
function ownValue(obj, key) {
  return obj != null && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
}
function argValue(ctx, key) {
  assertSafeProperty(key);
  return guestValue(ownValue(ctx.args, key));
}
function resolveName(val, ctx) {
  if (val.startsWith("args.") && !("args" in ctx.state)) {
    return argValue(ctx, val.replace("args.", ""));
  }
  if (val.includes(".")) {
    const parts = val.split(".");
    for (const part of parts) {
      if (FORBIDDEN_PROPERTIES.has(part)) {
        throw new Error(`Security Error: Access to '${part}' is forbidden`);
      }
    }
    let current = ctx.state[parts[0]];
    if (current !== undefined) {
      for (let i = 1;i < parts.length; i++) {
        current = guestMember(current, parts[i]);
      }
      return guestValue(current);
    }
  }
  if (scopeHas(ctx.state, val)) {
    return ctx.state[val];
  }
  if (val.includes(".")) {
    recordVmEvent({
      source: "vm",
      severity: "warning",
      message: `'${val}' looks like a path but its root '${val.split(".")[0]}' is not in scope — ` + `returning it as a literal string. If you meant a value, this is silently wrong.`,
      data: { value: val, root: val.split(".")[0] }
    });
  }
  return val;
}
function resolveValue(val, ctx) {
  if (ctx.inputsResolved)
    return val;
  if (val && typeof val === "object" && val.$kind === "arg") {
    return argValue(ctx, String(val.path));
  }
  if (val && typeof val === "object" && val.$expr) {
    return evaluateExpr(val, ctx);
  }
  if (typeof val === "string") {
    if ((ctx.astVersion ?? AST_VERSION_LEGACY) >= 2)
      return val;
    return resolveName(val, ctx);
  }
  if (val && typeof val === "object" && !Array.isArray(val) && val.constructor === Object) {
    const result = {};
    for (const key of Object.keys(val)) {
      setGuestKey(result, key, resolveValue(val[key], ctx));
    }
    return result;
  }
  if (Array.isArray(val)) {
    return val.map((item) => resolveValue(item, ctx));
  }
  return val;
}
function createBuiltinProxy(name, supported, alternatives) {
  return new Proxy(supported, {
    get(target, prop) {
      if (prop in target) {
        return target[prop];
      }
      const alt = alternatives?.[prop];
      if (alt) {
        throw new Error(`${name}.${prop} is not available. ${alt}`);
      }
      throw new Error(`${name}.${prop} is not supported in AsyncJS. Check docs for available ${name} methods.`);
    }
  });
}
function convertExampleToSchema(example) {
  if (example === null) {
    return { type: "null" };
  }
  if (example === undefined) {
    return {};
  }
  if (typeof example === "object" && example !== null && "type" in example && (typeof example.type === "string" || Array.isArray(example.type) && example.type.length > 0 && example.type.every((t) => SCHEMA_TYPES.has(t)))) {
    return example;
  }
  if (F(example)) {
    return example.schema;
  }
  const type = typeof example;
  if (type === "string") {
    return { type: "string" };
  }
  if (type === "number") {
    return Number.isInteger(example) ? { type: "integer" } : { type: "number" };
  }
  if (type === "boolean") {
    return { type: "boolean" };
  }
  if (Array.isArray(example)) {
    if (example.length === 0) {
      return { type: "array" };
    }
    return {
      type: "array",
      items: convertExampleToSchema(example[0])
    };
  }
  if (type === "object") {
    const properties = {};
    const required = [];
    for (const [key, value] of Object.entries(example)) {
      setGuestKey(properties, key, convertExampleToSchema(value));
      required.push(key);
    }
    return {
      type: "object",
      properties,
      required
    };
  }
  return {};
}
var SET_INDEX = new WeakMap;
function guestMember(obj, prop) {
  if (prop === "size" && isGuestSet(obj))
    return obj.length;
  return obj?.[prop];
}
var DATE_VALUES = new WeakSet;
var isGuestSet = (v) => Array.isArray(v) && SET_INDEX.has(v);
var isGuestDate = (v) => !!v && typeof v === "object" && DATE_VALUES.has(v);
function makeGuestSet(items) {
  const index = new globalThis.Set(items);
  const data = [...index];
  SET_INDEX.set(data, index);
  return data;
}
function makeGuestDate(d) {
  const v = Object.freeze({
    value: d.toISOString(),
    timestamp: d.getTime(),
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hours: d.getUTCHours(),
    minutes: d.getUTCMinutes(),
    seconds: d.getUTCSeconds(),
    dayOfWeek: d.getUTCDay()
  });
  DATE_VALUES.add(v);
  return v;
}
var itemsOf = (other) => Array.isArray(other) ? other : [];
var SET_METHODS = Object.assign(Object.create(null), {
  add(item) {
    const index = SET_INDEX.get(this);
    if (!index.has(item)) {
      index.add(item);
      this.push(item);
    }
    return this;
  },
  remove(item) {
    if (SET_INDEX.get(this).delete(item))
      this.splice(this.findIndex((x) => x === item || x !== x && item !== item), 1);
    return this;
  },
  clear() {
    SET_INDEX.get(this).clear();
    this.length = 0;
    return this;
  },
  has(item) {
    return SET_INDEX.get(this).has(item);
  },
  toArray() {
    return [...this];
  },
  toJSON() {
    return [...this];
  },
  union(other) {
    return makeGuestSet([...this, ...itemsOf(other)]);
  },
  intersection(other) {
    const o = new globalThis.Set(itemsOf(other));
    return makeGuestSet(this.filter((x) => o.has(x)));
  },
  diff(other) {
    const o = new globalThis.Set(itemsOf(other));
    return makeGuestSet(this.filter((x) => !o.has(x)));
  }
});
function timestampOf(v) {
  let t = NaN;
  if (typeof v === "number")
    t = v;
  else if (typeof v === "string")
    t = new globalThis.Date(v).getTime();
  else if (isGuestDate(v))
    t = v.timestamp;
  else if (isPlainObject(v)) {
    const d = Object.getOwnPropertyDescriptor(v, "timestamp");
    if (d && typeof d.value === "number")
      t = d.value;
  }
  return Number.isFinite(t) && Math.abs(t) <= 8640000000000000 ? t : NaN;
}
var timeOf = timestampOf;
var DATE_METHODS = Object.assign(Object.create(null), {
  add({
    years = 0,
    months = 0,
    days = 0,
    hours = 0,
    minutes = 0,
    seconds = 0,
    ms = 0
  } = {}) {
    const d = new globalThis.Date(this.timestamp);
    if (years)
      d.setUTCFullYear(d.getUTCFullYear() + years);
    if (months)
      d.setUTCMonth(d.getUTCMonth() + months);
    if (days)
      d.setUTCDate(d.getUTCDate() + days);
    if (hours)
      d.setUTCHours(d.getUTCHours() + hours);
    if (minutes)
      d.setUTCMinutes(d.getUTCMinutes() + minutes);
    if (seconds)
      d.setUTCSeconds(d.getUTCSeconds() + seconds);
    if (ms)
      d.setUTCMilliseconds(d.getUTCMilliseconds() + ms);
    return makeGuestDate(d);
  },
  diff(other, unit = "ms") {
    const diffMs = this.timestamp - timeOf(other);
    switch (unit) {
      case "seconds":
        return diffMs / 1000;
      case "minutes":
        return diffMs / (1000 * 60);
      case "hours":
        return diffMs / (1000 * 60 * 60);
      case "days":
        return diffMs / (1000 * 60 * 60 * 24);
      default:
        return diffMs;
    }
  },
  format(fmt = "ISO") {
    const d = new globalThis.Date(this.timestamp);
    const keyword = fmt.toLowerCase();
    if (keyword === "iso")
      return d.toISOString();
    if (keyword === "date")
      return d.toISOString().split("T")[0];
    if (keyword === "time")
      return d.toISOString().split("T")[1].split(".")[0];
    return fmt.replace("YYYY", String(d.getUTCFullYear())).replace("MM", String(d.getUTCMonth() + 1).padStart(2, "0")).replace("DD", String(d.getUTCDate()).padStart(2, "0")).replace("HH", String(d.getUTCHours()).padStart(2, "0")).replace("mm", String(d.getUTCMinutes()).padStart(2, "0")).replace("ss", String(d.getUTCSeconds()).padStart(2, "0"));
  },
  isBefore(other) {
    return this.timestamp < timeOf(other);
  },
  isAfter(other) {
    return this.timestamp > timeOf(other);
  },
  toString() {
    return this.value;
  },
  toJSON() {
    return this.value;
  }
});
var REGEX_METHODS = Object.assign(Object.create(null), {
  toString() {
    return `/${this.source}/${this.flags}`;
  }
});
function intrinsicMethod(obj, method) {
  if (typeof obj === "function")
    return obj === builtins.Date ? obj[method] : undefined;
  if (typeof obj === "string")
    return String.prototype[method];
  if (typeof obj === "number")
    return Number.prototype[method];
  if (typeof obj === "boolean")
    return Boolean.prototype[method];
  if (isGuestSet(obj))
    return SET_METHODS[method];
  if (Array.isArray(obj))
    return Array.prototype[method];
  if (isGuestDate(obj))
    return DATE_METHODS[method];
  if (isGuestRegex(obj))
    return REGEX_METHODS[method];
  if (NAMESPACE_OBJECTS.has(obj))
    return obj[method];
  if (obj instanceof Date)
    return Date.prototype[method];
  return Object.prototype[method];
}
function deepFreeze(v) {
  if (v && typeof v === "object") {
    for (const x of Object.values(v))
      deepFreeze(x);
    Object.freeze(v);
  }
  return v;
}
var GUEST_SCHEMA = deepFreeze(Object.assign(Object.create(null), Object.fromEntries([
  "string",
  "number",
  "integer",
  "boolean",
  "null",
  "any",
  "undefined",
  "email",
  "uuid",
  "ipv4",
  "url",
  "datetime",
  "date",
  "emoji"
].map((n) => [n, structuredClone(Ue[n].schema)]))));
var builtins = Object.assign(Object.create(null), {
  Math: createBuiltinProxy("Math", {
    PI: Math.PI,
    E: Math.E,
    LN2: Math.LN2,
    LN10: Math.LN10,
    LOG2E: Math.LOG2E,
    LOG10E: Math.LOG10E,
    SQRT2: Math.SQRT2,
    SQRT1_2: Math.SQRT1_2,
    abs: Math.abs,
    ceil: Math.ceil,
    floor: Math.floor,
    round: Math.round,
    trunc: Math.trunc,
    sign: Math.sign,
    sqrt: Math.sqrt,
    cbrt: Math.cbrt,
    pow: Math.pow,
    exp: Math.exp,
    expm1: Math.expm1,
    log: Math.log,
    log2: Math.log2,
    log10: Math.log10,
    log1p: Math.log1p,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    atan2: Math.atan2,
    sinh: Math.sinh,
    cosh: Math.cosh,
    tanh: Math.tanh,
    asinh: Math.asinh,
    acosh: Math.acosh,
    atanh: Math.atanh,
    hypot: Math.hypot,
    min: Math.min,
    max: Math.max,
    clz32: Math.clz32,
    imul: Math.imul,
    fround: Math.fround,
    random: () => {
      throw new Error("Math.random() needs the 'random' capability");
    }
  }),
  JSON: createBuiltinProxy("JSON", {
    parse: (text) => JSON.parse(text, (key, value) => {
      if (key === "__proto__")
        refuseProtoKey();
      return value;
    }),
    stringify: (value, replacer, space) => JSON.stringify(value, replacer, space)
  }),
  console: createBuiltinProxy("console", {
    log: (..._args) => {
      return;
    },
    warn: (..._args) => {
      return;
    },
    error: (..._args) => {
      return;
    },
    info: (..._args) => {
      return;
    }
  }, {
    table: "Use console.log with JSON.stringify for structured data.",
    dir: "Use console.log instead.",
    trace: "Stack traces are not available in AsyncJS."
  }),
  Array: createBuiltinProxy("Array", {
    isArray: (value) => Array.isArray(value),
    from: (iterable, mapFn, thisArg) => Array.from(iterable, mapFn, thisArg),
    of: (...items) => Array.of(...items)
  }, {
    prototype: "Prototype access is not allowed."
  }),
  Object: createBuiltinProxy("Object", {
    keys: (obj) => Object.keys(obj),
    values: (obj) => Object.values(obj),
    entries: (obj) => Object.entries(obj),
    fromEntries: (entries) => {
      const o = Object.fromEntries(entries);
      if (Object.prototype.hasOwnProperty.call(o, "__proto__"))
        refuseProtoKey();
      return o;
    },
    assign: (target, ...sources) => {
      const out = {};
      for (const src of [target, ...sources])
        if (src != null)
          for (const k of Object.keys(src))
            setGuestKey(out, k, src[k]);
      return out;
    },
    hasOwn: (obj, prop) => Object.hasOwn(obj, prop)
  }, {
    prototype: "Prototype access is not allowed.",
    create: "Use object literals instead.",
    defineProperty: "Property descriptors are not supported.",
    getPrototypeOf: "Prototype access is not allowed.",
    setPrototypeOf: "Prototype modification is not allowed."
  }),
  String: createBuiltinProxy("String", {
    fromCharCode: (...codes) => String.fromCharCode(...codes),
    fromCodePoint: (...codePoints) => String.fromCodePoint(...codePoints)
  }),
  Number: createBuiltinProxy("Number", {
    isNaN: Number.isNaN,
    isFinite: Number.isFinite,
    isInteger: Number.isInteger,
    isSafeInteger: Number.isSafeInteger,
    parseFloat,
    parseInt,
    MAX_VALUE: Number.MAX_VALUE,
    MIN_VALUE: Number.MIN_VALUE,
    MAX_SAFE_INTEGER: Number.MAX_SAFE_INTEGER,
    MIN_SAFE_INTEGER: Number.MIN_SAFE_INTEGER,
    POSITIVE_INFINITY: Number.POSITIVE_INFINITY,
    NEGATIVE_INFINITY: Number.NEGATIVE_INFINITY,
    NaN: Number.NaN,
    EPSILON: Number.EPSILON
  }),
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  encodeURI,
  decodeURI,
  encodeURIComponent,
  decodeURIComponent,
  undefined: undefined,
  null: null,
  NaN: NaN,
  Infinity: Infinity,
  filter: (data, schema) => {
    const jsonSchema = admittedSchema(schema, "filter").schema;
    const result = Ge(data, jsonSchema);
    if (result instanceof Error) {
      throw result;
    }
    return result;
  },
  Schema: GUEST_SCHEMA,
  Set: (items = []) => makeGuestSet(typeof items === "string" ? [...items] : items),
  Date: (() => {
    const DateFactory = (init) => {
      if (init === undefined)
        throw new Error("Date() with no argument needs the 'clock' capability; pass a date to Date(x)");
      const date = new globalThis.Date(timestampOf(init));
      if (isNaN(date.getTime()))
        throw new Error(typeof init === "string" ? `Invalid date: '${init}' does not parse` : "Invalid date: pass a Date, a number of ms, an ISO string, or a stored date");
      return makeGuestDate(date);
    };
    DateFactory.now = () => {
      throw new Error("Date.now() needs the 'clock' capability");
    };
    DateFactory.parse = (str) => DateFactory(str);
    return DateFactory;
  })()
});
function shallowBytes(x) {
  if (typeof x === "string")
    return x.length * 2;
  if (x === null || typeof x !== "object")
    return SLOT_BYTES;
  if (Array.isArray(x))
    return 16 + x.length * SLOT_BYTES;
  let n = 16;
  for (const k of Object.keys(x))
    n += k.length * 2 + SLOT_BYTES;
  return n;
}
var sumOf = (xs, f) => xs.reduce((n, x) => n + f(x), 0);
var NONE = () => 0;
var CONST = (bytes) => () => bytes;
var WRAPPER_BYTES = 4096;
var strLen = (x) => typeof x === "string" ? x.length : 0;
var toInt = (x, dflt) => {
  if (x === undefined)
    return dflt;
  const n = x;
  return Number.isNaN(n) ? 0 : n === Infinity || n === -Infinity ? n : Math.trunc(n);
};
var clampIndex = (i, len) => i < 0 ? Math.max(0, len + i) : Math.min(i, len);
var sliceRange = (len, a, b) => Math.max(0, clampIndex(toInt(b, len), len) - clampIndex(toInt(a, 0), len));
var substringRange = (len, a, b) => {
  const s = Math.min(Math.max(toInt(a, 0), 0), len);
  const e = Math.min(Math.max(toInt(b, len), 0), len);
  return Math.abs(e - s);
};
var substrRange = (len, a, b) => Math.max(0, Math.min(Math.max(toInt(b, len), 0), len - clampIndex(toInt(a, 0), len)));
var count = (x) => Math.max(0, toInt(x, 0));
function sortBound(r) {
  for (const x of r)
    primitiveOperand(x, "a sorted element", "expr.sort");
  return r.length * SCALAR_STRING_BYTES;
}
var STRING = (c) => ({
  args: [],
  bound: (r) => c * r.length * 2 + 64
});
var CONST_SIG = (bytes, ...args) => ({
  args,
  bound: CONST(bytes)
});
var NONE_SIG = (...args) => ({ args, bound: NONE });
var NUMS = { args: [], rest: "num", bound: NONE };
var TREE_PRINT = (r, _a, ctx) => treeBytes(ctx, r).bytes + 64;
function sigTable(...parts) {
  const out = Object.create(null);
  for (const part of parts)
    for (const [name, sig] of Object.entries(part)) {
      if (Object.prototype.hasOwnProperty.call(out, name))
        throw new Error(`Method table: '${name}' is defined twice`);
      out[name] = sig;
    }
  return out;
}
var SIGS = {
  string: {
    at: CONST_SIG(64, "num?"),
    charAt: CONST_SIG(64, "num?"),
    charCodeAt: NONE_SIG("num?"),
    codePointAt: NONE_SIG("num?"),
    concat: {
      args: [],
      rest: "prim",
      bound: (r, a, ctx) => r.length * 2 + sumOf(a, (x) => stringFormBound(ctx, x)) + 64
    },
    endsWith: NONE_SIG("str", "num?"),
    startsWith: NONE_SIG("str", "num?"),
    includes: NONE_SIG("str", "num?"),
    indexOf: NONE_SIG("str", "num?"),
    lastIndexOf: NONE_SIG("str", "num?"),
    localeCompare: NONE_SIG("str"),
    normalize: { args: ["str?"], bound: (r) => 18 * r.length * 2 + 64 },
    padStart: {
      args: ["num", "str?"],
      bound: (r, a) => Math.max(r.length, count(a[0])) * 2 + 64
    },
    padEnd: {
      args: ["num", "str?"],
      bound: (r, a) => Math.max(r.length, count(a[0])) * 2 + 64
    },
    repeat: { args: ["num"], bound: (r, a) => r.length * count(a[0]) * 2 + 64 },
    slice: {
      args: ["num?", "num?"],
      bound: (r, a) => sliceRange(r.length, a[0], a[1]) * 2 + 64
    },
    substring: {
      args: ["num?", "num?"],
      bound: (r, a) => substringRange(r.length, a[0], a[1]) * 2 + 64
    },
    substr: {
      args: ["num?", "num?"],
      bound: (r, a) => substrRange(r.length, a[0], a[1]) * 2 + 64
    },
    split: { args: ["pattern?", "num?"], bound: "vm" },
    replace: { args: ["pattern", "str"], bound: "vm" },
    replaceAll: { args: ["pattern", "str"], bound: "vm" },
    match: { args: ["pattern"], bound: "vm" },
    search: { args: ["pattern"], bound: "vm" },
    toLowerCase: STRING(3),
    toUpperCase: STRING(3),
    toLocaleLowerCase: STRING(3),
    toLocaleUpperCase: STRING(3),
    trim: STRING(1),
    trimStart: STRING(1),
    trimEnd: STRING(1),
    trimLeft: STRING(1),
    trimRight: STRING(1),
    toWellFormed: STRING(1),
    isWellFormed: NONE_SIG(),
    toString: NONE_SIG(),
    valueOf: NONE_SIG()
  },
  number: {
    toFixed: CONST_SIG(4096, "num?"),
    toExponential: CONST_SIG(4096, "num?"),
    toPrecision: CONST_SIG(4096, "num?"),
    toString: CONST_SIG(4096, "num?"),
    toLocaleString: CONST_SIG(4096),
    valueOf: NONE_SIG()
  },
  boolean: { toString: CONST_SIG(64), valueOf: NONE_SIG() },
  array: {
    at: NONE_SIG("num?"),
    concat: {
      args: [],
      rest: "any",
      bound: (r, a) => 16 + r.length * SLOT_BYTES + sumOf(a, (x) => Array.isArray(x) ? x.length * SLOT_BYTES : SLOT_BYTES) + 64
    },
    copyWithin: NONE_SIG("num", "num?", "num?"),
    fill: NONE_SIG("any", "num?", "num?"),
    includes: NONE_SIG("any", "num?"),
    indexOf: NONE_SIG("any", "num?"),
    lastIndexOf: NONE_SIG("any", "num?"),
    join: {
      args: ["str?"],
      bound: (r, a, ctx) => treeBytes(ctx, r).bytes + Math.max(0, r.length - 1) * (a[0] === undefined ? 2 : a[0].length * 2) + 64
    },
    pop: NONE_SIG(),
    shift: NONE_SIG(),
    reverse: NONE_SIG(),
    push: { args: [], rest: "any", bound: NONE },
    unshift: { args: [], rest: "any", bound: NONE },
    slice: {
      args: ["num?", "num?"],
      bound: (r, a) => 16 + sliceRange(r.length, a[0], a[1]) * SLOT_BYTES + 64
    },
    sort: { args: [], bound: (r) => sortBound(r) },
    toSorted: { args: [], bound: (r) => shallowBytes(r) + sortBound(r) },
    toReversed: { args: [], bound: (r) => shallowBytes(r) + 64 },
    splice: {
      args: ["num?", "num?"],
      rest: "any",
      bound: (r) => shallowBytes(r) + 64
    },
    toSpliced: {
      args: ["num?", "num?"],
      rest: "any",
      bound: (r, a) => shallowBytes(r) + a.length * SLOT_BYTES + 64
    },
    with: { args: ["num", "any"], bound: (r) => shallowBytes(r) + 64 },
    flat: {
      args: ["num?"],
      bound: (r, _a, ctx) => {
        const t = treeBytes(ctx, r);
        return t.truncated ? Infinity : 16 + t.slots * SLOT_BYTES + 64;
      }
    },
    toString: { args: [], bound: TREE_PRINT },
    toLocaleString: { args: [], bound: TREE_PRINT },
    valueOf: NONE_SIG()
  },
  object: {
    hasOwnProperty: NONE_SIG("prim"),
    propertyIsEnumerable: NONE_SIG("prim"),
    toString: CONST_SIG(64),
    toLocaleString: CONST_SIG(64),
    valueOf: NONE_SIG()
  },
  set: {
    add: NONE_SIG("any"),
    remove: NONE_SIG("any"),
    has: NONE_SIG("any"),
    clear: NONE_SIG(),
    toArray: { args: [], bound: (r) => shallowBytes(r) + 64 },
    toJSON: { args: [], bound: (r) => shallowBytes(r) + 64 },
    union: {
      args: ["setLike"],
      bound: (r, a) => 2 * (shallowBytes(r) + shallowBytes(a[0])) + WRAPPER_BYTES
    },
    intersection: {
      args: ["setLike"],
      bound: (r, a) => 2 * (shallowBytes(r) + shallowBytes(a[0])) + WRAPPER_BYTES
    },
    diff: {
      args: ["setLike"],
      bound: (r, a) => 2 * (shallowBytes(r) + shallowBytes(a[0])) + WRAPPER_BYTES
    }
  },
  date: {
    add: CONST_SIG(WRAPPER_BYTES, "amounts"),
    diff: NONE_SIG("dateLike", "str?"),
    isBefore: NONE_SIG("dateLike"),
    isAfter: NONE_SIG("dateLike"),
    format: { args: ["str?"], bound: (_r, a) => strLen(a[0]) * 2 + 256 },
    toString: CONST_SIG(256),
    toJSON: CONST_SIG(256)
  },
  "native-date": sigTable(Object.fromEntries([
    "getDate",
    "getDay",
    "getFullYear",
    "getHours",
    "getMilliseconds",
    "getMinutes",
    "getMonth",
    "getSeconds",
    "getTime",
    "getTimezoneOffset",
    "getUTCDate",
    "getUTCDay",
    "getUTCFullYear",
    "getUTCHours",
    "getUTCMilliseconds",
    "getUTCMinutes",
    "getUTCMonth",
    "getUTCSeconds",
    "getYear",
    "valueOf"
  ].map((n) => [n, NONE_SIG()])), Object.fromEntries([
    "setDate",
    "setFullYear",
    "setHours",
    "setMilliseconds",
    "setMinutes",
    "setMonth",
    "setSeconds",
    "setTime",
    "setUTCDate",
    "setUTCFullYear",
    "setUTCHours",
    "setUTCMilliseconds",
    "setUTCMinutes",
    "setUTCMonth",
    "setUTCSeconds",
    "setYear"
  ].map((n) => [n, NONE_SIG("num", "num?", "num?", "num?")])), Object.fromEntries([
    "toISOString",
    "toDateString",
    "toUTCString",
    "toGMTString",
    "toTimeString",
    "toJSON",
    "toString",
    "toLocaleString",
    "toLocaleDateString",
    "toLocaleTimeString"
  ].map((n) => [n, CONST_SIG(256)]))),
  regex: {
    toString: { args: [], bound: (r) => r.source.length * 2 + 64 }
  },
  "ns:Math": Object.fromEntries([
    "abs",
    "acos",
    "acosh",
    "asin",
    "asinh",
    "atan",
    "atan2",
    "atanh",
    "cbrt",
    "ceil",
    "clz32",
    "cos",
    "cosh",
    "exp",
    "expm1",
    "floor",
    "fround",
    "hypot",
    "imul",
    "log",
    "log10",
    "log1p",
    "log2",
    "max",
    "min",
    "pow",
    "random",
    "round",
    "sign",
    "sin",
    "sinh",
    "sqrt",
    "tan",
    "tanh",
    "trunc"
  ].map((n) => [n, NUMS])),
  "ns:JSON": {
    parse: { args: ["str"], bound: (_r, a) => 16 * a[0].length + 64 },
    stringify: {
      args: ["any", "nullish?", "prim?"],
      bound: (_r, a, ctx) => stringifyBound(ctx, a[0], a[2])
    }
  },
  "ns:Array": {
    from: { args: ["arrayLike"], bound: (_r, a) => arrayFromBound(a[0]) },
    of: {
      args: [],
      rest: "any",
      bound: (_r, a) => 16 + a.length * SLOT_BYTES + 64
    },
    isArray: NONE_SIG("any")
  },
  "ns:Object": {
    keys: { args: ["objOrArr"], bound: (_r, a) => 4 * shallowBytes(a[0]) + 64 },
    values: {
      args: ["objOrArr"],
      bound: (_r, a) => 2 * shallowBytes(a[0]) + 64
    },
    entries: {
      args: ["objOrArr"],
      bound: (_r, a) => 8 * shallowBytes(a[0]) + 64
    },
    assign: {
      args: ["objOrArr"],
      rest: "objOrArr",
      bound: (_r, a) => 2 * sumOf(a, shallowBytes) + 64
    },
    fromEntries: {
      args: ["entries"],
      bound: (_r, a) => 2 * sumOf(a[0], (e) => shallowBytes(e[0]) + SLOT_BYTES) + 64
    },
    hasOwn: NONE_SIG("objOrArr", "prim")
  },
  "ns:String": {
    fromCharCode: {
      args: [],
      rest: "num",
      bound: (_r, a) => a.length * 2 + 64
    },
    fromCodePoint: {
      args: [],
      rest: "num",
      bound: (_r, a) => a.length * 4 + 64
    }
  },
  "ns:Number": {
    isNaN: NONE_SIG("any"),
    isFinite: NONE_SIG("any"),
    isInteger: NONE_SIG("any"),
    isSafeInteger: NONE_SIG("any"),
    parseFloat: NONE_SIG("str"),
    parseInt: NONE_SIG("str", "num?")
  },
  "ns:Schema": Object.fromEntries([
    ["object", ["any"]],
    ["array", ["any"]],
    ["record", ["any"]],
    ["union", ["array"]],
    ["tuple", ["array"]],
    ["enum", ["array"]],
    ["const", ["prim"]],
    ["fromExample", ["any"]],
    ["infer", ["any"]],
    ["response", ["str", "any"]],
    ["isValid", ["any", "any"]]
  ].map(([n, args]) => [n, { args, bound: "vm" }])),
  "ns:console": Object.fromEntries(["log", "info", "warn", "error"].map((n) => [
    n,
    { args: [], rest: "any", bound: NONE }
  ])),
  "ns:Date": {
    now: NONE_SIG(),
    parse: CONST_SIG(WRAPPER_BYTES, "str")
  }
};
var GLOBAL_SIGS = {
  parseInt: NONE_SIG("str", "num?"),
  parseFloat: NONE_SIG("str"),
  isNaN: NONE_SIG("num"),
  isFinite: NONE_SIG("num"),
  encodeURI: { args: ["str"], bound: (_r, a) => 9 * a[0].length * 2 + 64 },
  encodeURIComponent: {
    args: ["str"],
    bound: (_r, a) => 9 * a[0].length * 2 + 64
  },
  decodeURI: { args: ["str"], bound: (_r, a) => a[0].length * 2 + 64 },
  decodeURIComponent: { args: ["str"], bound: (_r, a) => a[0].length * 2 + 64 },
  Set: {
    args: ["setSource?"],
    bound: (_r, a) => (typeof a[0] === "string" ? a[0].length * 64 : 2 * (a[0] === undefined ? 0 : shallowBytes(a[0]))) + WRAPPER_BYTES
  },
  Date: CONST_SIG(WRAPPER_BYTES, "dateLike?"),
  filter: {
    args: ["any", "any"],
    bound: (_r, a, ctx) => {
      const nodes = admitGuestSchema(convertExampleToSchema(a[1]), "filter");
      chargeValidation(ctx, nodes, a[0], "filter");
      return 2 * treeBytes(ctx, a[0]).bytes + 64;
    }
  }
};
function arrayFromBound(src) {
  if (typeof src === "string")
    return src.length * (SLOT_BYTES + 32) + 64;
  if (Array.isArray(src))
    return shallowBytes(src) + 64;
  return 16 + count(src.length) * SLOT_BYTES + 64;
}
function stringifyBound(ctx, x, indent) {
  const tree = treeBytes(ctx, x, true);
  if (tree.truncated)
    return Infinity;
  const width = typeof indent === "number" ? Math.min(10, count(indent)) : typeof indent === "string" ? Math.min(10, indent.length) : 0;
  return tree.bytes + 64 + (width ? tree.nodes * (2 + width * tree.depth) * 2 : 0);
}
function kindOf(r) {
  if (typeof r === "string")
    return "string";
  if (typeof r === "number")
    return "number";
  if (typeof r === "boolean")
    return "boolean";
  if (Array.isArray(r))
    return isGuestSet(r) ? "set" : "array";
  if (typeof r === "function")
    return r === builtins.Date ? "ns:Date" : "function";
  if (r && typeof r === "object") {
    for (const ns of NAMESPACES)
      if (r === builtins[ns])
        return "ns:" + ns;
    if (isGuestDate(r))
      return "date";
    if (isGuestRegex(r))
      return "regex";
    if (r instanceof Date)
      return "native-date";
    return "object";
  }
  return typeof r;
}
var namespaceSet;
var NAMESPACE_OBJECTS = {
  has(v) {
    namespaceSet ??= new Set(NAMESPACES.map((ns) => builtins[ns]));
    return namespaceSet.has(v);
  }
};
function notGuestData() {
  return new AgentError("A function or builtin namespace is not a value in AsyncJS: call it (e.g. Math.max(a, b), s.trim())", "bind");
}
var NAMESPACES = [
  "Math",
  "JSON",
  "Array",
  "Object",
  "String",
  "Number",
  "Schema",
  "console"
];
var isPlainObject = (x) => !!x && typeof x === "object" && !Array.isArray(x) && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null) && !isGuestDate(x) && !isGuestRegex(x);
var isPrimitive = (x) => x === null || typeof x !== "object" && typeof x !== "function";
function argOk(type, v) {
  if (type.endsWith("?"))
    return v === undefined || argOk(type.slice(0, -1), v);
  switch (type) {
    case "any":
      return true;
    case "str":
      return typeof v === "string";
    case "num":
      return typeof v === "number";
    case "prim":
      return isPrimitive(v) && v !== undefined;
    case "nullish":
      return v === null || v === undefined;
    case "pattern":
      return typeof v === "string" || isGuestRegex(v);
    case "objOrArr":
      return Array.isArray(v) || isPlainObject(v);
    case "array":
      return Array.isArray(v);
    case "setLike":
      return Array.isArray(v);
    case "setSource":
      return typeof v === "string" || argOk("setLike", v);
    case "dateLike":
      return typeof v === "string" || !Number.isNaN(timestampOf(v));
    case "amounts":
      return isPlainObject(v) && Object.values(Object.getOwnPropertyDescriptors(v)).every((d) => typeof d.value === "number");
    case "entries":
      return Array.isArray(v) && v.every((e) => Array.isArray(e) && (typeof e[0] === "string" || typeof e[0] === "number"));
    case "arrayLike":
      return typeof v === "string" || argOk("setLike", v) || isPlainObject(v) && typeof Object.getOwnPropertyDescriptor(v, "length")?.value === "number";
    case "schema":
      return true;
  }
  return false;
}
var KIND_NAMES = {
  string: "a string",
  number: "a number",
  boolean: "a boolean",
  array: "an array",
  object: "an object",
  set: "a Set",
  date: "a Date",
  "native-date": "a Date",
  regex: "a regex",
  function: "a function"
};
function methodGate(receiver, method, args, ctx) {
  const kind = kindOf(receiver);
  const table = Object.prototype.hasOwnProperty.call(SIGS, kind) ? SIGS[kind] : undefined;
  const sig = table && Object.prototype.hasOwnProperty.call(table, method) ? table[method] : undefined;
  if (!sig)
    throw new AgentError(`'${method}' is not available on ${KIND_NAMES[kind] ?? kind.replace("ns:", "")}`, `expr.${method}`);
  checkArgs(sig, args, `${method}()`, `expr.${method}`);
  return sig.bound === "vm" ? "vm" : sig.bound(receiver, args, ctx);
}
function checkArgs(sig, args, what, op) {
  if (args.length > sig.args.length && !sig.rest)
    throw new AgentError(`${what} takes at most ${sig.args.length} argument(s)`, op);
  args.forEach((v, i) => {
    const type = i < sig.args.length ? sig.args[i] : sig.rest;
    if (!argOk(type, v))
      throw new AgentError(`${what}'s argument ${i + 1} must be ${ARG_NAMES[type.replace("?", "")] ?? type}` + (isPrimitive(v) ? "" : " — convert it explicitly (e.g. arr.join(','), JSON.stringify(obj))"), op);
    if (type.replace("?", "") === "schema")
      admitGuestSchema(convertExampleToSchema(v));
  });
}
var ARG_NAMES = {
  str: "a string",
  num: "a number",
  prim: "a string, number, boolean or null",
  nullish: "null",
  pattern: "a string or a regex",
  objOrArr: "an object or an array",
  array: "an array",
  setLike: "a Set or an array",
  setSource: "an array, a string or a Set",
  dateLike: "a Date, a number or a string (a stored date works too)",
  amounts: "an object of numbers",
  entries: "an array of [key, value] pairs",
  arrayLike: "an array, a string, a Set or { length: number }"
};
var LIBRARY_PATTERNS = new Set([Ue.emoji?.schema?.pattern].filter((p) => typeof p === "string"));
function admitGuestSchema(schema, op = "Schema") {
  const walk = { nodes: 0, trail: [], op };
  admitSchemaNode(walk, F(schema) ? schema.schema : schema, 0);
  return walk.nodes;
}
var SCHEMA_TYPES = new Set([
  "string",
  "number",
  "integer",
  "boolean",
  "object",
  "array",
  "null"
]);
var GUEST_SCHEMA_MAX_NODES = 1e4;
var GUEST_SCHEMA_MAX_DEPTH = 64;
function refuseSchema(w, why) {
  throw new AgentError(`This schema is not available in AsyncJS (${w.trail.join("") || "the schema"}: ${why}). Guest schemas may use only the validation keywords the VM admits; for a pattern, use regexMatch (it runs on the VM's regex engine).`, w.op);
}
function countSchemaNode(w, depth) {
  if (++w.nodes > GUEST_SCHEMA_MAX_NODES)
    refuseSchema(w, `more than ${GUEST_SCHEMA_MAX_NODES} nodes`);
  if (depth > GUEST_SCHEMA_MAX_DEPTH)
    refuseSchema(w, `nested more than ${GUEST_SCHEMA_MAX_DEPTH} deep`);
}
function schemaEntries(w, v) {
  if (!v || typeof v !== "object" || Array.isArray(v))
    refuseSchema(w, "not a schema object");
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null)
    refuseSchema(w, "not a plain object");
  const out = [];
  const descriptors = Object.getOwnPropertyDescriptors(v);
  for (const k of Object.keys(descriptors)) {
    const d = descriptors[k];
    if (!("value" in d)) {
      w.trail.push(`.${k}`);
      refuseSchema(w, "an accessor");
    }
    out.push([k, d.value]);
  }
  return out;
}
function schemaArray(w, v, depth, each) {
  if (!Array.isArray(v) || Object.getPrototypeOf(v) !== Array.prototype)
    refuseSchema(w, "not an array");
  for (let i = 0;i < v.length; i++) {
    countSchemaNode(w, depth);
    w.trail.push(`[${i}]`);
    each(w, v[i], depth);
    w.trail.pop();
  }
}
function admitPrimitive(w, x) {
  if (!(x === null || typeof x === "string" || typeof x === "boolean" || typeof x === "number" && Number.isFinite(x)))
    refuseSchema(w, "not a JSON primitive");
}
function admitJson(w, x, depth) {
  countSchemaNode(w, depth);
  if (Array.isArray(x))
    schemaArray(w, x, depth + 1, admitJson);
  else if (x && typeof x === "object")
    for (const [k, y] of schemaEntries(w, x)) {
      w.trail.push(`.${k}`);
      admitJson(w, y, depth + 1);
      w.trail.pop();
    }
  else
    admitPrimitive(w, x);
}
function admitSchemaNode(w, v, depth) {
  countSchemaNode(w, depth);
  if (typeof v === "boolean")
    return;
  for (const [k, value] of schemaEntries(w, v)) {
    if (value === undefined)
      continue;
    w.trail.push(`.${k}`);
    const check = GUEST_SCHEMA_KEYWORDS[k];
    if (!check)
      refuseSchema(w, `'${k}' is not an admitted keyword`);
    check(w, value, depth);
    w.trail.pop();
  }
}
var sub = (w, x, d) => admitSchemaNode(w, x, d + 1);
var finiteNumber = (w, x) => typeof x === "number" && Number.isFinite(x) ? undefined : refuseSchema(w, "not a finite number");
var aString = (w, x) => typeof x === "string" ? undefined : refuseSchema(w, "not a string");
var GUEST_SCHEMA_KEYWORDS = Object.assign(Object.create(null), {
  type: (w, v, d) => Array.isArray(v) ? schemaArray(w, v, d, (w2, x) => SCHEMA_TYPES.has(x) ? undefined : refuseSchema(w2, "not a type name")) : SCHEMA_TYPES.has(v) || refuseSchema(w, "not a type name"),
  properties: (w, v, d) => {
    for (const [k, x] of schemaEntries(w, v)) {
      w.trail.push(`.${k}`);
      sub(w, x, d);
      w.trail.pop();
    }
  },
  items: (w, v, d) => Array.isArray(v) ? schemaArray(w, v, d, (w2, x) => sub(w2, x, d)) : sub(w, v, d),
  additionalProperties: sub,
  anyOf: (w, v, d) => schemaArray(w, v, d, (w2, x) => sub(w2, x, d)),
  oneOf: (w, v, d) => schemaArray(w, v, d, (w2, x) => sub(w2, x, d)),
  required: (w, v, d) => schemaArray(w, v, d, aString),
  enum: (w, v, d) => schemaArray(w, v, d, admitPrimitive),
  const: admitPrimitive,
  minimum: finiteNumber,
  maximum: finiteNumber,
  exclusiveMinimum: finiteNumber,
  exclusiveMaximum: finiteNumber,
  multipleOf: finiteNumber,
  minLength: finiteNumber,
  maxLength: finiteNumber,
  minItems: finiteNumber,
  maxItems: finiteNumber,
  minProperties: finiteNumber,
  maxProperties: finiteNumber,
  format: (w, v) => typeof v === "string" && GUEST_FORMATS.has(v) ? undefined : refuseSchema(w, "not an admitted format"),
  pattern: (w, v) => typeof v === "string" && LIBRARY_PATTERNS.has(v) ? undefined : refuseSchema(w, "a 'pattern' is compiled by the host's regex engine"),
  title: aString,
  description: aString,
  default: (w, v, d) => admitJson(w, v, d + 1),
  examples: (w, v, d) => admitJson(w, v, d + 1),
  "x-tjs-undefined": (w, v) => typeof v === "boolean" ? undefined : refuseSchema(w, "not a boolean")
});
var GUEST_FORMATS = new Set([
  "email",
  "uuid",
  "uri",
  "ipv4",
  "date",
  "date-time",
  "emoji"
]);
var GUEST_SCHEMA_KEYWORD_NAMES = Object.keys(GUEST_SCHEMA_KEYWORDS);
function stringifyInput(ctx, v, op) {
  return typeof v === "string" ? v : jsonOf(ctx, v, op);
}
function jsonOf(ctx, v, op) {
  allocate(ctx, stringifyBound(ctx, v, undefined), op);
  return JSON.stringify(v) ?? String(v);
}
var methodBudgets = {
  names: () => [
    ...new Set(Object.values(SIGS).flatMap((t) => Object.keys(t)))
  ],
  globals: () => Object.keys(GLOBAL_SIGS),
  kinds: () => Object.keys(SIGS),
  kindOf: (r) => kindOf(r),
  bound: (name, receiver, args, ctx) => methodGate(receiver, name, args, ctx),
  globalBound: (name, args, ctx) => {
    const sig = GLOBAL_SIGS[name];
    checkArgs(sig, args, `${name}()`, `expr.${name}`);
    return sig.bound(undefined, args, ctx);
  }
};
function grantedSource(ctx, receiver, method) {
  if (method === "random" && receiver === builtins.Math)
    return guestRandom(ctx, "Math.random");
  if (method === "now" && receiver === builtins.Date)
    return guestNow(ctx, "Date.now");
  return;
}
function guestCall(ctx, receiver, method, args, op) {
  const bound = methodGate(receiver, method, args, ctx);
  if (bound === "vm")
    return vmMethod(ctx, receiver, method, args);
  allocate(ctx, bound, op);
  const granted = grantedSource(ctx, receiver, method);
  if (granted !== undefined)
    return granted;
  const fn = intrinsicMethod(receiver, method);
  if (typeof fn !== "function")
    throw new AgentError(`'${method}' is not a method of this value`, op);
  return fn.apply(receiver, args);
}
function admitResponseFormat(format, op) {
  if (format === undefined || format === null)
    return format;
  const keys = format && typeof format === "object" ? Object.keys(format) : [];
  const refuse = (why) => {
    throw new AgentError(`responseFormat is not available in AsyncJS: ${why}`, op);
  };
  if (format.type === "text" || format.type === "json_object") {
    if (keys.some((k) => k !== "type"))
      refuse(`a '${format.type}' format takes no other keys`);
    return format;
  }
  if (format.type !== "json_schema" || keys.some((k) => k !== "type" && k !== "json_schema"))
    refuse("use { type: 'json_schema', json_schema: { name, schema } } (Schema.response builds it)");
  const js = format.json_schema;
  if (!js || typeof js !== "object" || Object.keys(js).some((k) => !["name", "strict", "description", "schema"].includes(k)))
    refuse("json_schema takes name, strict, description and schema");
  admitGuestSchema(js.schema, op);
  return format;
}
function admitTools(tools, op) {
  if (tools === undefined || tools === null)
    return tools;
  const refuse = (why) => {
    throw new AgentError(`tools are not available in AsyncJS: ${why}`, op);
  };
  if (!Array.isArray(tools))
    refuse("tools must be an array");
  for (const t of tools) {
    if (!t || typeof t !== "object" || t.type !== "function" || Object.keys(t).some((k) => k !== "type" && k !== "function"))
      refuse("each tool is { type: 'function', function: { name, parameters } }");
    const fn = t.function;
    if (!fn || typeof fn !== "object" || typeof fn.name !== "string" || Object.keys(fn).some((k) => !["name", "description", "parameters", "strict"].includes(k)))
      refuse("a tool function takes name, description, parameters and strict");
    if (fn.parameters !== undefined)
      admitGuestSchema(fn.parameters, op);
  }
  return tools;
}
var LLM_OPTION_KEYS = new Set([
  "model",
  "temperature",
  "maxTokens",
  "max_tokens",
  "topP",
  "top_p",
  "stop",
  "seed",
  "responseFormat",
  "tools"
]);
function vmMethod(ctx, receiver, method, args) {
  return receiver === GUEST_SCHEMA ? vmSchemaMethod(ctx, method, args) : vmStringMethod(ctx, receiver, method, args);
}
var VALIDATION_FUEL_PER_STEP = 0.002;
function chargeValidation(ctx, schemaNodes, data, op) {
  if (!ctx.fuel)
    return;
  const dataNodes = Math.max(1, treeBytes(ctx, data).nodes);
  if ((ctx.fuel.current -= schemaNodes * dataNodes * VALIDATION_FUEL_PER_STEP) <= 0)
    throw new AgentError("Out of Fuel", op);
}
function admittedSchema(x, op) {
  const converted = convertExampleToSchema(x);
  const nodes = admitGuestSchema(converted, op);
  return { schema: structuredClone(converted), nodes };
}
function vmSchemaMethod(ctx, method, args) {
  const op = `Schema.${method}`;
  allocate(ctx, method === "isValid" ? 2 * treeBytes(ctx, args[1]).bytes + 512 : 4 * treeBytes(ctx, args).bytes + 512, op);
  const each = (list) => list.map((x) => admittedSchema(x, op).schema);
  const primitives = (list) => {
    for (const v of list)
      if (!(v === null || typeof v === "string" || typeof v === "boolean" || typeof v === "number" && Number.isFinite(v)))
        throw new AgentError(`${op} takes JSON primitives`, op);
    return list;
  };
  switch (method) {
    case "object": {
      const props = args[0];
      if (!props || typeof props !== "object" || Array.isArray(props))
        throw new AgentError(`${op} takes an object of schemas`, op);
      const properties = Object.create(null);
      const required = [];
      for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(props))) {
        if (!("value" in d))
          throw new AgentError(`${op}: '${k}' is an accessor`, op);
        assertSafeProperty(k);
        const schema = admittedSchema(d.value, op).schema;
        setGuestKey(properties, k, schema);
        const type = schema?.type;
        if (!(Array.isArray(type) && type.includes("null")))
          required.push(k);
      }
      return {
        type: "object",
        properties: { ...properties },
        required,
        additionalProperties: false
      };
    }
    case "array":
      return { type: "array", items: admittedSchema(args[0], op).schema };
    case "record":
      return {
        type: "object",
        additionalProperties: admittedSchema(args[0], op).schema
      };
    case "union":
      return { anyOf: each(args[0]) };
    case "tuple":
      return {
        type: "array",
        items: each(args[0]),
        minItems: args[0].length,
        maxItems: args[0].length
      };
    case "enum": {
      const values = primitives(args[0]);
      const type = values.every((v) => typeof v === "string") ? "string" : values.every((v) => typeof v === "number") ? "number" : undefined;
      return type ? { type, enum: [...values] } : { enum: [...values] };
    }
    case "const":
      return { const: primitives([args[0]])[0] };
    case "fromExample":
    case "infer":
      return admittedSchema(args[0], op).schema;
    case "response":
      return {
        type: "json_schema",
        json_schema: {
          name: args[0],
          strict: true,
          schema: admittedSchema(args[1], op).schema
        }
      };
    case "isValid": {
      const { schema, nodes } = admittedSchema(args[1], op);
      chargeValidation(ctx, nodes, args[0], op);
      return qe(args[0], schema);
    }
  }
  throw new AgentError(`'${method}' is not a Schema method`, op);
}
function regexFuel(ctx, op) {
  return (n) => {
    if (!ctx.fuel)
      return;
    if ((ctx.fuel.current -= n * REGEX_FUEL_PER_STEP) <= 0)
      throw new AgentError("Out of Fuel", op);
  };
}
function vmStringMethod(ctx, s, method, args) {
  const op = `expr.${method}`;
  const meters = {
    alloc: (bytes) => allocate(ctx, bytes, op),
    steps: regexFuel(ctx, op)
  };
  try {
    switch (method) {
      case "replace":
        return replace(s, args[0], args[1], meters);
      case "replaceAll":
        return replaceAll(s, args[0], args[1], meters);
      case "match":
        return match(s, args[0], meters);
      case "search":
        return search(s, args[0], meters);
      case "split":
        return split(s, args[0], args[1], meters);
    }
  } catch (e) {
    if (e instanceof RegexError || e instanceof TypeError)
      throw new AgentError(reduceThrown(e), op);
    throw e;
  }
  throw new AgentError(`'${method}' is not a VM string method`, op);
}
var SAFE_METHOD_NAMES = new Set(methodBudgets.names());
var unsupportedBuiltins = Object.assign(Object.create(null), {
  RegExp: "RegExp is not available. Use string methods or the regexMatch atom.",
  Promise: "Promise is not needed. All operations are implicitly async.",
  Map: "Map is not available. Use plain objects instead.",
  WeakSet: "WeakSet is not available.",
  WeakMap: "WeakMap is not available.",
  Symbol: "Symbol is not available.",
  Proxy: "Proxy is not available.",
  Reflect: "Reflect is not available.",
  Function: "Function constructor is not available. Define functions normally.",
  eval: "eval is not available. Code is compiled, not evaluated.",
  setTimeout: "setTimeout is not available. Use the delay atom.",
  setInterval: "setInterval is not available. Use while loops with delay.",
  fetch: "fetch is not available. Use the httpFetch atom.",
  require: "require is not available. Atoms must be registered with the VM.",
  import: "import is not available. Atoms must be registered with the VM.",
  process: "process is not available. AsyncJS runs in a sandboxed environment.",
  window: "window is not available. AsyncJS runs in a sandboxed environment.",
  document: "document is not available. AsyncJS runs in a sandboxed environment.",
  global: "global is not available. AsyncJS runs in a sandboxed environment.",
  globalThis: "globalThis is not available. Use builtins directly."
});
var EXPR_FUEL_COST = 0.01;
var STRING_FUEL_PER_CHAR = 0.0001;
var FUEL_PER_ALLOCATED_BYTE = STRING_FUEL_PER_CHAR / 2;
var ARRAY_FUEL_PER_ELEMENT = 0.001;
function sizeHint(v) {
  if (typeof v === "string")
    return v.length;
  if (Array.isArray(v))
    return v.length;
  if (v && typeof v === "object")
    return Object.keys(v).length;
  return 0;
}
var MAX_HEAP_BYTES = 64 * 1024 * 1024;
var HEAP_WALK_FUEL_PER_NODE = 0.001;
var SLOT_BYTES = 8;
function estimateBytes(value, cap, counted) {
  let bytes = 0;
  let nodes = 0;
  const seen = counted ?? new WeakSet;
  const stack = [value];
  while (stack.length && bytes <= cap) {
    const v = stack.pop();
    nodes++;
    if (v === null || v === undefined)
      continue;
    const t = typeof v;
    if (t === "string") {
      bytes += v.length * 2;
      continue;
    }
    if (t === "function")
      throw notGuestData();
    if (t !== "object")
      continue;
    if (seen.has(v))
      continue;
    seen.add(v);
    if (NAMESPACE_OBJECTS.has(v))
      throw notGuestData();
    bytes += 16;
    if (isGuestSet(v))
      bytes += v.length * SLOT_BYTES;
    if (isGuestRegex(v))
      bytes += regexBytes(v);
    if (ArrayBuffer.isView(v)) {
      bytes += v.byteLength;
    } else if (v instanceof ArrayBuffer) {
      bytes += v.byteLength;
    } else if (Array.isArray(v)) {
      for (let i = 0;i < v.length && bytes <= cap; i++) {
        bytes += SLOT_BYTES;
        stack.push(v[i]);
      }
    } else if (v instanceof Map) {
      for (const [k, mv] of v) {
        bytes += 2 * SLOT_BYTES;
        stack.push(k);
        stack.push(mv);
        if (bytes > cap)
          break;
      }
    } else if (v instanceof Set) {
      for (const sv of v) {
        bytes += SLOT_BYTES;
        stack.push(sv);
        if (bytes > cap)
          break;
      }
    } else if (!(v instanceof Date)) {
      const descriptors = Object.getOwnPropertyDescriptors(v);
      for (const k of Object.keys(descriptors)) {
        bytes += k.length * 2 + SLOT_BYTES;
        const d = descriptors[k];
        if ("value" in d)
          stack.push(d.value);
        if (bytes > cap)
          break;
      }
    }
  }
  return { bytes, nodes };
}
function heapWitness(value) {
  return Array.isArray(value) ? value.length : -1;
}
function chargeHeapWalk(ctx, nodes, op) {
  if (!ctx.fuel)
    return true;
  ctx.fuel.current -= nodes * HEAP_WALK_FUEL_PER_NODE;
  if (ctx.fuel.current > 0)
    return true;
  if (!ctx.error) {
    ctx.error = new AgentError("Out of Fuel", op);
  }
  return false;
}
var MUTATING_METHODS = new Set([
  "copyWithin",
  "fill",
  "pop",
  "push",
  "reverse",
  "shift",
  "sort",
  "splice",
  "unshift",
  "add",
  "remove",
  "clear"
]);
function receiverRoot(node, ctx) {
  for (let n = node;n && typeof n === "object"; n = n.object) {
    if (n.$expr === "ident")
      return n.name;
    if (n.$expr !== "member")
      return;
  }
  if (typeof node === "string" && (ctx.astVersion ?? 1) < 2)
    return node.split(".")[0];
  return;
}
function chargeInsertion(ctx, inserted, op) {
  const cap = ctx.maxHeapBytes ?? MAX_HEAP_BYTES;
  const { bytes, nodes } = estimateBytes(inserted, Math.max(0, cap - ctx.heapAccount.bytes));
  if (!chargeHeapWalk(ctx, nodes, op))
    return false;
  return chargeHeap(ctx, bytes, op, []);
}
function restampReceiver(ctx, receiver) {
  const name = receiverRoot(receiver, ctx);
  if (name !== undefined) {
    const owner = ownerOf(ctx, name);
    const ledger = owner === ctx.state ? ctx.heapPerKey : STATE_LEDGERS.get(owner);
    const entry = ledger?.get(name);
    if (entry && entry.ref === owner[name])
      entry.witness = heapWitness(entry.ref);
  }
}
function chargeHeap(ctx, bytes, op, pending) {
  const cap = ctx.maxHeapBytes ?? MAX_HEAP_BYTES;
  const account = ctx.heapAccount;
  account.bytes += bytes;
  if (account.bytes + account.transient <= cap)
    return true;
  const live = reconcileHeap(ctx, pending, op);
  if (live === undefined)
    return false;
  account.bytes = live;
  if (live + account.transient > cap) {
    ctx.error = heapLimitError(live + account.transient, cap, op);
    return false;
  }
  return true;
}
var EQUALITY_OPS = new Set(["==", "!=", "===", "!=="]);
function primitiveOperand(x, what, op) {
  if (x !== null && (typeof x === "object" || typeof x === "function"))
    throw new AgentError(`${what} needs a string, number, boolean or null, not ${Array.isArray(x) ? "an array" : typeof x === "function" ? "a function" : "an object"} — convert it explicitly (e.g. arr.join(','), JSON.stringify(obj))`, op);
}
function evaluateSum(node, ctx) {
  const operands = [];
  let n = node;
  while (n && n.$expr === "binary" && n.op === "+") {
    operands.unshift(n.right);
    n = n.left;
  }
  operands.unshift(n);
  const frame = ctx.allocFrame;
  const before = frame ? frame.bytes : 0;
  const values = operands.map((o) => {
    const v = evaluateExpr(o, ctx);
    primitiveOperand(v, "'+'", "expr.concat");
    return v;
  });
  let acc = values[0];
  let i = 1;
  while (i < values.length && typeof acc !== "string" && typeof values[i] !== "string")
    acc = acc + values[i++];
  if (i < values.length || typeof acc === "string") {
    let bound = stringFormBound(ctx, acc);
    for (let j = i;j < values.length; j++)
      bound += stringFormBound(ctx, values[j]);
    allocate(ctx, bound, "expr.concat");
    while (i < values.length)
      acc = acc + values[i++];
    if (frame) {
      const operandBytes = Math.max(0, frame.bytes - bound - before);
      frame.bytes -= operandBytes;
      ctx.heapAccount.transient -= operandBytes;
    }
  }
  return acc;
}
function stringFormBound(ctx, x) {
  if (typeof x === "string")
    return x.length * 2;
  if (x === null || typeof x !== "object")
    return SCALAR_STRING_BYTES;
  return treeBytes(ctx, x).bytes;
}
function treeBytes(ctx, x, json = false) {
  const cap = ctx.maxHeapBytes ?? MAX_HEAP_BYTES;
  const account = ctx.heapAccount;
  const limit = account ? Math.max(0, cap - account.bytes - account.transient) : cap;
  let bytes = 0;
  let slots = 0;
  let nodes = 0;
  let charged = 0;
  let depth = 0;
  const ancestors = new Set;
  const stack = [[x, false, 1]];
  while (stack.length && bytes <= limit) {
    const [v, exit, d] = stack.pop();
    if (exit) {
      ancestors.delete(v);
      continue;
    }
    if (++nodes - charged >= 1024) {
      if (!chargeHeapWalk(ctx, nodes - charged, "expr.measure"))
        throw new AgentError("Out of Fuel", "expr.measure");
      charged = nodes;
    }
    if (d > depth)
      depth = d;
    if (typeof v === "string") {
      bytes += (json ? jsonLength(v) : v.length) * 2 + 4;
      continue;
    }
    if (v === null || typeof v !== "object") {
      bytes += SCALAR_STRING_BYTES;
      continue;
    }
    if (ancestors.has(v))
      continue;
    ancestors.add(v);
    stack.push([v, true, d]);
    bytes += 8;
    const contents = v;
    if (Array.isArray(contents)) {
      slots += contents.length;
      for (let i = contents.length - 1;i >= 0; i--) {
        bytes += 2;
        stack.push([contents[i], false, d + 1]);
      }
    } else {
      const descriptors = Object.getOwnPropertyDescriptors(contents);
      for (const k of Object.keys(descriptors)) {
        bytes += (json ? jsonLength(k) : k.length) * 2 + 8;
        slots++;
        const desc = descriptors[k];
        if ("value" in desc)
          stack.push([desc.value, false, d + 1]);
      }
    }
  }
  if (nodes > charged && !chargeHeapWalk(ctx, nodes - charged, "expr.measure"))
    throw new AgentError("Out of Fuel", "expr.measure");
  const truncated = bytes > limit;
  return { bytes: truncated ? cap + 1 : bytes, slots, nodes, depth, truncated };
}
function jsonLength(s) {
  let n = s.length;
  for (let i = 0;i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 32)
      n += 5;
    else if (c === 34 || c === 92)
      n += 1;
    else if (c >= 55296 && c <= 57343) {
      const pair = c <= 56319 && i + 1 < s.length && s.charCodeAt(i + 1) >= 56320 && s.charCodeAt(i + 1) <= 57343;
      if (pair)
        i++;
      else
        n += 5;
    }
  }
  return n;
}
var SCALAR_STRING_BYTES = 64;
function allocate(ctx, bytes, op) {
  if (!(bytes > 0))
    return;
  const ceiling = ctx.maxHeapBytes ?? MAX_HEAP_BYTES;
  if (bytes > ceiling)
    throw heapLimitError(bytes, ceiling, op);
  if (ctx.fuel) {
    ctx.fuel.current -= bytes * FUEL_PER_ALLOCATED_BYTE;
    if (ctx.fuel.current <= 0)
      throw new AgentError("Out of Fuel", op);
  }
  const cap = ctx.maxHeapBytes ?? MAX_HEAP_BYTES;
  const account = ctx.heapAccount;
  if (account.bytes + account.transient + bytes > cap) {
    const live = reconcileHeap(ctx, [], op);
    if (live === undefined)
      throw new AgentError("Out of Fuel", op);
    account.bytes = live;
    if (live + account.transient + bytes > cap)
      throw heapLimitError(live + account.transient + bytes, cap, op);
  }
  account.transient += bytes;
  if (ctx.allocFrame)
    ctx.allocFrame.bytes += bytes;
}
function reconcileHeap(ctx, pending, op) {
  ctx.heapAccount.measured = undefined;
  const cap = ctx.maxHeapBytes ?? MAX_HEAP_BYTES;
  const counted = new WeakSet;
  const { bytes, nodes } = estimateBytes([...ctx.heapRoots, ...pending], cap, counted);
  ctx.heapAccount.measured = counted;
  if (!chargeHeapWalk(ctx, nodes, op))
    return;
  return bytes;
}
function heapLimitError(total, cap, op) {
  return new AgentError(`Heap limit exceeded: guest state holds ~${Math.round(total / 1048576)}MB, ` + `limit ${Math.round(cap / 1048576)}MB. Fuel bounds total work; this bounds peak ` + `memory. Raise it with the maxHeapBytes run option if the workload genuinely ` + `needs it.`, op);
}
function trackHeapWrite(ctx, key, value, op, ownerLedger) {
  const cap = ctx.maxHeapBytes ?? MAX_HEAP_BYTES;
  ledgerFor(ctx.state, ctx.heapPerKey);
  const ledger = ownerLedger ?? ctx.heapPerKey;
  const prevEntry = ledger.get(key);
  const witness = heapWitness(value);
  if (prevEntry && prevEntry.ref === value && prevEntry.witness === witness && typeof value === "object")
    return true;
  if (value !== null && typeof value === "object" && ctx.heapAccount.measured?.has(value)) {
    ledger.set(key, { size: 0, ref: value, witness });
    return chargeHeap(ctx, SLOT_BYTES, op, []);
  }
  const appended = prevEntry && prevEntry.ref === value && Array.isArray(value) && witness > prevEntry.witness;
  const headroom = Math.max(0, cap - ctx.heapAccount.bytes);
  const { bytes, nodes } = estimateBytes(appended ? value.slice(prevEntry.witness) : value, headroom);
  if (!chargeHeapWalk(ctx, nodes, op))
    return false;
  ledger.set(key, {
    size: (appended ? prevEntry.size : 0) + bytes,
    ref: value,
    witness
  });
  if (value !== null && typeof value === "object")
    (ctx.heapAccount.measured ??= new WeakSet).add(value);
  return chargeHeap(ctx, bytes, op, []);
}
function setStateVar(ctx, key, value, op, opts) {
  assertSafeProperty(key);
  const target = opts?.owner ?? ctx.state;
  if (constAt(target, key))
    throw new Error(`Cannot reassign const variable '${key}'`);
  const ledger = target === ctx.state ? undefined : STATE_LEDGERS.get(target) ?? undefined;
  if (target !== ctx.state && !ledger)
    throw new Error(`Internal: no heap ledger for the scope that owns '${key}' — refusing an unaccounted write`);
  const had = Object.prototype.hasOwnProperty.call(target, key);
  const previous = target[key];
  target[key] = value;
  if (!opts?.alias && ctx.allocFrame && ctx.allocFrame.bytes) {
    ctx.heapAccount.transient -= ctx.allocFrame.bytes;
    ctx.allocFrame.bytes = 0;
  }
  const rollback = () => {
    if (had)
      target[key] = previous;
    else
      delete target[key];
  };
  let charged;
  try {
    charged = opts?.alias === true || trackHeapWrite(ctx, key, value, op, ledger);
  } catch (e) {
    rollback();
    throw e;
  }
  if (!charged) {
    rollback();
    return false;
  }
  return true;
}
function chargeForSize(ctx, value, op) {
  if (!ctx.fuel)
    return true;
  const n = sizeHint(value);
  if (n > 0) {
    ctx.fuel.current -= typeof value === "string" ? n * STRING_FUEL_PER_CHAR : n * ARRAY_FUEL_PER_ELEMENT;
  }
  if (ctx.fuel.current <= 0) {
    ctx.error = new AgentError("Out of Fuel", op);
    return false;
  }
  return true;
}
function evaluateExpr(node, ctx) {
  return guestValue(evaluateCallable(node, ctx));
}
function guestValue(v) {
  if (typeof v === "function" || v && typeof v === "object" && NAMESPACE_OBJECTS.has(v))
    throw new AgentError("A function or builtin namespace is not a value in AsyncJS: call it (e.g. Math.max(a, b), s.trim())", "expr");
  return v;
}
function evaluateCallable(node, ctx) {
  if (node === null || node === undefined) {
    return node;
  }
  if (typeof node !== "object" || !("$expr" in node)) {
    return node;
  }
  if (ctx.fuel) {
    ctx.fuel.current -= EXPR_FUEL_COST;
    if (ctx.fuel.current <= 0) {
      throw new Error("Out of Fuel");
    }
  }
  switch (node.$expr) {
    case "literal":
      return node.value;
    case "ident": {
      if (scopeHas(ctx.state, node.name)) {
        return ctx.state[node.name];
      }
      if (scopeHas(ctx.args, node.name)) {
        return argValue(ctx, node.name);
      }
      if (own(builtins, node.name)) {
        return builtins[node.name];
      }
      if (own(unsupportedBuiltins, node.name)) {
        throw new Error(unsupportedBuiltins[node.name]);
      }
      return;
    }
    case "member": {
      const obj = evaluateCallable(node.object, ctx);
      if (node.optional && (obj === null || obj === undefined)) {
        return;
      }
      const prop = typeof node.property === "object" && node.property !== null ? evaluateExpr(node.property, ctx) : node.property;
      primitiveOperand(prop, "a computed key", "expr.member");
      assertSafeProperty(String(prop));
      const value = guestMember(obj, prop);
      if (typeof value === "function" || value === undefined && typeof prop === "string" && (isGuestSet(obj) || isGuestDate(obj) || isGuestRegex(obj)) && typeof intrinsicMethod(obj, prop) === "function")
        throw new AgentError(`'${String(prop)}' is a method: call it — a method is not a value in AsyncJS`, "expr.member");
      return value;
    }
    case "binary": {
      if (node.op === "+")
        return evaluateSum(node, ctx);
      const left = evaluateExpr(node.left, ctx);
      const right = evaluateExpr(node.right, ctx);
      if (!EQUALITY_OPS.has(node.op)) {
        primitiveOperand(left, `'${node.op}'`, "expr.binary");
        primitiveOperand(right, `'${node.op}'`, "expr.binary");
      }
      switch (node.op) {
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          return left / right;
        case "%":
          return left % right;
        case "**":
          return left ** right;
        case ">":
          return left > right;
        case "<":
          return left < right;
        case ">=":
          return left >= right;
        case "<=":
          return left <= right;
        case "==":
          return eqValue(left, right);
        case "!=":
          return !eqValue(left, right);
        case "===":
          return left === right;
        case "!==":
          return left !== right;
        default:
          throw new Error(`Unknown binary operator: ${node.op}`);
      }
    }
    case "unary": {
      const arg = evaluateExpr(node.argument, ctx);
      if (node.op === "-" || node.op === "+")
        primitiveOperand(arg, `unary '${node.op}'`, "expr.unary");
      switch (node.op) {
        case "!":
          return !arg;
        case "-":
          return -arg;
        case "+":
          return +arg;
        case "typeof":
          return typeof arg;
        default:
          throw new Error(`Unknown unary operator: ${node.op}`);
      }
    }
    case "logical": {
      const left = evaluateExpr(node.left, ctx);
      if (node.op === "&&") {
        return left ? evaluateExpr(node.right, ctx) : left;
      } else if (node.op === "??") {
        return left ?? evaluateExpr(node.right, ctx);
      } else {
        return left ? left : evaluateExpr(node.right, ctx);
      }
    }
    case "regex": {
      if (typeof node.pattern !== "string" || typeof node.flags !== "string")
        throw new Error("A regex node needs a string pattern and flags");
      let re;
      try {
        re = compileRegex(node.pattern, node.flags, regexFuel(ctx, "expr.regex"), (bytes) => allocate(ctx, bytes, "expr.regex"));
      } catch (e) {
        if (e instanceof AgentError)
          throw e;
        throw new AgentError(reduceThrown(e), "expr.regex");
      }
      return re;
    }
    case "conditional": {
      const test = evaluateExpr(node.test, ctx);
      return test ? evaluateExpr(node.consequent, ctx) : evaluateExpr(node.alternate, ctx);
    }
    case "array":
      return node.elements.map((el) => evaluateExpr(el, ctx));
    case "object": {
      const result = {};
      for (const prop of node.properties) {
        setGuestKey(result, prop.key, evaluateExpr(prop.value, ctx));
      }
      return result;
    }
    case "call": {
      if (node.callee === "Error") {
        const args = node.arguments.map((arg) => evaluateExpr(arg, ctx));
        const message = typeof args[0] === "string" ? args[0] : "Error";
        ctx.error = new AgentError(message, "Error");
        return;
      }
      if (own(builtins, node.callee)) {
        const fn = builtins[node.callee];
        if (typeof fn === "function") {
          const args = node.arguments.map((arg) => evaluateExpr(arg, ctx));
          const sig = Object.prototype.hasOwnProperty.call(GLOBAL_SIGS, node.callee) ? GLOBAL_SIGS[node.callee] : undefined;
          if (!sig)
            throw new Error(`${node.callee}() is not available in AsyncJS`);
          checkArgs(sig, args, `${node.callee}()`, `expr.${node.callee}`);
          allocate(ctx, sig.bound(undefined, args, ctx), `expr.${node.callee}`);
          if (node.callee === "Date" && args.length === 0)
            return builtins.Date(guestNow(ctx, "Date()"));
          return fn(...args);
        }
      }
      const atom = ctx.resolver(node.callee);
      if (!atom) {
        if (own(unsupportedBuiltins, node.callee)) {
          throw new Error(unsupportedBuiltins[node.callee]);
        }
        throw new Error(`Unknown function: ${node.callee}`);
      }
      throw new Error(`Atom calls in expressions not yet supported: ${node.callee}`);
    }
    case "methodCall": {
      const obj = evaluateCallable(node.object, ctx);
      if (node.optional && (obj === null || obj === undefined)) {
        return;
      }
      const method = node.method;
      assertSafeProperty(method);
      if (!SAFE_METHOD_NAMES.has(method)) {
        throw new Error(`Security Error: method '${method}' is not callable in AsyncJS`);
      }
      if (obj === null || obj === undefined) {
        throw new Error(`Cannot call method '${method}' on ${obj}`);
      }
      const fn = obj === GUEST_SCHEMA ? undefined : intrinsicMethod(obj, method);
      if (obj !== GUEST_SCHEMA && typeof fn !== "function") {
        throw new Error(`'${method}' is not a function`);
      }
      const args = node.arguments.map((arg) => evaluateExpr(arg, ctx));
      const bound = methodGate(obj, method, args, ctx);
      if (bound === "vm")
        return vmMethod(ctx, obj, method, args);
      if (typeof fn !== "function")
        throw new Error(`'${method}' is not a function`);
      allocate(ctx, bound, `expr.${method}`);
      const granted = grantedSource(ctx, obj, method);
      if (granted !== undefined)
        return granted;
      const mutates = MUTATING_METHODS.has(method) && typeof obj === "object";
      const assigns = method === "assign" && obj === builtins.Object;
      if (assigns && (isGuestSet(args[0]) || isGuestDate(args[0])))
        throw new AgentError("Object.assign cannot write into a Set or a Date (use its methods)", "expr.assign");
      if (mutates && !chargeInsertion(ctx, args, `expr.${method}`))
        return;
      if (assigns && !chargeInsertion(ctx, args.slice(1), "expr.assign"))
        return;
      const result = fn.apply(obj, args);
      if (mutates)
        restampReceiver(ctx, node.object);
      if (assigns)
        restampReceiver(ctx, node.arguments[0]);
      return result;
    }
    default:
      throw new Error(`Unknown expression type: ${node.$expr}`);
  }
}
function withoutControlKeys(step) {
  const out = {};
  for (const key of Object.keys(step))
    if (!STEP_CONTROL_KEYS.has(key))
      setGuestKey(out, key, step[key]);
  return out;
}
function inputsResolvedContext(ctx) {
  const derived = { ...ctx, inputsResolved: true };
  RESOLVED_ORIGIN.set(derived, ctx);
  for (const field of ["error", "output"])
    Object.defineProperty(derived, field, {
      get: () => ctx[field],
      set: (v) => {
        ctx[field] = v;
      },
      enumerable: true,
      configurable: true
    });
  return derived;
}
var RESOLVED_ORIGIN = new WeakMap;
var STEP_CONTROL_KEYS = new Set([
  "op",
  "result",
  "resultConst",
  "resultAssign"
]);
function egressValue(ctx, op, value, subject = `the input to '${op}'`) {
  const cap = ctx.membraneMaxBytes ?? MEMBRANE_MAX_BYTES;
  const payable = ctx.fuel ? Math.max(0, ctx.fuel.current) / FUEL_PER_ALLOCATED_BYTE : Infinity;
  const { budget, boundBy } = crossingBudget(cap, payable);
  const fuelAtEntry = ctx.fuel?.current ?? 0;
  let walked = 0;
  const bill = (error) => {
    const spent = ctx.fuel ? fuelAtEntry - ctx.fuel.current : 0;
    const owedBytes = Math.max(0, walked - spent / FUEL_PER_ALLOCATED_BYTE);
    if (chargeWalkFuel(ctx, owedBytes))
      throw haltRun(ctx, new AgentError("Out of Fuel", op));
    throw haltRun(ctx, error instanceof AgentError ? error : new AgentError(reduceThrown(error), op));
  };
  let crossed;
  try {
    crossed = membraneValueFrom(subject, value, budget, (bytes) => {
      walked = bytes;
      allocate(ctx, bytes, op);
    });
  } catch (e) {
    return bill(e);
  }
  if (!crossed.ok) {
    walked = crossed.walked;
    return bill(new AgentError(`'${op}': ${boundReason(crossed, boundBy)}`, op));
  }
  return crossed.value;
}
function ingressValue(ctx, op, result, outputSchema) {
  const { budget, boundBy } = crossingBudget(ctx.membraneMaxBytes ?? MEMBRANE_MAX_BYTES);
  const crossed = membraneValue(result, budget);
  const exhausted = chargeWalkFuel(ctx, crossed.ok ? crossed.bytes ?? 0 : crossed.walked);
  if (!crossed.ok) {
    const error = new AgentError(`Capability boundary rejected the return of '${op}': ${boundReason(crossed, boundBy)}`, op);
    if (crossed.kind === "shape")
      throw haltRun(ctx, error);
    throw exhausted ? new AgentError("Out of Fuel", op) : error;
  }
  if (exhausted)
    throw new AgentError("Out of Fuel", op);
  if (crossed.value !== undefined && outputSchema && !qe(crossed.value, outputSchema))
    throw new AgentError(`Output validation failed for '${op}'`, op);
  return crossed.value;
}
function chargeWalkFuel(ctx, bytes) {
  if (!ctx.fuel || !Number.isFinite(ctx.fuel.current))
    return false;
  ctx.fuel.current = Math.max(0, ctx.fuel.current - bytes * FUEL_PER_ALLOCATED_BYTE);
  return ctx.fuel.current <= 0;
}
var MAX_THROWN_MESSAGE = 8192;
function reduceThrown(e) {
  const message = readOnce2(e, "message");
  if (typeof message === "string")
    return capThrown(message);
  if (e !== null && e !== undefined && typeof e !== "object" && typeof e !== "function")
    return capThrown(String(e));
  return "an atom failed with a value that is not a message";
}
function reduceOp(e) {
  const op = readOnce2(e, "op");
  return typeof op === "string" ? op.slice(0, 256) : undefined;
}
function readOnce2(e, key) {
  if (e === null || typeof e !== "object" && typeof e !== "function")
    return;
  try {
    return e[key];
  } catch {
    return;
  }
}
function capThrown(m) {
  return m.length > MAX_THROWN_MESSAGE ? m.slice(0, MAX_THROWN_MESSAGE) + "…" : m;
}
function crossingBudget(cap, payable = Infinity) {
  return payable < cap ? { budget: payable, boundBy: "the remaining fuel" } : { budget: cap, boundBy: "membraneMaxBytes" };
}
function boundReason(crossed, boundBy) {
  return crossed.kind === "limit" && boundBy !== "membraneMaxBytes" ? `${crossed.reason}, set by ${boundBy}` : crossed.reason;
}
var PENDING = Symbol("pending");
var NOT_YET = Promise.resolve(PENDING);
function settledNow(p) {
  return Promise.race([p, NOT_YET]).then((v) => v !== PENDING, () => true);
}
function pureReturnRefusal(ctx, op, value) {
  const seen = new Set;
  const stack = [value];
  while (stack.length) {
    const v = stack.pop();
    if (ctx.fuel && (ctx.fuel.current -= VALIDATION_FUEL_PER_STEP) <= 0)
      throw new AgentError("Out of Fuel", op);
    if (v === null || v === undefined || typeof v === "string" || typeof v === "number" || typeof v === "boolean")
      continue;
    if (typeof v !== "object")
      return typeof v === "function" ? "a function, which is not a value in AJS" : `a ${typeof v}`;
    if (seen.has(v))
      continue;
    seen.add(v);
    const kind = admitKind(v);
    if (kind.kind === "refused")
      return kind.reason;
    if (kind.kind === "date")
      continue;
    for (const [key, d] of Object.entries(Object.getOwnPropertyDescriptors(v))) {
      if (!("value" in d))
        return "an accessor property (a getter or setter)";
      if (key === "__proto__")
        return "an object with an own '__proto__' key, which would replace the prototype of anything it is merged into";
      stack.push(d.value);
    }
  }
  return;
}
function haltRun(ctx, error) {
  if (ctx.halt && !ctx.halt.error)
    ctx.halt.error = error;
  return ctx.halt?.error ?? error;
}
function egressInput(atom, resolved, ctx, op) {
  if (atom.effects !== "io")
    return resolved;
  const schema = ioSchemaOf(atom, op);
  const copy = egressValue(ctx, op, withoutControlKeys(resolved));
  if (!qe(copy, schema))
    throw haltRun(ctx, new AgentError(`'${op}': its input does not have the shape the atom declares`, op));
  const out = Object.assign(Object.create(null), copy);
  for (const key of STEP_CONTROL_KEYS)
    if (key in resolved)
      out[key] = resolved[key];
  return out;
}
function resolveAtomInputs(step, ctx) {
  const out = {};
  for (const key of Object.keys(step)) {
    setGuestKey(out, key, STEP_CONTROL_KEYS.has(key) ? step[key] : resolveValue(step[key], ctx));
  }
  return out;
}
var SCHEMA_MAP_KEYWORDS = new Set([
  "properties",
  "$defs",
  "definitions",
  "dependentSchemas",
  "dependencies"
]);
var SCHEMA_DATA_KEYWORDS = new Set([
  "enum",
  "const",
  "default",
  "examples",
  "dependentRequired",
  "required"
]);
function admitIoInputSchema(op, inputSchema) {
  const refuse = (why) => {
    throw new Error(`Atom '${op}' is an IO atom whose input schema ${why}.`);
  };
  if (inputSchema == null)
    throw new Error(`Atom '${op}' is an IO atom and declares no input schema. Every call is checked against ` + `it at the capability boundary: declare what it takes, or s.object({}) for nothing.`);
  const onPath = new Set;
  const copy = (v, asSchema, depth) => {
    if (depth > 200)
      refuse("is nested too deeply");
    if (v === null || typeof v === "string" || typeof v === "boolean")
      return v;
    if (typeof v === "number")
      return Number.isFinite(v) ? v : refuse("contains a non-finite number");
    if (typeof v !== "object")
      return refuse(`contains a ${typeof v}, which is not JSON`);
    if (F(v))
      return copy(v.schema, asSchema, depth + 1);
    if (onPath.has(v))
      return refuse("is cyclic");
    onPath.add(v);
    try {
      if (Array.isArray(v))
        return v.map((x) => copy(x, asSchema, depth + 1));
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null)
        refuse(`contains an instance of ${proto?.constructor?.name || "a class"}, which is not JSON`);
      if (asSchema && (Object.prototype.hasOwnProperty.call(v, "pattern") || Object.prototype.hasOwnProperty.call(v, "patternProperties")))
        refuse("uses a regex ('pattern'/'patternProperties'): it would run on the host's regex " + "engine over guest-chosen strings; check the pattern in the atom's body instead");
      const out = Object.create(null);
      for (const key of Object.keys(v)) {
        const d = Object.getOwnPropertyDescriptor(v, key);
        if (d.get || d.set)
          refuse(`has an accessor '${key}', which is not JSON`);
        if (d.value === undefined)
          continue;
        if (!asSchema || SCHEMA_DATA_KEYWORDS.has(key))
          setGuestKey(out, key, copy(d.value, false, depth + 1));
        else if (SCHEMA_MAP_KEYWORDS.has(key) && d.value && typeof d.value === "object") {
          const map = Object.create(null);
          for (const name of Object.keys(d.value)) {
            const nd = Object.getOwnPropertyDescriptor(d.value, name);
            if (nd.get || nd.set)
              refuse(`has an accessor '${name}', which is not JSON`);
            setGuestKey(map, name, copy(nd.value, true, depth + 2));
          }
          setGuestKey(out, key, map);
        } else
          setGuestKey(out, key, copy(d.value, true, depth + 1));
      }
      return out;
    } finally {
      onPath.delete(v);
    }
  };
  return deepFreeze(copy(inputSchema, true, 0));
}
var IO_SCHEMAS = new WeakMap;
var IO_SCHEMA_REFUSALS = new WeakMap;
function ioSchemaOf(atom, op) {
  const refused = IO_SCHEMA_REFUSALS.get(atom);
  if (refused)
    throw refused;
  let schema = IO_SCHEMAS.get(atom);
  if (schema === undefined) {
    try {
      schema = admitIoInputSchema(op, atom.inputSchema);
    } catch (e) {
      IO_SCHEMA_REFUSALS.set(atom, e);
      throw e;
    }
    IO_SCHEMAS.set(atom, schema);
  }
  return schema;
}
function defineAtom(op, inputSchema, outputSchema, fn, options = {}) {
  const {
    docs = "",
    timeoutMs = 1000,
    cost = 1,
    effects = "io",
    resolveInputs = true
  } = typeof options === "string" ? { docs: options } : options;
  const atomTimeout = budgetOrFunction(`timeoutMs of atom '${op}'`, timeoutMs, 1000);
  const admittedSchema = effects === "io" ? admitIoInputSchema(op, inputSchema) : undefined;
  const exec = async (step, ctx) => {
    if (ctx.inputsResolved) {
      const origin = RESOLVED_ORIGIN.get(ctx);
      if (!origin || origin.state !== ctx.state)
        throw new Error(`'${op}' was run on a copy of an atom's context. An atom that runs steps must hand ` + `them the context it received, or a scope from createChildScope(ctx) — or be ` + `defined with { resolveInputs: false }`);
      ctx = origin;
    }
    const { op: _op, result: _res, ...inputData } = step;
    const frame = { bytes: 0 };
    const outerFrame = ctx.allocFrame;
    ctx.allocFrame = frame;
    try {
      if (ctx.error)
        return;
      const stateBefore = ctx.trace ? { ...ctx.state } : null;
      const fuelBefore = ctx.fuel.current;
      let result;
      let error;
      try {
        const admittedQuota = ctx.quotas?.[op];
        if (admittedQuota !== undefined) {
          const quota = checkedQuota(admittedQuota, op);
          if (!ctx.quotaUsed)
            ctx.quotaUsed = {};
          if (!ctx.quotaLocal)
            ctx.quotaLocal = Object.create(null);
          const local = ctx.quotaLocal;
          const used = Math.max(quotaCount(ctx.quotaUsed, op), local[op] ?? 0);
          if (used >= quota) {
            ctx.error = new AgentError(`Quota exceeded for '${op}': ${quota} call${quota === 1 ? "" : "s"} allowed`, op);
            return;
          }
          local[op] = used + 1;
          ctx.quotaUsed[op] = used + 1;
        }
        if (ctx.halt.error) {
          ctx.error = ctx.halt.error;
          return;
        }
        if (ctx.signal?.aborted) {
          ctx.error = new AgentError("Execution aborted", op);
          return;
        }
        const clock = ctx.clock;
        if (clock && (++clock.steps & CLOCK_EVERY_STEPS - 1) === 0) {
          const now = performance.now();
          if (now >= clock.deadline) {
            clock.expire();
            ctx.error = new AgentError("Execution aborted", op);
            return;
          }
          if (now >= clock.sliceEnd) {
            await yieldToHost();
            clock.sliceEnd = performance.now() + CLOCK_SLICE_MS;
            if (ctx.halt.error) {
              ctx.error = ctx.halt.error;
              return;
            }
            if (ctx.signal?.aborted) {
              ctx.error = new AgentError("Execution aborted", op);
              return;
            }
          }
        }
        const resolvedInput = atom.resolveInputs ? resolveAtomInputs(step, ctx) : step;
        let fnInputMemo;
        const fnInput = () => fnInputMemo ??= atom.resolveInputs ? withoutControlKeys(resolvedInput) : inputData;
        const overrideCost = ctx.costOverrides?.[op];
        const baseCost = overrideCost !== undefined ? overrideCost : cost;
        const currentCost = checkedCost(typeof baseCost === "function" ? baseCost(fnInput(), ctx) : baseCost, op);
        if ((ctx.fuel.current -= currentCost) <= 0) {
          ctx.error = new AgentError("Out of Fuel", op);
          return;
        }
        const callInput = atom.resolveInputs ? egressInput(atom, resolvedInput, ctx, op) : step;
        const overrideTimeout = ctx.timeoutOverrides?.[op];
        const baseTimeout = overrideTimeout !== undefined ? overrideTimeout : atomTimeout;
        const armedTimeout = timerMs(typeof baseTimeout === "function" ? baseTimeout(fnInput(), ctx) : baseTimeout);
        let timer;
        const atomCtx = atom.resolveInputs ? inputsResolvedContext(ctx) : ctx;
        const startedAt = performance.now();
        let running;
        try {
          running = Promise.resolve(fn(callInput, atomCtx));
        } catch (e) {
          running = Promise.reject(e);
        }
        if (armedTimeout === undefined)
          result = await running;
        else {
          if (await settledNow(running))
            result = await running;
          else
            result = await Promise.race([
              running,
              new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`Atom '${op}' timed out`)), Math.max(0, armedTimeout - (performance.now() - startedAt)));
              })
            ]).finally(() => clearTimeout(timer));
        }
        if (step.result) {
          assertSafeProperty(step.result);
          if (step.resultConst && own(ctx.state, step.result)) {
            throw new Error(`Cannot redeclare variable '${step.result}' as const`);
          }
          if (atom.effects === "io" && result !== undefined)
            result = ingressValue(ctx, op, result, outputSchema);
          else if (result !== undefined && coreAtoms[op] !== atom) {
            const why = pureReturnRefusal(ctx, op, result);
            if (why) {
              ctx.error = haltRun(ctx, new AgentError(`'${op}' is tagged pure but returned something that is not guest data: ${why}. ` + `Return JSON data or a Date, or tag the atom effects: 'io' so its return is copied.`, op));
              return;
            }
          }
          if (atom.effects !== "io" && result !== undefined && outputSchema && !qe(result, outputSchema)) {
            ctx.error = new AgentError(`Output validation failed for '${op}'`, op);
            return;
          }
          const owner = step.resultAssign ? ownerOf(ctx, step.result) : undefined;
          if (!setStateVar(ctx, step.result, result, op, owner ? { owner } : undefined))
            return;
          if (step.resultConst)
            markConst(ctx, step.result);
        }
      } catch (e) {
        error = reduceThrown(e);
        ctx.error = e instanceof AgentError ? e : new AgentError(error, op, e);
      } finally {
        if (ctx.trace && stateBefore) {
          const stateDiff = diffObjects(stateBefore, ctx.state);
          ctx.trace.push({
            op,
            input: inputData,
            stateDiff,
            result,
            error,
            fuelBefore,
            fuelAfter: ctx.fuel.current,
            timestamp: Date.now()
          });
        }
      }
    } finally {
      ctx.heapAccount.transient -= frame.bytes;
      ctx.allocFrame = outerFrame;
    }
  };
  const atom = {
    op,
    inputSchema,
    outputSchema,
    exec,
    docs,
    timeoutMs: atomTimeout,
    cost,
    effects,
    resolveInputs,
    create: (input) => ({ op, ...input })
  };
  if (admittedSchema !== undefined)
    IO_SCHEMAS.set(atom, admittedSchema);
  return atom;
}
var seq = defineAtom("seq", Ue.object({ steps: Ue.array(Ue.any) }), undefined, async ({ steps }, ctx) => {
  for (const step of steps) {
    if (ctx.output !== undefined)
      return;
    if (ctx.error)
      return;
    const atom = ctx.resolver(step.op);
    if (!atom)
      throw new Error(`Unknown Atom: ${step.op}`);
    await atom.exec(step, ctx);
  }
}, { docs: "Sequence", timeoutMs: 0, cost: 0.1 });
async function runBlock(ctx, steps, scoped = (ctx.astVersion ?? AST_VERSION_LEGACY) >= 2, bind) {
  if (!scoped) {
    for (const [k, v] of Object.entries(bind ?? {}))
      if (!setStateVar(ctx, k, v, "catch"))
        return;
    await seq.exec({ op: "seq", steps }, ctx);
    return;
  }
  const block = createChildScope(ctx);
  try {
    for (const [k, v] of Object.entries(bind ?? {}))
      if (!setStateVar(block, k, v, "catch"))
        return;
    await seq.exec({ op: "seq", steps }, block);
    if (block.output !== undefined)
      ctx.output = block.output;
  } finally {
    releaseScope(block);
  }
}
var iff = defineAtom("if", Ue.object({
  condition: Ue.any,
  then: Ue.array(Ue.any),
  else: Ue.array(Ue.any).optional
}), undefined, async (step, ctx) => {
  if (evaluateExpr(step.condition, ctx)) {
    await runBlock(ctx, step.then);
  } else if (step.else) {
    await runBlock(ctx, step.else);
  }
}, { docs: "If/Else", timeoutMs: 0, cost: 0.1 });
var whileLoop = defineAtom("while", Ue.object({
  condition: Ue.any,
  body: Ue.array(Ue.any)
}), undefined, async (step, ctx) => {
  const blockScoped = (ctx.astVersion ?? AST_VERSION_LEGACY) >= 2;
  while (evaluateExpr(step.condition, ctx)) {
    if (ctx.signal?.aborted)
      throw new Error("Execution aborted");
    if ((ctx.fuel.current -= 0.1) <= 0)
      throw new Error("Out of Fuel");
    await runBlock(ctx, step.body, blockScoped);
    if (ctx.output !== undefined)
      return;
    if (ctx.error)
      return;
  }
}, { docs: "While Loop", timeoutMs: 0, cost: 0.1 });
var ret = defineAtom("return", Ue.any, Ue.any, async (step, ctx) => {
  if (ctx.error) {
    ctx.output = ctx.error;
    return ctx.error;
  }
  if ("value" in step) {
    const res = resolveValue(step.value, ctx);
    if (!ctx.localCall && res !== undefined && res !== null && !isAgentError(res) && (typeof res !== "object" || Array.isArray(res))) {
      const err = new AgentError(`Agent must return an object, got ${Array.isArray(res) ? "array" : typeof res}`, "return");
      ctx.error = err;
      ctx.output = err;
      return err;
    }
    ctx.output = res;
    return res;
  }
  let res = {};
  if (step.schema?.properties) {
    for (const key of Object.keys(step.schema.properties)) {
      setGuestKey(res, key, ownValue(ownerOf(ctx, key), key));
    }
    if (step.filter !== false) {
      const nodes = admitGuestSchema(step.schema, "return");
      chargeValidation(ctx, nodes, res, "return");
      const filterResult = Ge(res, step.schema);
      if (!(filterResult instanceof Error)) {
        res = filterResult;
      }
    }
  }
  ctx.output = res;
  return res;
}, { docs: "Return", cost: 0.1 });
var tryCatch = defineAtom("try", Ue.object({
  try: Ue.array(Ue.any),
  catch: Ue.array(Ue.any).optional,
  catchParam: Ue.string.optional,
  finally: Ue.array(Ue.any).optional
}), undefined, async (step, ctx) => {
  await tryAndCatch(step, ctx);
  if (step.finally && !ctx.halt.error) {
    const pendingError = ctx.error;
    const pendingOutput = ctx.output;
    ctx.error = undefined;
    ctx.output = undefined;
    await runBlock(ctx, step.finally);
    if (ctx.error === undefined && ctx.output === undefined) {
      ctx.error = pendingError;
      ctx.output = pendingOutput;
    }
  }
}, { docs: "Try/Catch/Finally", timeoutMs: 0, cost: 0.1 });
async function tryAndCatch(step, ctx) {
  await runBlock(ctx, step.try);
  if (ctx.error && step.catch) {
    const paramName = step.catchParam || "error";
    const bind = {
      [paramName]: reduceThrown(ctx.error),
      errorOp: reduceOp(ctx.error)
    };
    ctx.error = undefined;
    await runBlock(ctx, step.catch, undefined, bind);
  }
}
var errorAtom = defineAtom("Error", Ue.object({ args: Ue.array(Ue.any).optional }), undefined, async (step, ctx) => {
  const raw = step.args?.length ? resolveValue(step.args[0], ctx) : "Error";
  const message = typeof raw === "string" ? raw : typeof raw === "number" || typeof raw === "boolean" ? String(raw) : raw === undefined || raw === null ? "Error" : `Error() takes a string message, not ${Array.isArray(raw) ? "an array" : "an object"}`;
  ctx.error = new AgentError(message, "Error");
}, { docs: "Trigger error flow", cost: 0.1, resolveInputs: false });
var CONST_BINDINGS = new WeakMap;
function markConst(ctx, key) {
  let set = CONST_BINDINGS.get(ctx.state);
  if (!set)
    CONST_BINDINGS.set(ctx.state, set = new Set);
  set.add(key);
  ctx.consts.add(key);
}
function constAt(owner, key) {
  return Object.prototype.hasOwnProperty.call(owner, key) && (CONST_BINDINGS.get(owner)?.has(key) ?? false);
}
var evaluate = defineAtom("evaluate", Ue.object({ value: Ue.any }), undefined, async ({ value }, ctx) => {
  resolveValue(value, ctx);
}, {
  docs: "Evaluate an expression for its effects (an expression statement)",
  cost: 0.1
});
var varSet = defineAtom("varSet", Ue.object({ key: Ue.string, value: Ue.any }), undefined, async ({ key, value }, ctx) => {
  assertSafeProperty(key);
  const v = resolveValue(value, ctx);
  if (!setStateVar(ctx, key, v, "varSet"))
    return;
}, { docs: "Set Variable", cost: 0.1 });
function ownerOf(ctx, key) {
  for (let o = ctx.state;o != null && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
    if (Object.prototype.hasOwnProperty.call(o, key))
      return o;
  }
  return ctx.state;
}
var varAssign = defineAtom("varAssign", Ue.object({ key: Ue.string, value: Ue.any }), undefined, async ({ key, value }, ctx) => {
  assertSafeProperty(key);
  const owner = ownerOf(ctx, key);
  const v = resolveValue(value, ctx);
  if (!setStateVar(ctx, key, v, "varAssign", { owner }))
    return;
}, { docs: "Assign Variable (writes the scope that owns it)", cost: 0.1 });
var constSet = defineAtom("constSet", Ue.object({ key: Ue.string, value: Ue.any }), undefined, async ({ key, value }, ctx) => {
  assertSafeProperty(key);
  if (own(ctx.state, key)) {
    throw new Error(constAt(ctx.state, key) ? `Cannot reassign const variable '${key}'` : `Cannot redeclare variable '${key}' as const`);
  }
  const cv = resolveValue(value, ctx);
  if (!setStateVar(ctx, key, cv, "constSet"))
    return;
  markConst(ctx, key);
}, { docs: "Set Const Variable (immutable)", cost: 0.1 });
var varGet = defineAtom("varGet", Ue.object({ key: Ue.string }), Ue.any, async ({ key }, ctx) => {
  return resolveName(key, ctx);
}, { docs: "Get Variable", cost: 0.1 });
var varsImport = defineAtom("varsImport", Ue.object({
  keys: Ue.union([Ue.array(Ue.string), Ue.record(Ue.string)])
}), undefined, async ({ keys }, ctx) => {
  if (Array.isArray(keys)) {
    for (const key of keys) {
      const v = resolveValue({ $kind: "arg", path: key }, ctx);
      if (!setStateVar(ctx, key, v, "varsImport"))
        return;
    }
  } else {
    for (const [alias, path] of Object.entries(keys)) {
      const v = resolveValue({ $kind: "arg", path }, ctx);
      if (!setStateVar(ctx, alias, v, "varsImport"))
        return;
    }
  }
}, {
  docs: "Import variables from args into the current scope, with optional renaming.",
  cost: 0.2
});
var varsLet = defineAtom("varsLet", Ue.record(Ue.any), undefined, async (step, ctx) => {
  for (const key of Object.keys(step)) {
    if (key === "op" || key === "result")
      continue;
    const v = resolveValue(step[key], ctx);
    if (!setStateVar(ctx, key, v, "varsLet"))
      return;
  }
}, {
  docs: "Initialize a set of variables in the current scope from the step object properties.",
  cost: 0.1
});
var varsExport = defineAtom("varsExport", Ue.object({
  keys: Ue.union([Ue.array(Ue.string), Ue.record(Ue.string)])
}), Ue.record(Ue.any), async ({ keys }, ctx) => {
  const result = {};
  if (Array.isArray(keys)) {
    for (const key of keys) {
      setGuestKey(result, key, resolveName(key, ctx));
    }
  } else {
    for (const [alias, path] of Object.entries(keys)) {
      setGuestKey(result, alias, resolveName(String(path), ctx));
    }
  }
  return result;
}, {
  docs: "Export variables from the current scope, with optional renaming.",
  cost: 0.2
});
var scope = defineAtom("scope", Ue.object({ steps: Ue.array(Ue.any) }), undefined, async ({ steps }, ctx) => {
  const scopedCtx = createChildScope(ctx);
  try {
    await seq.exec({ op: "seq", steps }, scopedCtx);
    if (scopedCtx.output !== undefined)
      ctx.output = scopedCtx.output;
  } finally {
    releaseScope(scopedCtx);
  }
}, { docs: "Create new scope", timeoutMs: 0, cost: 0.1 });
var MAX_CALL_DEPTH = 256;
var callLocal = defineAtom("callLocal", Ue.object({
  name: Ue.string,
  args: Ue.array(Ue.any)
}), undefined, async ({ name, args }, ctx) => {
  const helper = ctx.helpers?.[name];
  if (!helper) {
    ctx.error = new AgentError(`Unknown helper: ${name}`, "callLocal");
    return ctx.error;
  }
  const depth = (ctx.callDepth ?? 0) + 1;
  if (depth > MAX_CALL_DEPTH) {
    ctx.error = new AgentError(`Maximum helper call depth (${MAX_CALL_DEPTH}) exceeded — likely infinite recursion in '${name}'`, "callLocal");
    return ctx.error;
  }
  const resolvedArgs = args.map((arg) => resolveValue(arg, ctx)).slice(0, helper.paramNames.length);
  const scopedCtx = {
    ...ctx,
    state: newScopeState(ctx),
    args: Object.create(null),
    consts: new Set,
    output: undefined,
    error: undefined,
    localCall: true,
    callDepth: depth,
    heapPerKey: new Map
  };
  try {
    for (let i = 0;i < helper.paramNames.length; i++) {
      const arg = resolvedArgs[i];
      if (arg && typeof arg === "object" && ctx.heapPerKey) {
        for (const entry of ctx.heapPerKey.values()) {
          if (entry.ref !== arg)
            continue;
          scopedCtx.heapPerKey.set(helper.paramNames[i], entry);
          break;
        }
      }
      if (!setStateVar(scopedCtx, helper.paramNames[i], resolvedArgs[i], "callLocal"))
        return;
    }
    await seq.exec({ op: "seq", steps: helper.steps }, scopedCtx);
    return scopedCtx.output;
  } finally {
    if (scopedCtx.error)
      ctx.error = scopedCtx.error;
    releaseScope(scopedCtx);
  }
}, { docs: "Invoke a local helper function by name", timeoutMs: 0, cost: 0.1 });
function callbackScope(ctx, opts = {}) {
  const child = createChildScope(ctx);
  if (opts.loop)
    return child;
  child.localCall = true;
  child.output = undefined;
  return child;
}
function callbackResult(ctx) {
  return ctx.output !== undefined ? ctx.output : ctx.state["result"];
}
var map = defineAtom("map", Ue.object({
  items: Ue.array(Ue.any),
  as: Ue.string,
  steps: Ue.array(Ue.any),
  loop: Ue.boolean.optional
}), Ue.array(Ue.any), async ({ items, as, steps, loop }, ctx) => {
  const results = [];
  const resolvedItems = resolveValue(items, ctx);
  if (!Array.isArray(resolvedItems))
    throw new Error("map: items is not an array");
  const release = holdRoot(ctx, results, resolvedItems);
  try {
    for (const item of resolvedItems) {
      if (ctx.signal?.aborted)
        throw new Error("Execution aborted");
      const scopedCtx = callbackScope(ctx, { loop });
      try {
        if (!setStateVar(scopedCtx, as, item, "map", { alias: true }))
          return;
        await seq.exec({ op: "seq", steps }, scopedCtx);
        if (loop) {
          if (scopedCtx.output !== undefined) {
            ctx.output = scopedCtx.output;
            return results;
          }
          continue;
        }
        results.push(callbackResult(scopedCtx) ?? null);
        chargeResultSlot(ctx, "map");
      } finally {
        releaseScope(scopedCtx);
      }
    }
  } finally {
    release();
  }
  return results;
}, { docs: "Map Array", timeoutMs: 0, cost: 1 });
var filter = defineAtom("filter", Ue.object({
  items: Ue.array(Ue.any),
  as: Ue.string,
  condition: Ue.any
}), Ue.array(Ue.any), async ({ items, as, condition }, ctx) => {
  const results = [];
  const resolvedItems = resolveValue(items, ctx);
  if (!Array.isArray(resolvedItems))
    throw new Error("filter: items is not an array");
  const release = holdRoot(ctx, results, resolvedItems);
  try {
    for (const item of resolvedItems) {
      if (ctx.signal?.aborted)
        throw new Error("Execution aborted");
      const scopedCtx = createChildScope(ctx);
      try {
        if (!setStateVar(scopedCtx, as, item, "filter", { alias: true }))
          return;
        const passes = evaluateExpr(condition, scopedCtx);
        if (passes) {
          results.push(item);
          chargeResultSlot(ctx, "filter");
        }
      } finally {
        releaseScope(scopedCtx);
      }
    }
  } finally {
    release();
  }
  return results;
}, { docs: "Filter Array", timeoutMs: 0, cost: 1 });
var reduce = defineAtom("reduce", Ue.object({
  items: Ue.array(Ue.any),
  as: Ue.string,
  accumulator: Ue.string,
  initial: Ue.any,
  steps: Ue.array(Ue.any)
}), Ue.any, async ({ items, as, accumulator, initial, steps }, ctx) => {
  const resolvedItems = resolveValue(items, ctx);
  const resolvedInitial = resolveValue(initial, ctx);
  if (!Array.isArray(resolvedItems))
    throw new Error("reduce: items is not an array");
  let acc = resolvedInitial;
  let accEntry;
  const held = { acc };
  const release = holdRoot(ctx, held, resolvedItems);
  try {
    for (const item of resolvedItems) {
      if (ctx.signal?.aborted)
        throw new Error("Execution aborted");
      const scopedCtx = callbackScope(ctx);
      try {
        if (accEntry && accEntry.ref === acc && scopedCtx.heapPerKey) {
          scopedCtx.heapPerKey.set(accumulator, accEntry);
        }
        if (!setStateVar(scopedCtx, as, item, "reduce", { alias: true }))
          return;
        if (!setStateVar(scopedCtx, accumulator, acc, "reduce"))
          return;
        await seq.exec({ op: "seq", steps }, scopedCtx);
        acc = callbackResult(scopedCtx) ?? acc;
        held.acc = acc;
        accEntry = scopedCtx.heapPerKey?.get(accumulator);
      } finally {
        releaseScope(scopedCtx);
      }
    }
  } finally {
    release();
  }
  return acc;
}, { docs: "Reduce Array", timeoutMs: 0, cost: 1 });
var find = defineAtom("find", Ue.object({
  items: Ue.array(Ue.any),
  as: Ue.string,
  condition: Ue.any
}), Ue.any, async ({ items, as, condition }, ctx) => {
  const resolvedItems = resolveValue(items, ctx);
  if (!Array.isArray(resolvedItems))
    throw new Error("find: items is not an array");
  const release = holdRoot(ctx, resolvedItems);
  try {
    for (const item of resolvedItems) {
      if (ctx.signal?.aborted)
        throw new Error("Execution aborted");
      const scopedCtx = createChildScope(ctx);
      try {
        if (!setStateVar(scopedCtx, as, item, "find", { alias: true }))
          return;
        const matches = evaluateExpr(condition, scopedCtx);
        if (matches) {
          return item;
        }
      } finally {
        releaseScope(scopedCtx);
      }
    }
  } finally {
    release();
  }
  return null;
}, { docs: "Find in Array", timeoutMs: 0, cost: 1 });
var push = defineAtom("push", Ue.object({ list: Ue.array(Ue.any), item: Ue.any }), Ue.array(Ue.any), async ({ list, item }, ctx) => {
  const resolvedList = resolveValue(list, ctx);
  const resolvedItem = resolveValue(item, ctx);
  if (isGuestSet(resolvedList))
    throw new AgentError("push cannot write into a Set (use add)", "push");
  if (Array.isArray(resolvedList)) {
    if (!chargeInsertion(ctx, [resolvedItem], "push"))
      return;
    resolvedList.push(resolvedItem);
    restampReceiver(ctx, list);
  }
  return resolvedList;
}, { docs: "Push to Array", cost: 1 });
var len = defineAtom("len", Ue.object({ list: Ue.any }), Ue.number, async ({ list }, ctx) => {
  const val = resolveValue(list, ctx);
  return Array.isArray(val) || typeof val === "string" ? val.length : 0;
}, { docs: "Length", cost: 1 });
var split2 = defineAtom("split", Ue.object({ str: Ue.string, sep: Ue.string }), Ue.array(Ue.string), async ({ str, sep }, ctx) => {
  return guestCall(ctx, resolveValue(str, ctx), "split", [resolveValue(sep, ctx)], "split");
}, { docs: "Split String", cost: 1 });
var join = defineAtom("join", Ue.object({ list: Ue.array(Ue.string), sep: Ue.string }), Ue.string, async ({ list, sep }, ctx) => {
  return guestCall(ctx, resolveValue(list, ctx), "join", [resolveValue(sep, ctx)], "join");
}, { docs: "Join String", cost: 1 });
var template = defineAtom("template", Ue.object({ tmpl: Ue.string, vars: Ue.record(Ue.any) }), Ue.string, async ({ tmpl, vars }, ctx) => {
  const resolvedTmpl = resolveValue(tmpl, ctx);
  if (typeof resolvedTmpl !== "string")
    throw new AgentError("template's tmpl must be a string", "template");
  const values = new Map;
  let bound = resolvedTmpl.length * 2 + 64;
  for (const [, key] of resolvedTmpl.matchAll(/\{\{(\w+)\}\}/g)) {
    if (!values.has(key))
      values.set(key, resolveValue(ownValue(vars, key), ctx) ?? "");
    bound += stringFormBound(ctx, values.get(key));
  }
  allocate(ctx, bound, "template");
  return resolvedTmpl.replace(/\{\{(\w+)\}\}/g, (_, key) => String(values.get(key) ?? ""));
}, { docs: "String Template", cost: 1 });
var regexMatch = defineAtom("regexMatch", Ue.object({
  pattern: Ue.string,
  value: Ue.any
}), Ue.boolean, async ({ pattern, value }, ctx) => {
  const source = resolveValue(pattern, ctx);
  const resolvedValue = resolveValue(value, ctx);
  if (typeof source !== "string" && !isGuestRegex(source))
    throw new AgentError("regexMatch's pattern must be a string or a regex", "regexMatch");
  primitiveOperand(resolvedValue, "regexMatch's value", "regexMatch");
  return vmStringMethod(ctx, String(resolvedValue), "search", [source]) !== -1;
}, {
  docs: "Returns true if the value matches the regex pattern.",
  cost: 2
});
var pick = defineAtom("pick", Ue.object({ obj: Ue.record(Ue.any), keys: Ue.array(Ue.string) }), Ue.record(Ue.any), async ({ obj, keys }, ctx) => {
  const resolvedObj = resolveValue(obj, ctx);
  const resolvedKeys = resolveValue(keys, ctx);
  allocate(ctx, 4 * shallowBytes(resolvedKeys) + 64, "pick");
  const res = {};
  if (resolvedObj && Array.isArray(resolvedKeys)) {
    for (const k of resolvedKeys) {
      if (k === "size" && isGuestSet(resolvedObj)) {
        setGuestKey(res, k, guestMember(resolvedObj, k));
        continue;
      }
      const d = Object.getOwnPropertyDescriptor(resolvedObj ?? {}, k);
      if (d && "value" in d && typeof d.value !== "function")
        setGuestKey(res, k, d.value);
    }
  }
  return res;
}, { docs: "Pick Keys", cost: 1 });
var omit = defineAtom("omit", Ue.object({ obj: Ue.record(Ue.any), keys: Ue.array(Ue.string) }), Ue.record(Ue.any), async ({ obj, keys }, ctx) => {
  const resolvedObj = resolveValue(obj, ctx);
  const resolvedKeys = new Set(resolveValue(keys, ctx));
  allocate(ctx, 2 * shallowBytes(resolvedObj) + 64, "omit");
  const res = {};
  if (resolvedObj) {
    Object.keys(resolvedObj).forEach((k) => {
      if (!resolvedKeys.has(k))
        setGuestKey(res, k, resolvedObj[k]);
    });
  }
  return res;
}, { docs: "Omit Keys", cost: 1 });
var merge = defineAtom("merge", Ue.object({ a: Ue.record(Ue.any), b: Ue.record(Ue.any) }), Ue.record(Ue.any), async ({ a, b }, ctx) => {
  const ra = resolveValue(a, ctx);
  const rb = resolveValue(b, ctx);
  for (const [x, n] of [
    [ra, 1],
    [rb, 2]
  ])
    if (x !== undefined && x !== null && !argOk("objOrArr", x))
      throw new AgentError(`merge's operand ${n} must be an object or an array`, "merge");
  allocate(ctx, 2 * (shallowBytes(ra ?? {}) + shallowBytes(rb ?? {})) + 64, "merge");
  return { ...ra, ...rb };
}, { docs: "Merge Objects", cost: 1 });
var keys = defineAtom("keys", Ue.object({ obj: Ue.record(Ue.any) }), Ue.array(Ue.string), async ({ obj }, ctx) => {
  const input = resolveValue(obj, ctx) ?? {};
  return guestCall(ctx, builtins.Object, "keys", [input], "keys");
}, { docs: "Object Keys", cost: 1 });
var MAX_AGENT_DEPTH = 10;
var AGENT_DEPTH_HEADER = "X-Agent-Depth";
function depthHeaderFor(url, depth, env = fetchEnvironment()) {
  if (!env.server && env.origin) {
    if (env.origin === "null")
      return {};
    try {
      if (new URL(url, env.origin).origin !== env.origin)
        return {};
    } catch {
      return {};
    }
  }
  return { [AGENT_DEPTH_HEADER]: String(depth) };
}
function fetchEnvironment() {
  const g = globalThis;
  const server = !!(g.process?.versions?.node || g.Bun || g.Deno);
  return { server, origin: g.location?.origin };
}
function isDomainAllowed(urlString, allowedDomains) {
  try {
    const url = new URL(urlString);
    const host = url.hostname.toLowerCase();
    const port = url.port;
    for (const entry of allowedDomains) {
      const e = entry.toLowerCase();
      const colon = e.lastIndexOf(":");
      const hasPort = colon > 0 && /^\d+$/.test(e.slice(colon + 1)) && !e.endsWith("]");
      const p = hasPort ? e.slice(0, colon) : e;
      const named = hasPort ? e.slice(colon + 1) : "";
      const defaultPort = url.protocol === "https:" ? "443" : "80";
      if ((named === defaultPort ? "" : named) !== port)
        continue;
      if (p.startsWith("*.")) {
        const suffix = p.slice(1);
        if (host.endsWith(suffix) || host === p.slice(2)) {
          return true;
        }
      } else if (host === p) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
var ALLOWED_REQUEST_HEADERS = new Set([
  "accept",
  "accept-language",
  "authorization",
  "cache-control",
  "content-language",
  "content-type",
  "if-match",
  "if-modified-since",
  "if-none-match",
  "if-unmodified-since",
  "range",
  "user-agent",
  "x-api-key",
  "x-request-id",
  "x-correlation-id",
  "x-requested-with"
]);
function admitHeaders(headers, hostAllowed) {
  const extra = new Set(Array.isArray(hostAllowed) ? hostAllowed.filter((h) => typeof h === "string").map((h) => h.toLowerCase()) : []);
  for (const name of Object.keys(headers)) {
    const n = name.toLowerCase();
    if (n === AGENT_DEPTH_HEADER.toLowerCase() || !(ALLOWED_REQUEST_HEADERS.has(n) || extra.has(n)))
      throw new Error(`httpFetch: the '${name}' header cannot be set by an agent (allowed: ${[
        ...ALLOWED_REQUEST_HEADERS,
        ...extra
      ].join(", ")}; the host can allow more: vm.run context.allowedRequestHeaders, or Eval/SafeFunction fetchPolicy.headers)`);
  }
}
var REDIRECT_STATUSES = new Set([
  301,
  302,
  303,
  307,
  308
]);
var ALLOWED_FETCH_METHODS = new Set(["GET", "HEAD"]);
function admitsMethod(verb, hostAllowed) {
  if (ALLOWED_FETCH_METHODS.has(verb))
    return true;
  if (verb === "CONNECT" || verb === "TRACE" || verb === "TRACK")
    return false;
  return Array.isArray(hostAllowed) && hostAllowed.some((m) => typeof m === "string" && m.toUpperCase() === verb);
}
function isHostlessRelative(url) {
  if (/[\\\t\n\r]/.test(url) || url.length > 0 && url.charCodeAt(0) <= 32)
    return false;
  for (const base of ["http://sentinel.invalid/", "file:///"]) {
    let resolved;
    try {
      resolved = new URL(url, base);
    } catch {
      return false;
    }
    if (resolved.host !== new URL(base).host)
      return false;
  }
  return true;
}
function policyList(value, name) {
  if (value === undefined || value === null)
    return;
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string"))
    throw new Error(`${name} must be an array of strings`);
  return value;
}
function admitFetchUrl(url, allowedDomains, destinationRequired = true, allowPrivateNetwork = false) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    if (destinationRequired)
      throw new Error(`Invalid URL: ${url}`, { cause: e });
    if (!isHostlessRelative(url))
      throw new Error(`Fetch blocked: '${url}' is not a plain relative path (it names a host, or contains characters a URL parser rewrites); write an absolute http(s) URL`, { cause: e });
    if (allowedDomains)
      throw new Error(`Fetch blocked: '${url}' is not an absolute URL, and an allowlist needs one to check`, { cause: e });
    return url;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new Error(`Blocked URL: only http: or https: URLs may be fetched (got ${parsed.protocol})`);
  if (allowedDomains) {
    if (!isDomainAllowed(parsed.href, allowedDomains))
      throw new Error(`Fetch blocked: domain not in allowlist. Allowed: ${allowedDomains.join(", ")}`);
    if (!allowPrivateNetwork && isBlockedUrl(parsed.href))
      throw new Error(`Fetch blocked: '${parsed.host}' is a loopback or private address. An allowlist entry ` + `alone does not open the private network; the host can allow it with ` + `allowPrivateNetwork: true in the run context (fetchPolicy.privateNetwork for Eval).`);
    return parsed.href;
  }
  if (!destinationRequired)
    return parsed.href;
  if (isBlockedUrl(parsed.href))
    throw new Error(`Blocked URL: private/internal addresses not allowed in default fetch`);
  throw new Error(`Fetch blocked: no allowedFetchDomains configured. ` + `The host lists them in the run options, vm.run(ast, args, { context: { allowedFetchDomains: ['api.example.com'] } }), ` + `or passes a fetch capability.`);
}
async function readBounded(res, cap) {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > cap) {
    await res.body?.cancel();
    throw new Error(`httpFetch: response too large (${declared} bytes exceeds the ${cap}-byte limit)`);
  }
  if (!res.body)
    return new Uint8Array(0);
  const reader = res.body.getReader();
  const parts = [];
  let total = 0;
  for (;; ) {
    const { done, value } = await reader.read();
    if (done)
      break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      throw new Error(`httpFetch: response too large (more than the ${cap}-byte limit)`);
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}
var fetch2 = defineAtom("httpFetch", Ue.object({
  url: Ue.string,
  method: Ue.string.optional,
  headers: Ue.record(Ue.string).optional,
  body: Ue.any.optional,
  responseType: Ue.string.optional
}), Ue.any, async (step, ctx) => {
  const url = resolveValue(step.url, ctx);
  const method = resolveValue(step.method, ctx);
  const headers = resolveValue(step.headers, ctx) || {};
  const body = resolveValue(step.body, ctx);
  const responseType = resolveValue(step.responseType, ctx);
  if (typeof url !== "string")
    throw new Error("httpFetch's url must be a string");
  for (const [name, v] of [
    ["method", method],
    ["responseType", responseType]
  ])
    if (v !== undefined && typeof v !== "string")
      throw new Error(`httpFetch's ${name} must be a string`);
  if (!isPlainObject(headers) || !Object.values(Object.getOwnPropertyDescriptors(headers)).every((d) => typeof d.value === "string"))
    throw new Error("httpFetch's headers must be an object of strings");
  const allowedDomains = policyList(ctx.context?.allowedFetchDomains, "allowedFetchDomains");
  const allowedMethods = policyList(ctx.context?.allowedFetchMethods, "allowedFetchMethods");
  const allowedHeaders = policyList(ctx.context?.allowedRequestHeaders, "allowedRequestHeaders");
  const target = admitFetchUrl(url, allowedDomains, !ctx.capabilities.fetch, ctx.context?.allowPrivateNetwork === true);
  admitHeaders(headers, allowedHeaders);
  const verb = method === undefined ? undefined : String(method).toUpperCase();
  if (verb !== undefined && !admitsMethod(verb, allowedMethods))
    throw new Error(`httpFetch: method '${method}' is not allowed (use ${[
      ...ALLOWED_FETCH_METHODS
    ].join(", ")}; the host can allow more: vm.run context.allowedFetchMethods, or Eval/SafeFunction fetchPolicy.methods)`);
  const currentDepth = ctx.context?.requestDepth ?? 0;
  if (currentDepth >= MAX_AGENT_DEPTH) {
    throw new Error(`Agent request depth exceeded (max ${MAX_AGENT_DEPTH}). This prevents recursive agent loops.`);
  }
  if (ctx.capabilities.fetch) {
    return ctx.capabilities.fetch(target, {
      method: verb,
      headers: {
        ...headers,
        [AGENT_DEPTH_HEADER]: String(currentDepth + 1)
      },
      body,
      signal: ctx.signal,
      responseType
    });
  }
  if (typeof globalThis.fetch === "function") {
    const res = await globalThis.fetch(target, {
      method: verb,
      headers: {
        ...headers,
        ...depthHeaderFor(target, currentDepth + 1)
      },
      body: body ? jsonOf(ctx, body, "httpFetch") : undefined,
      redirect: "manual",
      credentials: "omit",
      signal: ctx.signal
    });
    const location = res.headers.get("location");
    if (res.type === "opaqueredirect" || REDIRECT_STATUSES.has(res.status) && location !== null) {
      await res.body?.cancel().catch(() => {
        return;
      });
      let absolute = location;
      if (location !== null)
        try {
          absolute = new URL(location, target).href;
        } catch {
          absolute = location;
        }
      return { redirect: true, status: res.status, location: absolute };
    }
    const cap = ctx.membraneMaxBytes ?? MEMBRANE_MAX_BYTES;
    const bytes = await readBounded(res, cap);
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    if (responseType === "dataUrl") {
      let binary = "";
      for (let i = 0;i < bytes.length; i += 32768)
        binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
      return `data:${contentType};base64,${btoa(binary)}`;
    }
    const text = new TextDecoder().decode(bytes);
    if (responseType === "text")
      return text;
    if (responseType === "json" || contentType.includes("application/json"))
      return JSON.parse(text);
    return text;
  }
  throw new Error("Capability 'fetch' missing and no global fetch available");
}, { docs: "HTTP Fetch", timeoutMs: 30000, cost: 5 });
function storeOf(ctx) {
  return ctx.capabilities.store ?? ctx.defaultStore;
}
var storeGet = defineAtom("storeGet", Ue.object({ key: Ue.string }), Ue.any, async ({ key }, ctx) => {
  const k = resolveValue(key, ctx);
  return storeOf(ctx)?.get(k);
}, { docs: "Store Get", cost: 5 });
var storeSet = defineAtom("storeSet", Ue.object({ key: Ue.string, value: Ue.any }), undefined, async ({ key, value }, ctx) => {
  const k = resolveValue(key, ctx);
  const v = resolveValue(value, ctx);
  return storeOf(ctx)?.set(k, v);
}, { docs: "Store Set", cost: 5 });
var storeQuery = defineAtom("storeQuery", Ue.object({ query: Ue.any }), Ue.array(Ue.any), async ({ query }, ctx) => storeOf(ctx)?.query?.(resolveValue(query, ctx)) ?? [], { docs: "Store Query", cost: 5 });
var storeQueryWhere = defineAtom("storeQueryWhere", Ue.object({
  predicate: Ue.any,
  collection: Ue.string.optional,
  limit: Ue.number.optional
}), Ue.array(Ue.any), async ({ predicate, collection, limit }, ctx) => {
  const pred = resolveValue(predicate, ctx);
  if (!pred || typeof pred !== "object" || typeof pred.canonical !== "string") {
    throw new Error("storeQueryWhere: `predicate` must be a canonical verified predicate " + "({ key, canonical, ast, entry }) — build one with canonicalizePredicate() " + "from tjs-lang/lang.");
  }
  const store = storeOf(ctx);
  if (!store?.queryPredicate) {
    throw new Error("Capability 'store.queryPredicate' missing — this store can't evaluate " + "predicates. Use storeQuery + filter, or provide queryPredicate.");
  }
  return await store.queryPredicate({
    collection: resolveValue(collection, ctx),
    predicate: pred,
    limit: resolveValue(limit, ctx)
  }) ?? [];
}, { docs: "Store Query (predicate pushdown)", cost: 5 });
var vectorSearch = defineAtom("storeVectorSearch", Ue.object({
  collection: Ue.string.optional,
  vector: Ue.array(Ue.number),
  k: Ue.number.optional
}), Ue.array(Ue.any), async ({ collection, vector, k }, ctx) => storeOf(ctx)?.vectorSearch?.(resolveValue(collection, ctx), resolveValue(vector, ctx), resolveValue(k, ctx)) ?? [], {
  docs: "Vector Search",
  cost: (input, ctx) => 5 + (resolveValue(input.k, ctx) ?? 5)
});
var llmPredict = defineAtom("llmPredict", Ue.object({ prompt: Ue.string, options: Ue.any.optional }), Ue.string, async ({ prompt, options }, ctx) => {
  if (!ctx.capabilities.llm?.predict)
    throw new Error("Capability 'llm.predict' missing");
  const resolved = resolveValue(options, ctx);
  if (resolved !== undefined && resolved !== null) {
    if (typeof resolved !== "object" || Array.isArray(resolved))
      throw new AgentError("llmPredict options must be an object", "llmPredict");
    for (const k of Object.keys(resolved))
      if (!LLM_OPTION_KEYS.has(k))
        throw new AgentError(`llmPredict option '${k}' is not available in AsyncJS (allowed: ${[
          ...LLM_OPTION_KEYS
        ].join(", ")})`, "llmPredict");
    admitResponseFormat(resolved.responseFormat, "llmPredict");
    admitTools(resolved.tools, "llmPredict");
  }
  return ctx.capabilities.llm.predict(resolveValue(prompt, ctx), resolved);
}, { docs: "LLM Predict", timeoutMs: 120000, cost: 100 });
var agentRun = defineAtom("agentRun", Ue.object({ agentId: Ue.any, input: Ue.any }), Ue.any, async ({ agentId, input }, ctx) => {
  const resolvedId = (ctx.astVersion ?? AST_VERSION_LEGACY) < 2 && agentId && typeof agentId === "object" && "op" in agentId && !("$expr" in agentId) ? agentId : resolveValue(agentId, ctx);
  const rawInput = resolveValue(input, ctx);
  let resolvedInput = rawInput;
  if (rawInput && typeof rawInput === "object" && !Array.isArray(rawInput)) {
    resolvedInput = Object.create(null);
    for (const k of Object.keys(rawInput))
      setGuestKey(resolvedInput, k, rawInput[k]);
  }
  if (isProcedureToken(resolvedId)) {
    const ast = resolveProcedureToken(resolvedId);
    const childCtx = {
      ...ctx,
      args: resolvedInput,
      state: newScopeState(ctx),
      consts: new Set,
      memo: new Map,
      output: undefined,
      error: undefined,
      localCall: false,
      heapPerKey: new Map
    };
    try {
      const seqAtom = ctx.resolver("seq");
      if (!seqAtom)
        throw new Error("seq atom not found");
      checkAstVersion(ast, "agentRun");
      childCtx.astVersion = astVersionOf(ast) ?? AST_VERSION_LEGACY;
      childCtx.helpers = ast.helpers;
      ownRoots(childCtx, childCtx.memo, childCtx.args);
      holdToContract(ctx, ast.inputSchema, resolvedInput, "input");
      await seqAtom.exec(ast, childCtx);
      if (childCtx.error) {
        throw new Error(reduceThrown(childCtx.error) || "Sub-agent failed");
      }
      holdToContract(ctx, ast.outputSchema, childCtx.output, "result");
      return childCtx.output;
    } finally {
      releaseScope(childCtx);
    }
  }
  if (resolvedId && typeof resolvedId === "object" && "op" in resolvedId) {
    const childCtx = {
      ...ctx,
      args: resolvedInput,
      state: newScopeState(ctx),
      consts: new Set,
      memo: new Map,
      output: undefined,
      error: undefined,
      localCall: false,
      heapPerKey: new Map
    };
    try {
      const seqAtom = ctx.resolver("seq");
      if (!seqAtom)
        throw new Error("seq atom not found");
      checkAstVersion(resolvedId, "agentRun");
      childCtx.astVersion = astVersionOf(resolvedId) ?? AST_VERSION_LEGACY;
      childCtx.helpers = resolvedId.helpers;
      ownRoots(childCtx, childCtx.memo, childCtx.args);
      holdToContract(ctx, resolvedId.inputSchema, resolvedInput, "input");
      await seqAtom.exec(resolvedId, childCtx);
      if (childCtx.error) {
        throw new Error(reduceThrown(childCtx.error) || "Sub-agent failed");
      }
      holdToContract(ctx, resolvedId.outputSchema, childCtx.output, "result");
      return childCtx.output;
    } finally {
      releaseScope(childCtx);
    }
  }
  if (!ctx.capabilities.agent?.run)
    throw new Error("Capability 'agent.run' missing");
  const sent = egressValue(ctx, "agentRun", {
    agentId: resolvedId,
    input: resolvedInput
  });
  const result = await ctx.capabilities.agent.run(sent.agentId, sent.input);
  if (result && typeof result === "object" && "fuelUsed" in result && typeof result.fuelUsed === "number") {
    if (result.error) {
      throw new Error(reduceThrown(result.error) || "Sub-agent failed");
    }
    return result.result;
  }
  return result;
}, { docs: "Run Sub-Agent (accepts procedure token, AST, or agent ID)", cost: 1 });
function admitSource(ctx, code, op) {
  if (typeof code !== "string")
    throw new Error(`${op}: code must be a string`);
  const max = guestSourceCap(ctx.maxSourceBytes);
  if (sourceBytesOver(code, max) !== null)
    throw new Error(`${op}: source is over the ${max}-byte limit. Transpilation runs ` + `before fuel can stop it, so oversized source is refused rather than metered.`);
  if (!chargeForSize(ctx, code, op))
    throw new Error("Out of Fuel");
  return code;
}
var transpileCode = defineAtom("transpileCode", Ue.object({
  code: Ue.string
}), Ue.any, async ({ code }, ctx) => {
  if (!ctx.capabilities.code?.transpile) {
    throw new Error("Capability 'code.transpile' missing. Enable code transpilation by providing the code capability.");
  }
  const resolvedCode = admitSource(ctx, resolveValue(code, ctx), "transpileCode");
  try {
    return ctx.capabilities.code.transpile(resolvedCode);
  } catch (e) {
    throw new Error(`Code transpilation failed: ${reduceThrown(e)}`, {
      cause: e
    });
  }
}, { docs: "Transpile AsyncJS code to AST", cost: 1 });
var MAX_RUNCODE_DEPTH = 10;
var runCode = defineAtom("runCode", Ue.object({
  code: Ue.string,
  args: Ue.record(Ue.any).optional
}), Ue.any, async ({ code, args }, ctx) => {
  const currentDepth = ctx.runCodeDepth ?? 0;
  if (currentDepth >= MAX_RUNCODE_DEPTH) {
    throw new Error(`runCode recursion limit exceeded (max ${MAX_RUNCODE_DEPTH}). ` + "This prevents infinite loops from dynamically generated code calling runCode.");
  }
  if (!ctx.capabilities.code?.transpile) {
    throw new Error("Capability 'code.transpile' missing. Enable dynamic code execution by providing the code capability.");
  }
  const resolvedCode = admitSource(ctx, resolveValue(code, ctx), "runCode");
  const resolvedArgs = args ? resolveValue(args, ctx) : {};
  let ast;
  try {
    ast = ctx.capabilities.code.transpile(resolvedCode);
  } catch (e) {
    throw new Error(`Code transpilation failed: ${reduceThrown(e)}`, {
      cause: e
    });
  }
  checkAstVersion(ast, "runCode");
  if (ast.op !== "seq") {
    throw new Error("Transpiled code must be a seq node");
  }
  const childCtx = createChildScope(ctx);
  ctx.heapRoots.delete(childCtx.state);
  childCtx.state = newScopeState(ctx);
  childCtx.heapPerKey = new Map;
  ledgerFor(childCtx.state, childCtx.heapPerKey);
  childCtx.consts = new Set;
  childCtx.helpers = ast.helpers;
  childCtx.memo = new Map;
  childCtx.astVersion = astVersionOf(ast) ?? AST_VERSION_LEGACY;
  try {
    childCtx.args = resolvedArgs && typeof resolvedArgs === "object" && !Array.isArray(resolvedArgs) ? Object.assign(Object.create(null), resolvedArgs) : resolvedArgs;
    ownRoots(childCtx, childCtx.memo, childCtx.args);
    childCtx.output = undefined;
    childCtx.localCall = false;
    childCtx.runCodeDepth = currentDepth + 1;
    await seq.exec(ast, childCtx);
    if (childCtx.error) {
      ctx.error = childCtx.error;
      return;
    }
    return childCtx.output;
  } finally {
    releaseScope(childCtx);
  }
}, { docs: "Run dynamically generated AsyncJS code", cost: 1 });
var jsonParse = defineAtom("jsonParse", Ue.object({ str: Ue.string }), Ue.any, async ({ str }, ctx) => {
  return guestCall(ctx, builtins.JSON, "parse", [resolveValue(str, ctx)], "jsonParse");
}, { docs: "Parse JSON", cost: 1 });
var jsonStringify = defineAtom("jsonStringify", Ue.object({ value: Ue.any }), Ue.string, async ({ value }, ctx) => {
  return guestCall(ctx, builtins.JSON, "stringify", [resolveValue(value, ctx)], "jsonStringify");
}, { docs: "Stringify JSON", cost: 1 });
var xmlParse = defineAtom("xmlParse", Ue.object({ str: Ue.string }), Ue.any, async ({ str }, ctx) => {
  if (!ctx.capabilities.xml?.parse)
    throw new Error("Capability 'xml.parse' missing");
  return ctx.capabilities.xml.parse(resolveValue(str, ctx));
}, { docs: "Parse XML", cost: 1 });
function blockKey(key, ctx, op) {
  const k = resolveValue(key, ctx);
  if (typeof k !== "string")
    throw new AgentError(`'${op}': a key is required, a string naming what the result depends on`, op);
  return k;
}
var memoize = defineAtom("memoize", Ue.object({ key: Ue.string, steps: Ue.array(Ue.any) }), Ue.any, async ({ key, steps }, ctx) => {
  if (!ctx.memo)
    ctx.memo = new Map;
  const k = blockKey(key, ctx, "memoize");
  if (ctx.memo.has(k)) {
    return ctx.memo.get(k);
  }
  const scopedCtx = callbackScope(ctx);
  let result;
  try {
    await seq.exec({ op: "seq", steps }, scopedCtx);
    result = callbackResult(scopedCtx);
  } finally {
    releaseScope(scopedCtx);
  }
  if (ctx.error)
    return;
  if (!chargeInsertion(ctx, [result], "memoize"))
    return;
  ctx.memo.set(k, result);
  return result;
}, { docs: "Memoize steps result in memory", cost: 1 });
var cache = defineAtom("cache", Ue.object({
  key: Ue.string,
  steps: Ue.array(Ue.any),
  ttlMs: Ue.number.optional
}), Ue.any, async ({ key, steps, ttlMs }, ctx) => {
  const store = storeOf(ctx);
  if (!store)
    throw new Error("Capability 'store' missing for caching");
  const k = egressValue(ctx, "cache", blockKey(key, ctx, "cache"));
  const cacheKey = `cache:${k}`;
  const cached = await store.get(cacheKey);
  if (cached) {
    if (typeof cached === "object" && cached._exp) {
      if (cacheNow(ctx) < cached._exp)
        return cached.val;
    } else {
      return cached;
    }
  }
  const scopedCtx = callbackScope(ctx);
  let result;
  try {
    await seq.exec({ op: "seq", steps }, scopedCtx);
    result = callbackResult(scopedCtx);
  } finally {
    releaseScope(scopedCtx);
  }
  if (ctx.error)
    return;
  const expiry = cacheNow(ctx) + (ttlMs ?? 24 * 3600 * 1000);
  if ((ctx.fuel.current -= 5) <= 0)
    throw new Error("Out of Fuel");
  await store.set(cacheKey, egressValue(ctx, "cache", { val: result, _exp: expiry }));
  return result;
}, { docs: "Cache steps result in store with TTL", cost: 5 });
var cacheNow = (ctx) => ctx.capabilities && Object.prototype.hasOwnProperty.call(ctx.capabilities, "clock") && ctx.capabilities.clock ? guestNow(ctx, "cache") : Date.now();
var random = defineAtom("random", Ue.object({
  min: Ue.number.optional,
  max: Ue.number.optional,
  format: Ue.string.optional,
  length: Ue.number.optional
}), Ue.any, async ({ min, max, format, length }, ctx) => {
  const f = resolveValue(format, ctx) ?? "float";
  const len = resolveValue(length, ctx) ?? 10;
  const mn = resolveValue(min, ctx) ?? 0;
  const mx = resolveValue(max, ctx) ?? 1;
  if (f === "base36") {
    const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
    let result = "";
    for (let i = 0;i < len; i++)
      result += chars[Math.floor(guestRandom(ctx, "random") * 36)];
    return result;
  }
  const val = guestRandom(ctx, "random");
  const range = mx - mn;
  const result = val * range + mn;
  if (f === "integer") {
    return Math.floor(result);
  }
  return result;
}, { docs: "Generate Random", cost: 1 });
var uuid = defineAtom("uuid", Ue.object({}), Ue.string, async (_input, ctx) => {
  const bytes = Array.from({ length: 16 }, () => Math.floor(guestRandom(ctx, "uuid") * 256));
  bytes[6] = bytes[6] & 15 | 64;
  bytes[8] = bytes[8] & 63 | 128;
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}, { docs: "Generate UUID", cost: 1 });
async function digestHex(str, algo) {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const encoder = new TextEncoder;
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest(algo, data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  let hash = 0;
  for (let i = 0;i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return String(hash);
}
var hash = defineAtom("hash", Ue.object({
  value: Ue.any,
  algorithm: Ue.string.optional
}), Ue.string, async ({ value, algorithm }, ctx) => {
  const str = stringifyInput(ctx, resolveValue(value, ctx), "hash");
  if (!chargeForSize(ctx, str, "hash"))
    return;
  return digestHex(str, resolveValue(algorithm, ctx) || "SHA-256");
}, { docs: "Hash a value", cost: 1 });
var consoleLog = defineAtom("consoleLog", Ue.object({ message: Ue.any }), undefined, async ({ message }, ctx) => {
  const msg = resolveValue(message, ctx);
  if (ctx.trace) {
    ctx.trace.push({
      op: "console.log",
      input: { message: msg },
      stateDiff: {},
      result: msg,
      fuelBefore: ctx.fuel.current,
      fuelAfter: ctx.fuel.current,
      timestamp: Date.now()
    });
  }
}, { docs: "Log to trace", cost: 0.1 });
var consoleWarn = defineAtom("consoleWarn", Ue.object({ message: Ue.any }), undefined, async ({ message }, ctx) => {
  const msg = resolveValue(message, ctx);
  const msgStr = stringifyInput(ctx, msg, "console");
  if (!ctx.warnings)
    ctx.warnings = [];
  ctx.warnings.push(msgStr);
  if (ctx.trace) {
    ctx.trace.push({
      op: "console.warn",
      input: { message: msg },
      stateDiff: {},
      result: msg,
      fuelBefore: ctx.fuel.current,
      fuelAfter: ctx.fuel.current,
      timestamp: Date.now()
    });
  }
}, { docs: "Add warning", cost: 0.1 });
var consoleError = defineAtom("consoleError", Ue.object({ message: Ue.any }), undefined, async ({ message }, ctx) => {
  const msg = resolveValue(message, ctx);
  const msgStr = stringifyInput(ctx, msg, "console");
  ctx.error = new AgentError(msgStr, "console.error");
}, { docs: "Emit error and stop", cost: 0.1 });
function holdToContract(ctx, schema, value, which) {
  if (schema === undefined)
    return;
  const nodes = admitGuestSchema(schema, "agentRun");
  chargeValidation(ctx, nodes, value, "agentRun");
  if (!qe(value, schema))
    throw new AgentError(which === "input" ? "Input validation failed: the sub-agent's arguments do not match its declared inputs" : "Result does not match the sub-agent's declared result type", "agentRun");
}
var storeProcedure = defineAtom("storeProcedure", Ue.object({
  ast: Ue.any,
  ttl: Ue.number.optional,
  maxSize: Ue.number.optional
}), Ue.string, async ({ ast, ttl, maxSize }, ctx) => {
  const resolvedAst = resolveValue(ast, ctx);
  checkAstVersion(resolvedAst, "storeProcedure");
  const resolvedTtl = ttl ? resolveValue(ttl, ctx) : DEFAULT_PROCEDURE_TTL;
  const resolvedMaxSize = maxSize ? resolveValue(maxSize, ctx) : DEFAULT_MAX_AST_SIZE;
  if (!resolvedAst || typeof resolvedAst !== "object" || !resolvedAst.op) {
    throw new Error('Invalid AST: must be an object with an "op" property');
  }
  const astJson = stringifyInput(ctx, resolvedAst, "storeProcedure");
  if (astJson.length > resolvedMaxSize) {
    throw new Error(`AST too large: ${astJson.length} bytes exceeds limit of ${resolvedMaxSize} bytes. ` + `Consider reducing AST size or using a shorter TTL.`);
  }
  const token = generateProcedureToken();
  const now = Date.now();
  procedureStore.set(token, {
    ast: resolvedAst,
    createdAt: now,
    expiresAt: now + resolvedTtl
  });
  return token;
}, { docs: "Store an AST and return a token for later execution", cost: 1 });
var releaseProcedure = defineAtom("releaseProcedure", Ue.object({ token: Ue.string }), Ue.boolean, async ({ token }, ctx) => {
  const resolvedToken = resolveValue(token, ctx);
  return procedureStore.delete(resolvedToken);
}, { docs: "Release a stored procedure by token", cost: 0.1 });
var clearExpiredProcedures = defineAtom("clearExpiredProcedures", Ue.object({}), Ue.number, async () => {
  const now = Date.now();
  let cleared = 0;
  for (const [token, entry] of procedureStore) {
    if (now > entry.expiresAt) {
      procedureStore.delete(token);
      cleared++;
    }
  }
  return cleared;
}, { docs: "Clear all expired procedures and return count", cost: 0.5 });
var coreAtoms = {
  seq,
  evaluate,
  if: iff,
  while: whileLoop,
  return: ret,
  try: tryCatch,
  Error: errorAtom,
  varSet,
  varAssign,
  constSet,
  varGet,
  varsImport,
  varsLet,
  varsExport,
  scope,
  callLocal,
  map,
  filter,
  reduce,
  find,
  push,
  len,
  split: split2,
  join,
  template,
  regexMatch,
  pick,
  omit,
  merge,
  keys,
  httpFetch: fetch2,
  storeGet,
  storeSet,
  storeQuery,
  storeQueryWhere,
  storeVectorSearch: vectorSearch,
  llmPredict,
  agentRun,
  transpileCode,
  runCode,
  jsonParse,
  jsonStringify,
  xmlParse,
  memoize,
  cache,
  random,
  uuid,
  hash,
  consoleLog,
  consoleWarn,
  consoleError,
  storeProcedure,
  releaseProcedure,
  clearExpiredProcedures
};
var EFFECTFUL_CORE_OPS = [
  "httpFetch",
  "storeGet",
  "storeSet",
  "storeQuery",
  "storeQueryWhere",
  "storeVectorSearch",
  "llmPredict",
  "agentRun",
  "transpileCode",
  "runCode",
  "random",
  "uuid",
  "consoleLog",
  "consoleWarn",
  "consoleError",
  "storeProcedure",
  "releaseProcedure",
  "clearExpiredProcedures",
  "cache",
  "memoize",
  "xmlParse"
];
var EFFECTFUL_SET = new Set(EFFECTFUL_CORE_OPS);
var LEAF_IO_OPS = new Set([
  "httpFetch",
  "storeGet",
  "storeSet",
  "storeQuery",
  "storeQueryWhere",
  "storeVectorSearch",
  "llmPredict",
  "transpileCode",
  "xmlParse",
  "consoleLog",
  "consoleWarn",
  "consoleError",
  "storeProcedure",
  "releaseProcedure"
]);
for (const [op, atom] of Object.entries(coreAtoms)) {
  atom.effects = EFFECTFUL_SET.has(op) ? "io" : "pure";
  atom.resolveInputs = LEAF_IO_OPS.has(op);
}

// node_modules/tjs-lang/src/builder.ts
var RESERVED_WORDS = new Set([
  "true",
  "false",
  "null",
  "undefined",
  "and",
  "or",
  "not"
]);
function warnMissingVars(condition, vars) {
  const withoutStrings = condition.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
  const identifiers = [];
  const regex = /(?<![.])\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
  let match;
  while ((match = regex.exec(withoutStrings)) !== null) {
    identifiers.push(match[1]);
  }
  const uniqueIds = [...new Set(identifiers)];
  const missing = uniqueIds.filter((id) => !RESERVED_WORDS.has(id) && !(id in vars) && !new RegExp(`\\b${id}\\s*\\(`).test(withoutStrings));
  if (missing.length > 0) {
    console.warn(`[Agent99 Builder] Condition "${condition}" references variables not in vars mapping: ${missing.join(", ")}. ` + `Add them to vars or use AsyncJS syntax (ajs\`...\`) which handles this automatically.`);
  }
}
function parseCondition(condition, vars) {
  warnMissingVars(condition, vars);
  const tokens = tokenize(condition);
  const result = parseExpression(tokens, 0, vars);
  if (result.pos < tokens.length) {
    const remaining = tokens.slice(result.pos).join(" ");
    throw new Error(`Unsupported condition syntax near '${remaining}' in: ${condition}
` + `Supported: comparisons, &&, ||, !, arithmetic, member access (a.b), literals`);
  }
  return result.node;
}
function tokenize(expr) {
  const tokens = [];
  let i = 0;
  while (i < expr.length) {
    while (i < expr.length && /\s/.test(expr[i]))
      i++;
    if (i >= expr.length)
      break;
    if (expr[i] === '"' || expr[i] === "'") {
      const quote = expr[i++];
      let str = "";
      while (i < expr.length && expr[i] !== quote) {
        if (expr[i] === "\\" && i + 1 < expr.length) {
          i++;
          str += expr[i++];
        } else {
          str += expr[i++];
        }
      }
      i++;
      tokens.push(JSON.stringify(str));
      continue;
    }
    if (expr.slice(i, i + 2).match(/^(&&|\|\||==|!=|>=|<=)$/)) {
      tokens.push(expr.slice(i, i + 2));
      i += 2;
      continue;
    }
    if ("+-*/%><!().?:[]".includes(expr[i])) {
      tokens.push(expr[i]);
      i++;
      continue;
    }
    if (/\d/.test(expr[i])) {
      let num = "";
      while (i < expr.length && /[\d.]/.test(expr[i])) {
        num += expr[i++];
      }
      tokens.push(num);
      continue;
    }
    if (/[a-zA-Z_]/.test(expr[i])) {
      let id = "";
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
        id += expr[i++];
      }
      tokens.push(id);
      continue;
    }
    i++;
  }
  return tokens;
}
function parseExpression(tokens, pos, vars) {
  return parseLogicalOr(tokens, pos, vars);
}
function parseLogicalOr(tokens, pos, vars) {
  let { node: left, pos: newPos } = parseLogicalAnd(tokens, pos, vars);
  while (tokens[newPos] === "||") {
    newPos++;
    const { node: right, pos: rightPos } = parseLogicalAnd(tokens, newPos, vars);
    left = { $expr: "logical", op: "||", left, right };
    newPos = rightPos;
  }
  return { node: left, pos: newPos };
}
function parseLogicalAnd(tokens, pos, vars) {
  let { node: left, pos: newPos } = parseComparison(tokens, pos, vars);
  while (tokens[newPos] === "&&") {
    newPos++;
    const { node: right, pos: rightPos } = parseComparison(tokens, newPos, vars);
    left = { $expr: "logical", op: "&&", left, right };
    newPos = rightPos;
  }
  return { node: left, pos: newPos };
}
function parseComparison(tokens, pos, vars) {
  let { node: left, pos: newPos } = parseAdditive(tokens, pos, vars);
  const compOps = ["==", "!=", ">", "<", ">=", "<="];
  while (compOps.includes(tokens[newPos])) {
    const op = tokens[newPos++];
    const { node: right, pos: rightPos } = parseAdditive(tokens, newPos, vars);
    left = { $expr: "binary", op, left, right };
    newPos = rightPos;
  }
  return { node: left, pos: newPos };
}
function parseAdditive(tokens, pos, vars) {
  let { node: left, pos: newPos } = parseMultiplicative(tokens, pos, vars);
  while (tokens[newPos] === "+" || tokens[newPos] === "-") {
    const op = tokens[newPos++];
    const { node: right, pos: rightPos } = parseMultiplicative(tokens, newPos, vars);
    left = { $expr: "binary", op, left, right };
    newPos = rightPos;
  }
  return { node: left, pos: newPos };
}
function parseMultiplicative(tokens, pos, vars) {
  let { node: left, pos: newPos } = parseUnary(tokens, pos, vars);
  while (tokens[newPos] === "*" || tokens[newPos] === "/" || tokens[newPos] === "%") {
    const op = tokens[newPos++];
    const { node: right, pos: rightPos } = parseUnary(tokens, newPos, vars);
    left = { $expr: "binary", op, left, right };
    newPos = rightPos;
  }
  return { node: left, pos: newPos };
}
function parseUnary(tokens, pos, vars) {
  if (tokens[pos] === "!" || tokens[pos] === "-") {
    const op = tokens[pos++];
    const { node: argument, pos: newPos } = parseUnary(tokens, pos, vars);
    return { node: { $expr: "unary", op, argument }, pos: newPos };
  }
  return parsePrimary(tokens, pos, vars);
}
function parsePrimary(tokens, pos, vars) {
  const token = tokens[pos];
  if (token === "(") {
    const { node, pos: newPos } = parseExpression(tokens, pos + 1, vars);
    return { node, pos: newPos + 1 };
  }
  if (token && token.startsWith('"')) {
    return {
      node: { $expr: "literal", value: JSON.parse(token) },
      pos: pos + 1
    };
  }
  if (token && /^\d/.test(token)) {
    return {
      node: { $expr: "literal", value: parseFloat(token) },
      pos: pos + 1
    };
  }
  if (token === "true")
    return { node: { $expr: "literal", value: true }, pos: pos + 1 };
  if (token === "false")
    return { node: { $expr: "literal", value: false }, pos: pos + 1 };
  if (token === "null")
    return { node: { $expr: "literal", value: null }, pos: pos + 1 };
  if (token && /^[a-zA-Z_]/.test(token)) {
    let node = { $expr: "ident", name: token };
    let newPos = pos + 1;
    while (tokens[newPos] === ".") {
      newPos++;
      const prop = tokens[newPos++];
      node = { $expr: "member", object: node, property: prop };
    }
    return { node, pos: newPos };
  }
  return { node: { $expr: "literal", value: null }, pos: pos + 1 };
}

class TypedBuilder {
  steps = [];
  atoms;
  proxy;
  constructor(atoms) {
    this.atoms = atoms;
    this.proxy = new Proxy(this, {
      get: (target, prop, receiver) => {
        if (prop in target)
          return target[prop];
        if (typeof prop === "string" && prop in target.atoms) {
          return (input) => {
            const atom = target.atoms[prop];
            target.add(atom.create(input));
            return receiver;
          };
        }
        return;
      }
    });
    return this.proxy;
  }
  add(step) {
    this.steps.push(step);
    return this.proxy;
  }
  as(variableName) {
    if (this.steps.length === 0)
      throw new Error("No step to capture");
    const last = this.steps[this.steps.length - 1];
    last.result = variableName;
    return this.proxy;
  }
  step(node) {
    return this.add(node);
  }
  return(schema) {
    const atom = this.atoms["return"];
    if (!atom)
      throw new Error("Atom 'return' not found");
    const _schema = F(schema) ? schema.schema : schema;
    return this.add(atom.create({ schema: _schema }));
  }
  toJSON() {
    return {
      [AST_VERSION_KEY]: BUILDER_AST_VERSION,
      op: "seq",
      steps: [...this.steps]
    };
  }
  varsImport(keys) {
    return this.add(this.atoms["varsImport"].create({ keys }));
  }
  varsExport(keys) {
    return this.add(this.atoms["varsExport"].create({ keys }));
  }
  if(condition, vars, thenBranch, elseBranch) {
    const thenB = new TypedBuilder(this.atoms);
    thenBranch(thenB);
    let elseSteps;
    if (elseBranch) {
      const elseB = new TypedBuilder(this.atoms);
      elseBranch(elseB);
      elseSteps = elseB.steps;
    }
    const conditionExpr = parseCondition(condition, vars);
    const ifAtom = this.atoms["if"];
    return this.add(ifAtom.create({
      condition: conditionExpr,
      then: thenB.steps,
      else: elseSteps
    }));
  }
  while(condition, vars, body) {
    const bodyB = new TypedBuilder(this.atoms);
    body(bodyB);
    const conditionExpr = parseCondition(condition, vars);
    const whileAtom = this.atoms["while"];
    return this.add(whileAtom.create({
      condition: conditionExpr,
      body: bodyB.steps
    }));
  }
  scope(steps) {
    const scopeB = new TypedBuilder(this.atoms);
    steps(scopeB);
    const scopeAtom = this.atoms["scope"];
    return this.add(scopeAtom.create({
      steps: scopeB.steps
    }));
  }
  map(items, as, steps) {
    const stepsB = new TypedBuilder(this.atoms);
    steps(stepsB);
    const mapAtom = this.atoms["map"];
    return this.add(mapAtom.create({
      items,
      as,
      steps: stepsB.steps
    }));
  }
  filter(items, as, condition, vars = {}) {
    const conditionExpr = parseCondition(condition, vars);
    const filterAtom = this.atoms["filter"];
    return this.add(filterAtom.create({
      items,
      as,
      condition: conditionExpr
    }));
  }
  find(items, as, condition, vars = {}) {
    const conditionExpr = parseCondition(condition, vars);
    const findAtom = this.atoms["find"];
    return this.add(findAtom.create({
      items,
      as,
      condition: conditionExpr
    }));
  }
  reduce(items, as, accumulator, initial, steps) {
    const stepsB = new TypedBuilder(this.atoms);
    steps(stepsB);
    const reduceAtom = this.atoms["reduce"];
    return this.add(reduceAtom.create({
      items,
      as,
      accumulator,
      initial,
      steps: stepsB.steps
    }));
  }
  memoize(steps, key) {
    const stepsB = new TypedBuilder(this.atoms);
    steps(stepsB);
    const memoAtom = this.atoms["memoize"];
    return this.add(memoAtom.create({
      key,
      steps: stepsB.steps
    }));
  }
  cache(steps, key, ttlMs) {
    const stepsB = new TypedBuilder(this.atoms);
    steps(stepsB);
    const cacheAtom = this.atoms["cache"];
    return this.add(cacheAtom.create({
      key,
      steps: stepsB.steps,
      ttlMs
    }));
  }
  try(branches) {
    const tryB = new TypedBuilder(this.atoms);
    branches.try(tryB);
    let catchSteps;
    if (branches.catch) {
      const catchB = new TypedBuilder(this.atoms);
      branches.catch(catchB);
      catchSteps = catchB.steps;
    }
    const tryAtom = this.atoms["try"];
    return this.add(tryAtom.create({
      try: tryB.steps,
      catch: catchSteps
    }));
  }
}

// node_modules/tjs-lang/src/vm/vm.ts
var MIN_DEFAULT_RUN_TIMEOUT_MS = 60000;
var ARG_BYTES_PER_FUEL = 8000;
var deprecationNoted = false;
var DEFAULT_ARGS_MAX_BYTES = 4 * 1024 * 1024;
var MAX_VALIDATION_PATHS = 1e6;
var MAX_VALIDATION_STEPS = 1e8;
function countPaths(value, limit) {
  let n = 0;
  const stack = [value];
  while (stack.length) {
    const v = stack.pop();
    if (++n > limit)
      return n;
    if (v && typeof v === "object")
      for (const x of Object.values(v))
        stack.push(x);
  }
  return n;
}

class AgentVM {
  atoms;
  _defaultRunTimeout;
  constructor(customAtoms = {}) {
    this.atoms = { ...coreAtoms, ...customAtoms };
    for (const atom of Object.values(this.atoms)) {
      const raw = atom.timeoutMs;
      if (typeof raw !== "function")
        budgetOption(`timeoutMs of atom '${atom.op}'`, raw, 1000);
    }
  }
  get defaultRunTimeout() {
    if (this._defaultRunTimeout === undefined) {
      let slowest = 0;
      for (const atom of Object.values(this.atoms)) {
        const raw = atom.timeoutMs;
        if (typeof raw === "function")
          continue;
        const t = raw ?? 1000;
        if (t > 0 && Number.isFinite(t) && t > slowest)
          slowest = t;
      }
      this._defaultRunTimeout = Math.max(MIN_DEFAULT_RUN_TIMEOUT_MS, slowest * 2);
    }
    return this._defaultRunTimeout;
  }
  get builder() {
    return new TypedBuilder(this.atoms);
  }
  get Agent() {
    return new TypedBuilder(this.atoms);
  }
  get A99() {
    return this.Agent;
  }
  resolve(op) {
    return Object.prototype.hasOwnProperty.call(this.atoms, op) ? this.atoms[op] : undefined;
  }
  getTools(filter = "all") {
    let targetAtoms = Object.values(this.atoms);
    if (Array.isArray(filter)) {
      targetAtoms = targetAtoms.filter((a) => filter.includes(a.op));
    } else if (filter === "flow") {
      const flowOps = [
        "seq",
        "if",
        "while",
        "return",
        "try",
        "varSet",
        "varGet",
        "scope"
      ];
      targetAtoms = targetAtoms.filter((a) => flowOps.includes(a.op));
    }
    return targetAtoms.map((atom) => ({
      type: "function",
      function: {
        name: atom.op,
        description: atom.docs,
        parameters: F(atom.inputSchema) ? atom.inputSchema.schema : atom.inputSchema ?? {}
      }
    }));
  }
  async run(astOrToken, args = {}, options = {}) {
    const admitted = admitRunOptions(options);
    if (typeof admitted === "string") {
      const error = new AgentError(admitted, "vm.run");
      return { result: error, error, fuelUsed: 0, warnings: undefined };
    }
    let ast;
    if (typeof astOrToken === "string") {
      if (isProcedureToken(astOrToken)) {
        ast = resolveProcedureToken(astOrToken);
      } else {
        const transpileImpl = getTranspiler();
        if (!transpileImpl)
          throw new Error(`This VM accepts an AST, not source: no transpiler is wired in. ` + `That is the point of the 'tjs-lang/vm-ast' build — it contains no parser, so ` + `no parser defect is reachable through it. Transpile on the CALLER's side, ` + `where the source is your own, and send the AST:

` + `    import { transpile } from 'tjs-lang/lang'
` + `    const { ast } = transpile(source)
` + `    await vm.run(ast, args)

` + `If you want the VM to parse for you, import 'tjs-lang/vm' instead.`);
        const maxSource = admitted.maxSourceBytes ?? DEFAULT_MAX_SOURCE_BYTES;
        const over = sourceBytesOver(astOrToken, maxSource);
        if (over !== null) {
          const error = new AgentError(`Source is ${over} bytes, over the ${maxSource}-byte limit. Transpilation runs ` + `BEFORE fuel and timeout apply, so oversized source is refused rather than ` + `metered. Raise maxSourceBytes if the source is trusted.`, "vm.run");
          return { result: error, error, fuelUsed: 0, warnings: undefined };
        }
        if (!deprecationNoted)
          deprecationNoted = recordVmEvent({
            source: "vm",
            severity: "notice",
            message: "vm.run(source) is deprecated. Run ASTs with tjs-lang/vm-ast, and transpile " + "OUTSIDE the VM host: on the caller's machine, or in a worker or separate process " + "you can afford to lose. A hostile payload then costs only the step that parsed it. " + "If you must transpile untrusted source in-process, cap it: " + "transpile(source, { maxSourceBytes: 8192 }) from tjs-lang/lang."
          });
        try {
          ast = transpileImpl(astOrToken, { atoms: this.atoms }).ast;
        } catch (e) {
          throw new Error(`AJS transpilation failed: ${e.message}`, {
            cause: e
          });
        }
      }
    } else {
      ast = astOrToken;
    }
    const startFuel = admitted.fuel ?? 1000;
    const timeoutMs = admitted.timeoutMs ?? this.defaultRunTimeout;
    const hostCaps = admitted.capabilities;
    if (hostCaps !== undefined && (hostCaps === null || typeof hostCaps !== "object"))
      throw new Error("vm.run: capabilities must be an object");
    const capabilities = hostCaps ?? {};
    const warnings = [];
    const memoryStore = new Map;
    let warned = false;
    const warn = () => {
      if (!warned) {
        warned = true;
        warnings.push("Using default in-memory store (not suitable for production)");
      }
    };
    const defaultStore = {
      get: async (key) => {
        warn();
        return memoryStore.get(key);
      },
      set: async (key, value) => {
        warn();
        memoryStore.set(key, value);
      }
    };
    checkAstVersion(ast, "AgentVM.run");
    if (ast.op !== "seq")
      throw new Error("Root AST must be 'seq'. Ensure you're passing a transpiled agent (use ajs`...` or transpile()).");
    const argsCap = admitted.argsMaxBytes ?? DEFAULT_ARGS_MAX_BYTES;
    const fuelBytes = startFuel * ARG_BYTES_PER_FUEL;
    const argsBudget = Math.min(argsCap, fuelBytes);
    const crossed = membraneValueFrom("run argument", args, argsBudget);
    if (!crossed.ok) {
      const outOfFuel = fuelBytes < argsCap && /-byte membrane budget/.test(crossed.reason);
      const error = new AgentError(outOfFuel ? "Out of Fuel" : `Capability boundary rejected the run arguments: ${crossed.reason}`, "vm.run");
      return {
        result: error,
        error,
        fuelUsed: outOfFuel ? startFuel : Math.min(startFuel, argsBudget / ARG_BYTES_PER_FUEL),
        trace: admitted.trace ? [] : undefined,
        warnings: warnings.length > 0 ? warnings : undefined
      };
    }
    const admissionFuel = (crossed.bytes ?? 0) / ARG_BYTES_PER_FUEL;
    args = Object.assign(Object.create(null), crossed.value);
    const inputSchema = ast.inputSchema;
    let refused;
    let validationFuel = 0;
    if (inputSchema)
      try {
        const nodes = admitGuestSchema(inputSchema, "vm.run");
        const ceiling = Math.min(MAX_VALIDATION_PATHS, Math.floor(MAX_VALIDATION_STEPS / Math.max(1, nodes)));
        const affordable = Math.min(ceiling, Math.ceil(Math.max(0, startFuel - admissionFuel) / (nodes * VALIDATION_FUEL_PER_STEP)));
        const paths = countPaths(args, affordable);
        if (paths > ceiling)
          throw new AgentError(`Arguments too large to validate against the inputSchema (over ${ceiling} paths for a ${nodes}-node schema): validate in the host, or pass fewer, smaller arguments`, "vm.run");
        validationFuel = nodes * paths * VALIDATION_FUEL_PER_STEP;
      } catch (e) {
        if (!(e instanceof AgentError))
          throw e;
        refused = e;
      }
    if (!refused && admissionFuel + validationFuel >= startFuel)
      refused = new AgentError("Out of Fuel", "vm.run");
    let firstFailure = "";
    if (inputSchema && (refused || !qe(args, inputSchema, (path, msg) => {
      if (!firstFailure)
        firstFailure = `${path || "(arguments)"}: ${msg}`;
    }))) {
      const detail = firstFailure.length > 200 ? firstFailure.slice(0, 200) + "…" : firstFailure;
      const error = refused ?? new AgentError(`Input validation failed: args do not match expected schema${detail ? ` (${detail})` : ""}`, "vm.run");
      return {
        result: error,
        error,
        fuelUsed: 0,
        trace: admitted.trace ? [] : undefined,
        warnings: warnings.length > 0 ? warnings : undefined
      };
    }
    const controller = new AbortController;
    const armed = timeoutMs === 0 ? 0 : timerMs(timeoutMs);
    let timedOut = false;
    const timeout = armed === undefined ? undefined : setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, armed);
    if (armed === 0) {
      timedOut = true;
      controller.abort();
    }
    if (admitted.signal) {
      admitted.signal.addEventListener("abort", () => controller.abort(), {
        signal: controller.signal
      });
      if (admitted.signal.aborted)
        controller.abort();
    }
    const memo = new Map;
    const heapRoots = new Set([memo]);
    if (args && typeof args === "object")
      heapRoots.add(args);
    const ctx = {
      astVersion: astVersionOf(ast) ?? AST_VERSION_LEGACY,
      memo,
      fuel: { current: startFuel - admissionFuel - validationFuel },
      args,
      state: newScopeState({ heapRoots }),
      heapRoots,
      consts: new Set,
      heapAccount: { bytes: 0, transient: 0 },
      halt: {},
      clock: {
        deadline: armed === undefined ? Infinity : performance.now() + Math.max(0, armed),
        sliceEnd: performance.now() + CLOCK_SLICE_MS,
        steps: 0,
        expire: () => {
          timedOut = true;
          controller.abort();
        }
      },
      heapPerKey: new Map,
      capabilities,
      defaultStore,
      resolver: (op) => this.resolve(op),
      output: undefined,
      signal: controller.signal,
      costOverrides: admitted.costOverrides,
      quotas: admitted.quotas,
      maxSourceBytes: admitted.maxSourceBytes,
      quotaUsed: admitted.quotaUsed ?? {},
      quotaLocal: Object.create(null),
      timeoutOverrides: admitted.timeoutOverrides,
      context: admitted.context,
      membraneMaxBytes: admitted.membraneMaxBytes,
      maxHeapBytes: admitted.maxHeapBytes,
      warnings,
      helpers: ast.helpers
    };
    if (admitted.trace) {
      ctx.trace = [];
    }
    try {
      await Promise.race([
        this.resolve("seq")?.exec(ast, ctx),
        new Promise((_, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(new Error(`Execution timeout after ${timeoutMs}ms. Pass a higher \`timeoutMs\` to vm.run() or set per-atom \`timeoutOverrides\` for slow IO atoms.`));
          });
          if (controller.signal.aborted) {
            reject(new Error(`Execution timeout after ${timeoutMs}ms. Pass a higher \`timeoutMs\` to vm.run() or set per-atom \`timeoutOverrides\` for slow IO atoms.`));
          }
        })
      ]);
    } catch (e) {
      if (e.message?.includes("timeout") || e.message?.includes("aborted") || controller.signal.aborted) {
        ctx.error = new AgentError(timedOut || !admitted.signal?.aborted ? `Execution timeout after ${timeoutMs}ms. Pass a higher \`timeoutMs\` to vm.run() or set per-atom \`timeoutOverrides\` for slow IO atoms.` : "Execution aborted by the caller (options.signal)", "vm.run");
      } else {
        throw e;
      }
    } finally {
      clearTimeout(timeout);
      if (!timedOut && admitted.signal?.aborted && ctx.error?.message === "Execution aborted")
        ctx.error = new AgentError("Execution aborted by the caller (options.signal)", "vm.run");
      if (timedOut && ctx.error?.message === "Execution aborted")
        ctx.error = new AgentError(`Execution timeout after ${timeoutMs}ms. Pass a higher \`timeoutMs\` to vm.run() or set per-atom \`timeoutOverrides\` for slow IO atoms.`, "vm.run");
      controller.abort();
    }
    if (ctx.halt.error) {
      ctx.error = ctx.halt.error;
      ctx.output = ctx.halt.error;
    }
    const outputSchema = ast.outputSchema;
    if (outputSchema !== undefined && !ctx.error) {
      let failure;
      try {
        const nodes = admitGuestSchema(outputSchema, "vm.run");
        const ceiling = Math.min(MAX_VALIDATION_PATHS, Math.floor(MAX_VALIDATION_STEPS / Math.max(1, nodes)));
        const affordable = Math.min(ceiling, Math.floor(Math.max(0, ctx.fuel.current) / (nodes * VALIDATION_FUEL_PER_STEP)));
        const paths = countPaths(ctx.output, affordable);
        if (paths > affordable)
          throw new AgentError(paths > ceiling ? `Result too large to validate against the declared result (over ${ceiling} paths for a ${nodes}-node schema)` : "Out of Fuel", "vm.run");
        ctx.fuel.current -= nodes * paths * VALIDATION_FUEL_PER_STEP;
        if (!qe(ctx.output, outputSchema))
          throw new AgentError("Result does not match the declared result type", "vm.run");
      } catch (e) {
        if (!(e instanceof AgentError))
          throw e;
        failure = e;
      }
      if (failure) {
        ctx.error = failure;
        ctx.output = failure;
      }
    }
    if (ctx.error && ctx.output === undefined) {
      ctx.output = ctx.error;
    }
    const allWarnings = [...warnings, ...ctx.warnings ?? []];
    return {
      result: ctx.output,
      error: ctx.error,
      fuelUsed: startFuel - ctx.fuel.current,
      trace: ctx.trace,
      warnings: allWarnings.length > 0 ? allWarnings : undefined
    };
  }
}

// node_modules/tjs-lang/src/lang/eval.ts
setTranspiler(transpile);
var _vm = null;
var getVM = () => _vm ??= new AgentVM;
function wrapReturnValues(node) {
  if (!node || typeof node !== "object")
    return;
  if (Array.isArray(node)) {
    for (const child of node)
      wrapReturnValues(child);
    return;
  }
  if (node.op === "return" && "value" in node) {
    node.value = { __result: node.value };
  }
  if (CALLBACK_OPS.has(node.op) && !node.loop)
    return;
  if (node.steps)
    wrapReturnValues(node.steps);
  if (node.then)
    wrapReturnValues(node.then);
  if (node.else)
    wrapReturnValues(node.else);
  if (node.body)
    wrapReturnValues(node.body);
  if (node.try)
    wrapReturnValues(node.try);
  if (node.catch)
    wrapReturnValues(node.catch);
}
var CALLBACK_OPS = new Set(["map", "reduce", "memoize", "cache"]);
function withSystemSources(capabilities) {
  return { clock: systemClock, random: systemRandom, ...capabilities };
}
function fetchContext(policy) {
  if (!policy)
    return;
  return {
    ...policy.domains && { allowedFetchDomains: policy.domains },
    ...policy.methods && { allowedFetchMethods: policy.methods },
    ...policy.headers && { allowedRequestHeaders: policy.headers },
    ...policy.privateNetwork === true && { allowPrivateNetwork: true }
  };
}
var IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
function identifiersIn(program) {
  const names = new Set;
  const stack = [program];
  while (stack.length) {
    const n = stack.pop();
    if (!n || typeof n !== "object")
      continue;
    if (Array.isArray(n)) {
      for (const x of n)
        stack.push(x);
      continue;
    }
    if (n.type === "Identifier")
      names.add(n.name);
    for (const k of Object.keys(n)) {
      if (k === "loc" || k === "start" || k === "end")
        continue;
      if (!n.computed && (n.type === "MemberExpression" && k === "property" || n.type === "Property" && k === "key" && !n.shorthand))
        continue;
      const v = n[k];
      if (v && typeof v === "object")
        stack.push(v);
    }
  }
  return names;
}
function parsesAsExpression(code) {
  try {
    parse(`(
${code}
)`, { ecmaVersion: "latest" });
    return true;
  } catch {
    return false;
  }
}
var SHADOW_PROOF = new Set([
  "NaN",
  "Infinity",
  "undefined",
  "globalThis",
  ...BUILTIN_OBJECTS,
  ...BUILTIN_GLOBALS
]);
var RESERVED = new Set("break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof let new null return super switch this throw true try typeof var void while with yield await implements interface package private protected public static arguments eval".split(" "));
function checkSourceSize(code, max, what) {
  const bytes = sourceBytesOver(code, max);
  if (bytes !== null) {
    throw new Error(`${what} is ${bytes} bytes, over the ${max}-byte limit. Transpilation runs BEFORE ` + `fuel and timeout apply, so oversized source is refused rather than metered. ` + `Raise or disable it with maxSourceBytes if the source is trusted.`);
  }
}
async function Eval(options) {
  const {
    code,
    context = {},
    fuel = 1000,
    timeoutMs,
    capabilities = {},
    maxSourceBytes = DEFAULT_MAX_SOURCE_BYTES,
    argsMaxBytes,
    fetchPolicy
  } = options;
  const vm = getVM();
  try {
    if (typeof code !== "string")
      throw new Error("Eval code must be a string");
    checkSourceSize(code, maxSourceBytes, "Eval source");
    const statements = !parsesAsExpression(code) && /\breturn\b/.test(maskLiterals(code));
    const wrappedCode = statements ? `function __eval() { {
${code}
} }` : `function __eval() { return (
${code}
) }`;
    const parsed = parseAgentSource(wrappedCode);
    const used = identifiersIn(parsed.ast);
    const keys = Object.keys(context).filter((k) => used.has(k) && IDENTIFIER.test(k) && !RESERVED.has(k) && !FORBIDDEN_KEYS_SET.has(k) && !SHADOW_PROOF.has(k) && !(k in builtins));
    const { ast } = transpile(wrappedCode, {
      parsed,
      atoms: vm.atoms,
      globals: keys
    });
    wrapReturnValues(ast);
    if (keys.length)
      ast.steps.unshift({ op: "varsImport", keys });
    const args = Object.fromEntries(keys.map((key) => [key, context[key]]));
    const vmResult = await vm.run(ast, args, {
      fuel,
      timeoutMs,
      capabilities: withSystemSources(capabilities),
      argsMaxBytes,
      context: fetchContext(fetchPolicy)
    });
    const raw = vmResult.result;
    const result = raw && typeof raw === "object" && "__result" in raw ? raw.__result : raw;
    return {
      result,
      fuelUsed: vmResult.fuelUsed,
      error: vmResult.error ? { message: vmResult.error.message || String(vmResult.error) } : undefined
    };
  } catch (err) {
    return {
      result: undefined,
      fuelUsed: fuel,
      error: { message: err.message || String(err) }
    };
  }
}
// node_modules/tjs-lang/src/index.ts
setTranspiler(transpile);

// src/index.js
import { onRequest } from "firebase-functions/v2/https";
import { onCall as onCall2, HttpsError as HttpsError2 } from "firebase-functions/v2/https";

// src/version.js
var TJS_LANG_VERSION = "0.14.0";

// src/index.js
import { initializeApp } from "firebase-admin/app";
import { getFirestore as getFirestore6, FieldValue as FieldValue2 } from "firebase-admin/firestore";

// src/crypto.js
import * as crypto2 from "crypto";
function base64ToBuffer(base64) {
  return Buffer.from(base64, "base64");
}
base64ToBuffer.__tjs = {
  params: {
    base64: {
      type: {
        kind: "any"
      },
      required: false
    }
  },
  unsafe: true,
  source: "crypto.tjs:12"
};
async function decrypt(encryptedBase64, keyBase64) {
  const keyBuffer = base64ToBuffer(keyBase64);
  const combined = base64ToBuffer(encryptedBase64);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const authTag = ciphertext.slice(-16);
  const encryptedData = ciphertext.slice(0, -16);
  const decipher = crypto2.createDecipheriv("aes-256-gcm", keyBuffer, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedData);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString("utf8");
}
decrypt.__tjs = {
  params: {
    encryptedBase64: {
      type: {
        kind: "any"
      },
      required: false
    },
    keyBase64: {
      type: {
        kind: "any"
      },
      required: false
    }
  },
  unsafe: true,
  source: "crypto.tjs:16"
};

// src/llm.js
var __tjs_rt = (() => {
  const __ubxv = Symbol.for("xin-value");
  function __ub(v) {
    try {
      if (v !== null && (typeof v === "object" || typeof v === "function")) {
        const w = v[__ubxv];
        if (w !== undefined)
          return w;
      }
      if (v instanceof String)
        return String.prototype.valueOf.call(v);
      if (v instanceof Number)
        return Number.prototype.valueOf.call(v);
      if (v instanceof Boolean)
        return Boolean.prototype.valueOf.call(v);
    } catch {
      return v;
    }
    return v;
  }
  const __ac = Object.create(null);
  function __proj(v) {
    if (v === null || v === undefined || typeof v !== "object")
      return v;
    let k;
    try {
      k = v.constructor && v.constructor.name;
    } catch {
      return v;
    }
    let f = k && Object.prototype.hasOwnProperty.call(__ac, k) ? __ac[k] : null;
    if (typeof f !== "function") {
      try {
        f = v.asCompared;
      } catch {
        return v;
      }
    }
    if (typeof f !== "function")
      return v;
    let p;
    try {
      p = f.call(v);
    } catch {
      return v;
    }
    const t = typeof p;
    return p === null || p === undefined || t === "number" || t === "string" || t === "boolean" ? p : v;
  }
  function TypeOf(v) {
    return v === null ? "null" : typeof v;
  }
  function toBool(v) {
    return Boolean(__ub(__proj(v)));
  }
  return { __ubxv, __ub, __proj, __ac, TypeOf, toBool };
})();
var TypeOf = __tjs_rt.TypeOf;
var toBool = __tjs_rt.toBool;
var __tjs = (globalThis.__tjs?.abi >= 2 ? globalThis.__tjs.createRuntime?.() : undefined) ?? { TypeOf: __tjs_rt.TypeOf, toBool: __tjs_rt.toBool };
var __tjsToBool = __tjs.toBool;
__tjs.toBool = function(v) {
  return __tjsToBool(__tjs_rt.__proj(v));
};
function createLlmCapability(apiKeys) {
  return {
    async predict(prompt, options = {}) {
      const apiKey = ((__tjs__t) => __tjs.toBool(__tjs__t) ? __tjs__t : apiKeys.deepseek)(((__tjs__t) => __tjs.toBool(__tjs__t) ? __tjs__t : apiKeys.gemini)(((__tjs__t) => __tjs.toBool(__tjs__t) ? __tjs__t : apiKeys.anthropic)(apiKeys.openai)));
      if (__tjs.toBool(!__tjs.toBool(apiKey))) {
        return { error: "No LLM API key configured" };
      }
      let endpoint, headers, body;
      if (__tjs.toBool(apiKeys.openai)) {
        endpoint = "https://api.openai.com/v1/chat/completions";
        headers = {
          Authorization: `Bearer ${apiKeys.openai}`,
          "Content-Type": "application/json"
        };
        body = {
          model: ((__tjs__t) => __tjs.toBool(__tjs__t) ? __tjs__t : "gpt-4o-mini")(options.model),
          messages: [{ role: "user", content: prompt }],
          max_tokens: ((__tjs__t) => __tjs.toBool(__tjs__t) ? __tjs__t : 1000)(options.maxTokens)
        };
      } else if (__tjs.toBool(apiKeys.anthropic)) {
        endpoint = "https://api.anthropic.com/v1/messages";
        headers = {
          "x-api-key": apiKeys.anthropic,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json"
        };
        body = {
          model: ((__tjs__t) => __tjs.toBool(__tjs__t) ? __tjs__t : "claude-3-haiku-20240307")(options.model),
          max_tokens: ((__tjs__t) => __tjs.toBool(__tjs__t) ? __tjs__t : 1000)(options.maxTokens),
          messages: [{ role: "user", content: prompt }]
        };
      } else if (__tjs.toBool(apiKeys.gemini)) {
        const model = ((__tjs__t) => __tjs.toBool(__tjs__t) ? __tjs__t : "gemini-2.5-flash-lite")(options.model);
        endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKeys.gemini}`;
        headers = { "Content-Type": "application/json" };
        body = {
          contents: [{ parts: [{ text: prompt }] }]
        };
      } else if (__tjs.toBool(apiKeys.deepseek)) {
        endpoint = "https://api.deepseek.com/v1/chat/completions";
        headers = {
          Authorization: `Bearer ${apiKeys.deepseek}`,
          "Content-Type": "application/json"
        };
        body = {
          model: ((__tjs__t) => __tjs.toBool(__tjs__t) ? __tjs__t : "deepseek-chat")(options.model),
          messages: [{ role: "user", content: prompt }],
          max_tokens: ((__tjs__t) => __tjs.toBool(__tjs__t) ? __tjs__t : 1000)(options.maxTokens)
        };
      }
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(body)
        });
        const data = await response.json();
        let text;
        if (__tjs.toBool(apiKeys.gemini)) {
          text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        } else if (__tjs.toBool(apiKeys.anthropic)) {
          text = data.content?.[0]?.text;
        } else {
          text = data.choices?.[0]?.message?.content;
        }
        if (__tjs.toBool((__tjs.toBool(typeof text === "undefined") ? "undefined" : __tjs_rt.TypeOf(text)) !== "string")) {
          throw new Error("LLM returned unexpected format: " + JSON.stringify(data));
        }
        return text;
      } catch (error) {
        throw new Error("LLM error: " + error.message);
      }
    }
  };
}
createLlmCapability.__tjs = {
  params: {
    apiKeys: {
      type: {
        kind: "any"
      },
      required: false
    }
  },
  unsafe: true,
  source: "llm.tjs:10"
};

// src/store.js
import { getFirestore as getFirestore3 } from "firebase-admin/firestore";

// src/rbac.js
import { getFirestore } from "firebase-admin/firestore";

// src/schema.js
var __tjs_rt2 = (() => {
  const __ubxv = Symbol.for("xin-value");
  function __ub(v) {
    try {
      if (v !== null && (typeof v === "object" || typeof v === "function")) {
        const w = v[__ubxv];
        if (w !== undefined)
          return w;
      }
      if (v instanceof String)
        return String.prototype.valueOf.call(v);
      if (v instanceof Number)
        return Number.prototype.valueOf.call(v);
      if (v instanceof Boolean)
        return Boolean.prototype.valueOf.call(v);
    } catch {
      return v;
    }
    return v;
  }
  const __ac = Object.create(null);
  function __proj(v) {
    if (v === null || v === undefined || typeof v !== "object")
      return v;
    let k;
    try {
      k = v.constructor && v.constructor.name;
    } catch {
      return v;
    }
    let f = k && Object.prototype.hasOwnProperty.call(__ac, k) ? __ac[k] : null;
    if (typeof f !== "function") {
      try {
        f = v.asCompared;
      } catch {
        return v;
      }
    }
    if (typeof f !== "function")
      return v;
    let p;
    try {
      p = f.call(v);
    } catch {
      return v;
    }
    const t = typeof p;
    return p === null || p === undefined || t === "number" || t === "string" || t === "boolean" ? p : v;
  }
  function TypeOf(v) {
    return v === null ? "null" : typeof v;
  }
  function toBool(v) {
    return Boolean(__ub(__proj(v)));
  }
  return { __ubxv, __ub, __proj, __ac, TypeOf, toBool };
})();
var TypeOf2 = __tjs_rt2.TypeOf;
var toBool2 = __tjs_rt2.toBool;
var __tjs2 = (globalThis.__tjs?.abi >= 2 ? globalThis.__tjs.createRuntime?.() : undefined) ?? { TypeOf: __tjs_rt2.TypeOf, toBool: __tjs_rt2.toBool };
var __tjsToBool2 = __tjs2.toBool;
__tjs2.toBool = function(v) {
  return __tjsToBool2(__tjs_rt2.__proj(v));
};
function validateSchema(schema, data) {
  if (__tjs2.toBool(((__tjs__t) => __tjs2.toBool(__tjs__t) ? __tjs__t : !__tjs2.toBool(data))(!__tjs2.toBool(schema))))
    return { valid: true };
  const errors = [];
  if (__tjs2.toBool(schema.type)) {
    const actualType = __tjs2.toBool(Array.isArray(data)) ? "array" : __tjs2.toBool(typeof data === "undefined") ? "undefined" : __tjs_rt2.TypeOf(data);
    if (__tjs2.toBool(schema.type !== actualType)) {
      errors.push(`Expected type ${schema.type}, got ${actualType}`);
    }
  }
  if (__tjs2.toBool(((__tjs__t) => __tjs2.toBool(__tjs__t) ? data !== null : __tjs__t)(((__tjs__t) => __tjs2.toBool(__tjs__t) ? (__tjs2.toBool(typeof data === "undefined") ? "undefined" : __tjs_rt2.TypeOf(data)) === "object" : __tjs__t)(schema.type === "object")))) {
    if (__tjs2.toBool(schema.required)) {
      for (const field of schema.required) {
        if (__tjs2.toBool(!__tjs2.toBool(field in data))) {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }
    if (__tjs2.toBool(schema.properties)) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (__tjs2.toBool(key in data)) {
          const propResult = validateSchema(propSchema, data[key]);
          if (__tjs2.toBool(!__tjs2.toBool(propResult.valid))) {
            errors.push(...propResult.errors.map((e) => `${key}: ${e}`));
          }
        }
      }
    }
  }
  if (__tjs2.toBool(((__tjs__t) => __tjs2.toBool(__tjs__t) ? (__tjs2.toBool(typeof data === "undefined") ? "undefined" : __tjs_rt2.TypeOf(data)) === "string" : __tjs__t)(schema.type === "string"))) {
    if (__tjs2.toBool(((__tjs__t) => __tjs2.toBool(__tjs__t) ? data.length < schema.minLength : __tjs__t)(schema.minLength))) {
      errors.push(`String too short (min ${schema.minLength})`);
    }
    if (__tjs2.toBool(((__tjs__t) => __tjs2.toBool(__tjs__t) ? data.length > schema.maxLength : __tjs__t)(schema.maxLength))) {
      errors.push(`String too long (max ${schema.maxLength})`);
    }
    if (__tjs2.toBool(((__tjs__t) => __tjs2.toBool(__tjs__t) ? !__tjs2.toBool(new RegExp(schema.pattern).test(data)) : __tjs__t)(schema.pattern))) {
      errors.push(`String does not match pattern`);
    }
  }
  if (__tjs2.toBool(((__tjs__t) => __tjs2.toBool(__tjs__t) ? (__tjs2.toBool(typeof data === "undefined") ? "undefined" : __tjs_rt2.TypeOf(data)) === "number" : __tjs__t)(schema.type === "number"))) {
    if (__tjs2.toBool(((__tjs__t) => __tjs2.toBool(__tjs__t) ? data < schema.minimum : __tjs__t)(schema.minimum !== undefined))) {
      errors.push(`Number below minimum (${schema.minimum})`);
    }
    if (__tjs2.toBool(((__tjs__t) => __tjs2.toBool(__tjs__t) ? data > schema.maximum : __tjs__t)(schema.maximum !== undefined))) {
      errors.push(`Number above maximum (${schema.maximum})`);
    }
  }
  if (__tjs2.toBool(((__tjs__t) => __tjs2.toBool(__tjs__t) ? Array.isArray(data) : __tjs__t)(schema.type === "array"))) {
    if (__tjs2.toBool(((__tjs__t) => __tjs2.toBool(__tjs__t) ? data.length < schema.minItems : __tjs__t)(schema.minItems))) {
      errors.push(`Array too short (min ${schema.minItems} items)`);
    }
    if (__tjs2.toBool(((__tjs__t) => __tjs2.toBool(__tjs__t) ? data.length > schema.maxItems : __tjs__t)(schema.maxItems))) {
      errors.push(`Array too long (max ${schema.maxItems} items)`);
    }
    if (__tjs2.toBool(schema.items)) {
      data.forEach((item, i) => {
        const itemResult = validateSchema(schema.items, item);
        if (__tjs2.toBool(!__tjs2.toBool(itemResult.valid))) {
          errors.push(...itemResult.errors.map((e) => `[${i}]: ${e}`));
        }
      });
    }
  }
  if (__tjs2.toBool(((__tjs__t) => __tjs2.toBool(__tjs__t) ? !__tjs2.toBool(schema.enum.includes(data)) : __tjs__t)(schema.enum))) {
    errors.push(`Value must be one of: ${schema.enum.join(", ")}`);
  }
  return { valid: errors.length === 0, errors };
}
validateSchema.__tjs = {
  params: {
    schema: {
      type: {
        kind: "any"
      },
      required: false
    },
    data: {
      type: {
        kind: "any"
      },
      required: false
    }
  },
  unsafe: true,
  source: "schema.tjs:10"
};

// src/rbac.js
var __tjs_rt3 = (() => {
  const __ubxv = Symbol.for("xin-value");
  function __ub(v) {
    try {
      if (v !== null && (typeof v === "object" || typeof v === "function")) {
        const w = v[__ubxv];
        if (w !== undefined)
          return w;
      }
      if (v instanceof String)
        return String.prototype.valueOf.call(v);
      if (v instanceof Number)
        return Number.prototype.valueOf.call(v);
      if (v instanceof Boolean)
        return Boolean.prototype.valueOf.call(v);
    } catch {
      return v;
    }
    return v;
  }
  const __ac = Object.create(null);
  function __proj(v) {
    if (v === null || v === undefined || typeof v !== "object")
      return v;
    let k;
    try {
      k = v.constructor && v.constructor.name;
    } catch {
      return v;
    }
    let f = k && Object.prototype.hasOwnProperty.call(__ac, k) ? __ac[k] : null;
    if (typeof f !== "function") {
      try {
        f = v.asCompared;
      } catch {
        return v;
      }
    }
    if (typeof f !== "function")
      return v;
    let p;
    try {
      p = f.call(v);
    } catch {
      return v;
    }
    const t = typeof p;
    return p === null || p === undefined || t === "number" || t === "string" || t === "boolean" ? p : v;
  }
  function TypeOf(v) {
    return v === null ? "null" : typeof v;
  }
  function toBool(v) {
    return Boolean(__ub(__proj(v)));
  }
  return { __ubxv, __ub, __proj, __ac, TypeOf, toBool };
})();
var TypeOf3 = __tjs_rt3.TypeOf;
var toBool3 = __tjs_rt3.toBool;
var __tjs3 = (globalThis.__tjs?.abi >= 2 ? globalThis.__tjs.createRuntime?.() : undefined) ?? { TypeOf: __tjs_rt3.TypeOf, toBool: __tjs_rt3.toBool };
var __tjsToBool3 = __tjs3.toBool;
__tjs3.toBool = function(v) {
  return __tjsToBool3(__tjs_rt3.__proj(v));
};
function plainData(v, depth = 0) {
  if (__tjs3.toBool(((__tjs__t) => __tjs3.toBool(__tjs__t) ? __tjs__t : depth > 64)(((__tjs__t) => __tjs3.toBool(__tjs__t) ? __tjs__t : (__tjs3.toBool(typeof v === "undefined") ? "undefined" : __tjs_rt3.TypeOf(v)) !== "object")(v === null))))
    return v;
  if (__tjs3.toBool(Array.isArray(v)))
    return v.map((x) => plainData(x, depth + 1));
  if (__tjs3.toBool(v instanceof Date))
    return v;
  const proto = Object.getPrototypeOf(v);
  if (__tjs3.toBool(((__tjs__t) => __tjs3.toBool(__tjs__t) ? __tjs__t : proto === null)(proto === Object.prototype))) {
    const out = {};
    for (const k of Object.keys(v))
      out[k] = plainData(v[k], depth + 1);
    return out;
  }
  if (__tjs3.toBool(((__tjs__t) => __tjs3.toBool(__tjs__t) ? __tjs_rt3.TypeOf(v.seconds) === "number" : __tjs__t)(__tjs_rt3.TypeOf(v.toMillis) === "function")))
    return { seconds: v.seconds, nanoseconds: v.nanoseconds };
  if (__tjs3.toBool(((__tjs__t) => __tjs3.toBool(__tjs__t) ? __tjs_rt3.TypeOf(v.longitude) === "number" : __tjs__t)(__tjs_rt3.TypeOf(v.latitude) === "number")))
    return { latitude: v.latitude, longitude: v.longitude };
  if (__tjs3.toBool(((__tjs__t) => __tjs3.toBool(__tjs__t) ? __tjs_rt3.TypeOf(v.id) === "string" : __tjs__t)(__tjs_rt3.TypeOf(v.path) === "string")))
    return { id: v.id, path: v.path };
  return v;
}
plainData.__tjs = {
  params: {
    v: {
      type: {
        kind: "any"
      },
      required: false
    },
    depth: {
      type: {
        kind: "integer"
      },
      required: false,
      default: 0
    }
  },
  unsafe: true,
  source: "rbac.tjs:42"
};
var _db = null;
function db() {
  if (__tjs3.toBool(!__tjs3.toBool(_db)))
    _db = getFirestore();
  return _db;
}
db.__tjs = {
  params: {},
  unsafe: true,
  source: "rbac.tjs:63"
};
var securityRulesCache = {
  data: new Map,
  timestamp: 0,
  ttl: 60000
};
async function getSecurityRule(collection) {
  const now = Date.now();
  if (__tjs3.toBool(now - securityRulesCache.timestamp >= securityRulesCache.ttl)) {
    securityRulesCache.data.clear();
    securityRulesCache.timestamp = now;
  }
  if (__tjs3.toBool(securityRulesCache.data.has(collection))) {
    return securityRulesCache.data.get(collection);
  }
  const doc = await db().collection("securityRules").doc(collection).get();
  const rule = __tjs3.toBool(doc.exists) ? doc.data() : null;
  securityRulesCache.data.set(collection, rule);
  return rule;
}
getSecurityRule.__tjs = {
  params: {
    collection: {
      type: {
        kind: "any"
      },
      required: false
    }
  },
  unsafe: true,
  source: "rbac.tjs:75"
};
function evaluateAccessShortcut(accessRule, context) {
  if (__tjs3.toBool((__tjs3.toBool(typeof accessRule === "undefined") ? "undefined" : __tjs_rt3.TypeOf(accessRule)) !== "string"))
    return null;
  const { _uid, _roles, doc, newData } = context;
  switch (accessRule) {
    case "none":
      return { allowed: false, reason: "Access denied" };
    case "all":
      return { allowed: true };
    case "authenticated":
      return __tjs3.toBool(_uid) ? { allowed: true } : { allowed: false, reason: "Authentication required" };
    case "admin":
      return __tjs3.toBool(_roles?.includes("admin")) ? { allowed: true } : { allowed: false, reason: "Admin role required" };
    case "author":
      return __tjs3.toBool(_roles?.includes("author")) ? { allowed: true } : { allowed: false, reason: "Author role required" };
    default:
      if (__tjs3.toBool(accessRule.startsWith("owner:"))) {
        const field = accessRule.slice(6);
        const checkDoc = ((__tjs__t) => __tjs3.toBool(__tjs__t) ? __tjs__t : newData)(doc);
        if (__tjs3.toBool(!__tjs3.toBool(_uid))) {
          return { allowed: false, reason: "Authentication required" };
        }
        if (__tjs3.toBool(((__tjs__t) => __tjs3.toBool(__tjs__t) ? checkDoc[field] === _uid : __tjs__t)(checkDoc))) {
          return { allowed: true };
        }
        if (__tjs3.toBool(((__tjs__t) => __tjs3.toBool(__tjs__t) ? newData[field] === _uid : __tjs__t)(((__tjs__t) => __tjs3.toBool(__tjs__t) ? newData : __tjs__t)(!__tjs3.toBool(doc))))) {
          return { allowed: true };
        }
        return { allowed: false, reason: `Must be owner (${field})` };
      }
      if (__tjs3.toBool(accessRule.startsWith("role:"))) {
        const role = accessRule.slice(5);
        return __tjs3.toBool(_roles?.includes(role)) ? { allowed: true } : { allowed: false, reason: `Role '${role}' required` };
      }
      return null;
  }
}
evaluateAccessShortcut.__tjs = {
  params: {
    accessRule: {
      type: {
        kind: "any"
      },
      required: false
    },
    context: {
      type: {
        kind: "any"
      },
      required: false
    }
  },
  unsafe: true,
  source: "rbac.tjs:112"
};
async function evaluateSecurityRule(rule, context) {
  const startTime = performance.now();
  const { _method, newData } = context;
  try {
    let accessRule = rule.code;
    if (__tjs3.toBool(((__tjs__t) => __tjs3.toBool(__tjs__t) ? rule.read !== undefined : __tjs__t)(_method === "read"))) {
      accessRule = rule.read;
    } else if (__tjs3.toBool(_method === "write")) {
      if (__tjs3.toBool(((__tjs__t) => __tjs3.toBool(__tjs__t) ? rule.create !== undefined : __tjs__t)(!__tjs3.toBool(context.doc)))) {
        accessRule = rule.create;
      } else if (__tjs3.toBool(((__tjs__t) => __tjs3.toBool(__tjs__t) ? rule.update !== undefined : __tjs__t)(context.doc))) {
        accessRule = rule.update;
      } else if (__tjs3.toBool(rule.write !== undefined)) {
        accessRule = rule.write;
      }
    } else if (__tjs3.toBool(((__tjs__t) => __tjs3.toBool(__tjs__t) ? rule.delete !== undefined : __tjs__t)(_method === "delete"))) {
      accessRule = rule.delete;
    }
    if (__tjs3.toBool((__tjs3.toBool(typeof accessRule === "undefined") ? "undefined" : __tjs_rt3.TypeOf(accessRule)) === "string")) {
      const shortcutResult = evaluateAccessShortcut(accessRule, context);
      if (__tjs3.toBool(shortcutResult)) {
        const evalTimeMs = performance.now() - startTime;
        return { ...shortcutResult, evalTimeMs, fuelUsed: 0, type: "shortcut" };
      }
    }
    if (__tjs3.toBool(((__tjs__t) => __tjs3.toBool(__tjs__t) ? newData : __tjs__t)(((__tjs__t) => __tjs3.toBool(__tjs__t) ? rule.schema : __tjs__t)(_method === "write")))) {
      const schemaResult = validateSchema(rule.schema, newData);
      if (__tjs3.toBool(!__tjs3.toBool(schemaResult.valid))) {
        const evalTimeMs = performance.now() - startTime;
        return {
          allowed: false,
          reason: "Schema validation failed: " + schemaResult.errors.join("; "),
          evalTimeMs,
          fuelUsed: 0,
          type: "schema"
        };
      }
    }
    const codeToRun = __tjs3.toBool(((__tjs__t) => __tjs3.toBool(__tjs__t) ? accessRule?.code : __tjs__t)((__tjs3.toBool(typeof accessRule === "undefined") ? "undefined" : __tjs_rt3.TypeOf(accessRule)) === "object")) ? accessRule.code : rule.code;
    if (__tjs3.toBool(codeToRun)) {
      const fuel = ((__tjs__t) => __tjs3.toBool(__tjs__t) ? __tjs__t : 100)(((__tjs__t) => __tjs3.toBool(__tjs__t) ? __tjs__t : rule.fuel)(((__tjs__t) => __tjs3.toBool(__tjs__t) ? accessRule?.fuel : __tjs__t)((__tjs3.toBool(typeof accessRule === "undefined") ? "undefined" : __tjs_rt3.TypeOf(accessRule)) === "object")));
      const timeoutMs = ((__tjs__t) => __tjs3.toBool(__tjs__t) ? __tjs__t : 1000)(((__tjs__t) => __tjs3.toBool(__tjs__t) ? __tjs__t : rule.timeoutMs)(((__tjs__t) => __tjs3.toBool(__tjs__t) ? accessRule?.timeoutMs : __tjs__t)((__tjs3.toBool(typeof accessRule === "undefined") ? "undefined" : __tjs_rt3.TypeOf(accessRule)) === "object")));
      const result = await Eval({
        code: codeToRun,
        context: { ...context, doc: plainData(context.doc) },
        fuel,
        timeoutMs,
        capabilities: {}
      });
      const evalTimeMs = performance.now() - startTime;
      let allowed = false;
      let reason = null;
      if (__tjs3.toBool(__tjs_rt3.TypeOf(result.result) === "boolean")) {
        allowed = result.result;
      } else if (__tjs3.toBool(((__tjs__t) => __tjs3.toBool(__tjs__t) ? result.result !== null : __tjs__t)(__tjs_rt3.TypeOf(result.result) === "object"))) {
        allowed = !__tjs3.toBool(!__tjs3.toBool(result.result.allow));
        reason = result.result.reason;
      }
      return { allowed, reason, evalTimeMs, fuelUsed: result.fuelUsed, type: "code" };
    }
    if (__tjs3.toBool(((__tjs__t) => __tjs3.toBool(__tjs__t) ? !__tjs3.toBool(rule.code) : __tjs__t)(rule.schema))) {
      const evalTimeMs = performance.now() - startTime;
      return { allowed: true, evalTimeMs, fuelUsed: 0, type: "schema-only" };
    }
    const evalTimeMs = performance.now() - startTime;
    return { allowed: false, reason: "No access rule defined", evalTimeMs, fuelUsed: 0, type: "default" };
  } catch (err) {
    const evalTimeMs = performance.now() - startTime;
    console.error("Security rule evaluation error:", err.message);
    return { allowed: false, reason: "Rule evaluation failed: " + err.message, evalTimeMs, error: true, type: "error" };
  }
}
evaluateSecurityRule.__tjs = {
  params: {
    rule: {
      type: {
        kind: "any"
      },
      required: false
    },
    context: {
      type: {
        kind: "any"
      },
      required: false
    }
  },
  unsafe: true,
  source: "rbac.tjs:179"
};
async function loadUserRoles(uid) {
  if (__tjs3.toBool(!__tjs3.toBool(uid)))
    return [];
  try {
    const userDoc = await db().collection("users").doc(uid).get();
    if (__tjs3.toBool(!__tjs3.toBool(userDoc.exists)))
      return [];
    const userData = userDoc.data();
    return ((__tjs__t) => __tjs3.toBool(__tjs__t) ? __tjs__t : [])(userData?.roles);
  } catch (err) {
    console.error("Failed to load user roles:", err.message);
    return [];
  }
}
loadUserRoles.__tjs = {
  params: {
    uid: {
      type: {
        kind: "any"
      },
      required: false
    }
  },
  unsafe: true,
  source: "rbac.tjs:283"
};

// src/indexes.js
import { getFirestore as getFirestore2 } from "firebase-admin/firestore";
var __tjs_rt4 = (() => {
  const __ubxv = Symbol.for("xin-value");
  function __ub(v) {
    try {
      if (v !== null && (typeof v === "object" || typeof v === "function")) {
        const w = v[__ubxv];
        if (w !== undefined)
          return w;
      }
      if (v instanceof String)
        return String.prototype.valueOf.call(v);
      if (v instanceof Number)
        return Number.prototype.valueOf.call(v);
      if (v instanceof Boolean)
        return Boolean.prototype.valueOf.call(v);
    } catch {
      return v;
    }
    return v;
  }
  const __ac = Object.create(null);
  function __proj(v) {
    if (v === null || v === undefined || typeof v !== "object")
      return v;
    let k;
    try {
      k = v.constructor && v.constructor.name;
    } catch {
      return v;
    }
    let f = k && Object.prototype.hasOwnProperty.call(__ac, k) ? __ac[k] : null;
    if (typeof f !== "function") {
      try {
        f = v.asCompared;
      } catch {
        return v;
      }
    }
    if (typeof f !== "function")
      return v;
    let p;
    try {
      p = f.call(v);
    } catch {
      return v;
    }
    const t = typeof p;
    return p === null || p === undefined || t === "number" || t === "string" || t === "boolean" ? p : v;
  }
  function toBool(v) {
    return Boolean(__ub(__proj(v)));
  }
  return { __ubxv, __ub, __proj, __ac, toBool };
})();
var toBool4 = __tjs_rt4.toBool;
var __tjs4 = (globalThis.__tjs?.abi >= 2 ? globalThis.__tjs.createRuntime?.() : undefined) ?? { toBool: __tjs_rt4.toBool };
var __tjsToBool4 = __tjs4.toBool;
__tjs4.toBool = function(v) {
  return __tjsToBool4(__tjs_rt4.__proj(v));
};
var _db2 = null;
function db2() {
  if (__tjs4.toBool(!__tjs4.toBool(_db2)))
    _db2 = getFirestore2();
  return _db2;
}
db2.__tjs = {
  params: {},
  unsafe: true,
  source: "indexes.tjs:37"
};
function matchesFilter(doc, filter) {
  if (__tjs4.toBool(!__tjs4.toBool(filter)))
    return true;
  for (const [key, value] of Object.entries(filter)) {
    if (__tjs4.toBool(doc[key] !== value))
      return false;
  }
  return true;
}
matchesFilter.__tjs = {
  params: {
    doc: {
      type: {
        kind: "any"
      },
      required: false
    },
    filter: {
      type: {
        kind: "any"
      },
      required: false
    }
  },
  unsafe: true,
  source: "indexes.tjs:43"
};
function extractFields(doc, fields, docId) {
  const entry = { _id: docId, _updated: Date.now() };
  if (__tjs4.toBool(((__tjs__t) => __tjs4.toBool(__tjs__t) ? __tjs__t : fields.length === 0)(!__tjs4.toBool(fields)))) {
    return { ...doc, ...entry };
  }
  for (const field of fields) {
    if (__tjs4.toBool(field in doc)) {
      entry[field] = doc[field];
    }
  }
  return entry;
}
extractFields.__tjs = {
  params: {
    doc: {
      type: {
        kind: "any"
      },
      required: false
    },
    fields: {
      type: {
        kind: "any"
      },
      required: false
    },
    docId: {
      type: {
        kind: "any"
      },
      required: false
    }
  },
  unsafe: true,
  source: "indexes.tjs:52"
};
function getIndexPath(collection, indexName, partitionKey = null) {
  const base = `${collection}_indexes`;
  if (__tjs4.toBool(partitionKey)) {
    return `${base}/${indexName}_${partitionKey}`;
  }
  return `${base}/${indexName}`;
}
getIndexPath.__tjs = {
  params: {
    collection: {
      type: {
        kind: "any"
      },
      required: false
    },
    indexName: {
      type: {
        kind: "any"
      },
      required: false
    },
    partitionKey: {
      type: {
        kind: "any"
      },
      required: false,
      default: null
    }
  },
  unsafe: true,
  source: "indexes.tjs:66"
};
async function updateIndexes(collection, docId, oldDoc, newDoc, indexes) {
  const startTime = performance.now();
  let updated = 0;
  for (const index of indexes) {
    const { name, filter, fields, partitionBy, partitionByArray } = index;
    const oldMatches = __tjs4.toBool(oldDoc) ? matchesFilter(oldDoc, filter) : false;
    const newMatches = matchesFilter(newDoc, filter);
    if (__tjs4.toBool(partitionByArray)) {
      const oldPartitions = __tjs4.toBool(((__tjs__t) => __tjs4.toBool(__tjs__t) ? oldMatches : __tjs__t)(oldDoc)) ? ((__tjs__t) => __tjs4.toBool(__tjs__t) ? __tjs__t : [])(oldDoc[partitionByArray]) : [];
      const newPartitions = __tjs4.toBool(newMatches) ? ((__tjs__t) => __tjs4.toBool(__tjs__t) ? __tjs__t : [])(newDoc[partitionByArray]) : [];
      for (const partition of oldPartitions) {
        if (__tjs4.toBool(!__tjs4.toBool(newPartitions.includes(partition)))) {
          const indexPath = getIndexPath(collection, name, partition);
          await db2().collection(indexPath).doc(docId).delete();
          updated++;
        }
      }
      for (const partition of newPartitions) {
        const indexPath = getIndexPath(collection, name, partition);
        const entry = extractFields(newDoc, fields, docId);
        await db2().collection(indexPath).doc(docId).set(entry);
        updated++;
      }
    } else if (__tjs4.toBool(partitionBy)) {
      const oldPartition = __tjs4.toBool(((__tjs__t) => __tjs4.toBool(__tjs__t) ? oldMatches : __tjs__t)(oldDoc)) ? oldDoc[partitionBy] : null;
      const newPartition = __tjs4.toBool(newMatches) ? newDoc[partitionBy] : null;
      if (__tjs4.toBool(((__tjs__t) => __tjs4.toBool(__tjs__t) ? oldPartition !== newPartition : __tjs__t)(oldPartition))) {
        const indexPath = getIndexPath(collection, name, oldPartition);
        await db2().collection(indexPath).doc(docId).delete();
        updated++;
      }
      if (__tjs4.toBool(newPartition)) {
        const indexPath = getIndexPath(collection, name, newPartition);
        const entry = extractFields(newDoc, fields, docId);
        await db2().collection(indexPath).doc(docId).set(entry);
        updated++;
      }
    } else {
      const indexPath = getIndexPath(collection, name);
      if (__tjs4.toBool(((__tjs__t) => __tjs4.toBool(__tjs__t) ? !__tjs4.toBool(newMatches) : __tjs__t)(oldMatches))) {
        await db2().collection(indexPath).doc(docId).delete();
        updated++;
      } else if (__tjs4.toBool(newMatches)) {
        const entry = extractFields(newDoc, fields, docId);
        await db2().collection(indexPath).doc(docId).set(entry);
        updated++;
      }
    }
  }
  const elapsed = performance.now() - startTime;
  if (__tjs4.toBool(updated > 0)) {
    console.log(`INDEX [${collection}] Updated ${updated} index entries in ${elapsed.toFixed(2)}ms`);
  }
}
updateIndexes.__tjs = {
  params: {
    collection: {
      type: {
        kind: "any"
      },
      required: false
    },
    docId: {
      type: {
        kind: "any"
      },
      required: false
    },
    oldDoc: {
      type: {
        kind: "any"
      },
      required: false
    },
    newDoc: {
      type: {
        kind: "any"
      },
      required: false
    },
    indexes: {
      type: {
        kind: "any"
      },
      required: false
    }
  },
  unsafe: true,
  source: "indexes.tjs:75"
};
async function removeFromIndexes(collection, docId, doc, indexes) {
  const startTime = performance.now();
  let removed = 0;
  for (const index of indexes) {
    const { name, filter, partitionBy, partitionByArray } = index;
    if (__tjs4.toBool(!__tjs4.toBool(matchesFilter(doc, filter))))
      continue;
    if (__tjs4.toBool(partitionByArray)) {
      const partitions = ((__tjs__t) => __tjs4.toBool(__tjs__t) ? __tjs__t : [])(doc[partitionByArray]);
      for (const partition of partitions) {
        const indexPath = getIndexPath(collection, name, partition);
        await db2().collection(indexPath).doc(docId).delete();
        removed++;
      }
    } else if (__tjs4.toBool(partitionBy)) {
      const partition = doc[partitionBy];
      if (__tjs4.toBool(partition)) {
        const indexPath = getIndexPath(collection, name, partition);
        await db2().collection(indexPath).doc(docId).delete();
        removed++;
      }
    } else {
      const indexPath = getIndexPath(collection, name);
      await db2().collection(indexPath).doc(docId).delete();
      removed++;
    }
  }
  const elapsed = performance.now() - startTime;
  if (__tjs4.toBool(removed > 0)) {
    console.log(`INDEX [${collection}] Removed ${removed} index entries in ${elapsed.toFixed(2)}ms`);
  }
}
removeFromIndexes.__tjs = {
  params: {
    collection: {
      type: {
        kind: "any"
      },
      required: false
    },
    docId: {
      type: {
        kind: "any"
      },
      required: false
    },
    doc: {
      type: {
        kind: "any"
      },
      required: false
    },
    indexes: {
      type: {
        kind: "any"
      },
      required: false
    }
  },
  unsafe: true,
  source: "indexes.tjs:149"
};

// src/store.js
var __tjs_rt5 = (() => {
  const __ubxv = Symbol.for("xin-value");
  function __ub(v) {
    try {
      if (v !== null && (typeof v === "object" || typeof v === "function")) {
        const w = v[__ubxv];
        if (w !== undefined)
          return w;
      }
      if (v instanceof String)
        return String.prototype.valueOf.call(v);
      if (v instanceof Number)
        return Number.prototype.valueOf.call(v);
      if (v instanceof Boolean)
        return Boolean.prototype.valueOf.call(v);
    } catch {
      return v;
    }
    return v;
  }
  const __ac = Object.create(null);
  function __proj(v) {
    if (v === null || v === undefined || typeof v !== "object")
      return v;
    let k;
    try {
      k = v.constructor && v.constructor.name;
    } catch {
      return v;
    }
    let f = k && Object.prototype.hasOwnProperty.call(__ac, k) ? __ac[k] : null;
    if (typeof f !== "function") {
      try {
        f = v.asCompared;
      } catch {
        return v;
      }
    }
    if (typeof f !== "function")
      return v;
    let p;
    try {
      p = f.call(v);
    } catch {
      return v;
    }
    const t = typeof p;
    return p === null || p === undefined || t === "number" || t === "string" || t === "boolean" ? p : v;
  }
  function toBool(v) {
    return Boolean(__ub(__proj(v)));
  }
  return { __ubxv, __ub, __proj, __ac, toBool };
})();
var toBool5 = __tjs_rt5.toBool;
var __tjs5 = (globalThis.__tjs?.abi >= 2 ? globalThis.__tjs.createRuntime?.() : undefined) ?? { toBool: __tjs_rt5.toBool };
var __tjsToBool5 = __tjs5.toBool;
__tjs5.toBool = function(v) {
  return __tjsToBool5(__tjs_rt5.__proj(v));
};
var _db3 = null;
function db3() {
  if (__tjs5.toBool(!__tjs5.toBool(_db3)))
    _db3 = getFirestore3();
  return _db3;
}
db3.__tjs = {
  params: {},
  unsafe: true,
  source: "store.tjs:17"
};
function createStoreCapability(uid) {
  let cachedRoles = null;
  async function getRoles() {
    if (__tjs5.toBool(cachedRoles === null)) {
      cachedRoles = await loadUserRoles(uid);
    }
    return cachedRoles;
  }
  return {
    async get(collection, docId) {
      const rule = await getSecurityRule(collection);
      if (__tjs5.toBool(!__tjs5.toBool(rule))) {
        return { error: `No security rule for collection: ${collection}` };
      }
      const docRef = db3().collection(collection).doc(docId);
      const docSnap = await docRef.get();
      const doc = __tjs5.toBool(docSnap.exists) ? docSnap.data() : null;
      const roles = await getRoles();
      const ruleResult = await evaluateSecurityRule(rule, {
        _uid: uid,
        _roles: roles,
        _isAdmin: roles.includes("admin"),
        _isAuthor: roles.includes("author"),
        _method: "read",
        _collection: collection,
        _docId: docId,
        doc
      });
      console.log(`RBAC [${collection}:read] ${ruleResult.evalTimeMs.toFixed(2)}ms, type: ${ruleResult.type}, fuel: ${ruleResult.fuelUsed}, allowed: ${ruleResult.allowed}`);
      if (__tjs5.toBool(!__tjs5.toBool(ruleResult.allowed))) {
        return { error: "Permission denied", reason: ruleResult.reason };
      }
      return doc;
    },
    async set(collection, docId, data) {
      const rule = await getSecurityRule(collection);
      if (__tjs5.toBool(!__tjs5.toBool(rule))) {
        return { error: `No security rule for collection: ${collection}` };
      }
      const docRef = db3().collection(collection).doc(docId);
      const docSnap = await docRef.get();
      const doc = __tjs5.toBool(docSnap.exists) ? docSnap.data() : null;
      const roles = await getRoles();
      const ruleResult = await evaluateSecurityRule(rule, {
        _uid: uid,
        _roles: roles,
        _isAdmin: roles.includes("admin"),
        _isAuthor: roles.includes("author"),
        _method: "write",
        _collection: collection,
        _docId: docId,
        doc,
        newData: data
      });
      console.log(`RBAC [${collection}:write] ${ruleResult.evalTimeMs.toFixed(2)}ms, type: ${ruleResult.type}, fuel: ${ruleResult.fuelUsed}, allowed: ${ruleResult.allowed}`);
      if (__tjs5.toBool(!__tjs5.toBool(ruleResult.allowed))) {
        return { error: "Permission denied", reason: ruleResult.reason };
      }
      await docRef.set(data, { merge: true });
      if (__tjs5.toBool(rule.indexes)) {
        await updateIndexes(collection, docId, doc, data, rule.indexes);
      }
      return { success: true };
    },
    async delete(collection, docId) {
      const rule = await getSecurityRule(collection);
      if (__tjs5.toBool(!__tjs5.toBool(rule))) {
        return { error: `No security rule for collection: ${collection}` };
      }
      const docRef = db3().collection(collection).doc(docId);
      const docSnap = await docRef.get();
      const doc = __tjs5.toBool(docSnap.exists) ? docSnap.data() : null;
      if (__tjs5.toBool(!__tjs5.toBool(doc))) {
        return { error: "Document not found" };
      }
      const roles = await getRoles();
      const ruleResult = await evaluateSecurityRule(rule, {
        _uid: uid,
        _roles: roles,
        _isAdmin: roles.includes("admin"),
        _isAuthor: roles.includes("author"),
        _method: "delete",
        _collection: collection,
        _docId: docId,
        doc
      });
      console.log(`RBAC [${collection}:delete] ${ruleResult.evalTimeMs.toFixed(2)}ms, type: ${ruleResult.type}, fuel: ${ruleResult.fuelUsed}, allowed: ${ruleResult.allowed}`);
      if (__tjs5.toBool(!__tjs5.toBool(ruleResult.allowed))) {
        return { error: "Permission denied", reason: ruleResult.reason };
      }
      if (__tjs5.toBool(rule.indexes)) {
        await removeFromIndexes(collection, docId, doc, rule.indexes);
      }
      await docRef.delete();
      return { success: true };
    },
    async query(collection, constraints = {}) {
      const rule = await getSecurityRule(collection);
      if (__tjs5.toBool(!__tjs5.toBool(rule))) {
        return { error: `No security rule for collection: ${collection}` };
      }
      const roles = await getRoles();
      const ruleResult = await evaluateSecurityRule(rule, {
        _uid: uid,
        _roles: roles,
        _isAdmin: roles.includes("admin"),
        _isAuthor: roles.includes("author"),
        _method: "read",
        _collection: collection,
        _docId: null,
        doc: null,
        _isQuery: true,
        _constraints: constraints
      });
      console.log(`RBAC [${collection}:query] ${ruleResult.evalTimeMs.toFixed(2)}ms, type: ${ruleResult.type}, fuel: ${ruleResult.fuelUsed}, allowed: ${ruleResult.allowed}`);
      if (__tjs5.toBool(!__tjs5.toBool(ruleResult.allowed))) {
        return { error: "Permission denied", reason: ruleResult.reason };
      }
      let query = db3().collection(collection);
      if (__tjs5.toBool(constraints.where)) {
        for (const [field, op, value] of constraints.where) {
          query = query.where(field, op, value);
        }
      }
      if (__tjs5.toBool(constraints.orderBy)) {
        query = query.orderBy(constraints.orderBy, ((__tjs__t) => __tjs5.toBool(__tjs__t) ? __tjs__t : "asc")(constraints.orderDirection));
      }
      if (__tjs5.toBool(constraints.limit)) {
        query = query.limit(constraints.limit);
      }
      const snapshot = await query.get();
      const docs = [];
      snapshot.forEach((doc) => {
        docs.push({ id: doc.id, ...doc.data() });
      });
      return docs;
    }
  };
}
createStoreCapability.__tjs = {
  params: {
    uid: {
      type: {
        kind: "any"
      },
      required: false
    }
  },
  unsafe: true,
  source: "store.tjs:22"
};

// src/routing.js
import { getFirestore as getFirestore4 } from "firebase-admin/firestore";
var __tjs_rt6 = (() => {
  const __ubxv = Symbol.for("xin-value");
  function __ub(v) {
    try {
      if (v !== null && (typeof v === "object" || typeof v === "function")) {
        const w = v[__ubxv];
        if (w !== undefined)
          return w;
      }
      if (v instanceof String)
        return String.prototype.valueOf.call(v);
      if (v instanceof Number)
        return Number.prototype.valueOf.call(v);
      if (v instanceof Boolean)
        return Boolean.prototype.valueOf.call(v);
    } catch {
      return v;
    }
    return v;
  }
  const __ac = Object.create(null);
  function __proj(v) {
    if (v === null || v === undefined || typeof v !== "object")
      return v;
    let k;
    try {
      k = v.constructor && v.constructor.name;
    } catch {
      return v;
    }
    let f = k && Object.prototype.hasOwnProperty.call(__ac, k) ? __ac[k] : null;
    if (typeof f !== "function") {
      try {
        f = v.asCompared;
      } catch {
        return v;
      }
    }
    if (typeof f !== "function")
      return v;
    let p;
    try {
      p = f.call(v);
    } catch {
      return v;
    }
    const t = typeof p;
    return p === null || p === undefined || t === "number" || t === "string" || t === "boolean" ? p : v;
  }
  function toBool(v) {
    return Boolean(__ub(__proj(v)));
  }
  return { __ubxv, __ub, __proj, __ac, toBool };
})();
var toBool6 = __tjs_rt6.toBool;
var __tjs6 = (globalThis.__tjs?.abi >= 2 ? globalThis.__tjs.createRuntime?.() : undefined) ?? { toBool: __tjs_rt6.toBool };
var __tjsToBool6 = __tjs6.toBool;
__tjs6.toBool = function(v) {
  return __tjsToBool6(__tjs_rt6.__proj(v));
};
var _db4 = null;
function db4() {
  if (__tjs6.toBool(!__tjs6.toBool(_db4)))
    _db4 = getFirestore4();
  return _db4;
}
db4.__tjs = {
  params: {},
  unsafe: true,
  source: "routing.tjs:13"
};
function matchUrlPattern(pattern, path) {
  const normalizedPattern = ((__tjs__t) => __tjs6.toBool(__tjs__t) ? __tjs__t : "/")(pattern.replace(/\/+$/, ""));
  const normalizedPath = ((__tjs__t) => __tjs6.toBool(__tjs__t) ? __tjs__t : "/")(path.replace(/\/+$/, ""));
  const patternParts = normalizedPattern.split("/");
  const pathParts = normalizedPath.split("/");
  if (__tjs6.toBool(patternParts.length !== pathParts.length)) {
    return null;
  }
  const params = {};
  for (let i = 0;__tjs6.toBool(i < patternParts.length); i++) {
    const patternPart = patternParts[i];
    const pathPart = pathParts[i];
    if (__tjs6.toBool(patternPart.startsWith(":"))) {
      const paramName = patternPart.slice(1);
      params[paramName] = decodeURIComponent(pathPart);
    } else if (__tjs6.toBool(patternPart !== pathPart)) {
      return null;
    }
  }
  return params;
}
matchUrlPattern.__tjs = {
  params: {
    pattern: {
      type: {
        kind: "any"
      },
      required: false
    },
    path: {
      type: {
        kind: "any"
      },
      required: false
    }
  },
  unsafe: true,
  source: "routing.tjs:24"
};
var storedFunctionsCache = {
  data: null,
  timestamp: 0,
  ttl: 60000
};
async function getStoredFunctions() {
  const now = Date.now();
  if (__tjs6.toBool(((__tjs__t) => __tjs6.toBool(__tjs__t) ? now - storedFunctionsCache.timestamp < storedFunctionsCache.ttl : __tjs__t)(storedFunctionsCache.data))) {
    return storedFunctionsCache.data;
  }
  const snapshot = await db4().collection("storedFunctions").get();
  const functions = [];
  snapshot.forEach((doc) => {
    functions.push({ id: doc.id, ...doc.data() });
  });
  storedFunctionsCache.data = functions;
  storedFunctionsCache.timestamp = now;
  return functions;
}
getStoredFunctions.__tjs = {
  params: {},
  unsafe: true,
  source: "routing.tjs:67"
};

// src/demo-llm.js
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore as getFirestore5, FieldValue } from "firebase-admin/firestore";
var __tjs_rt7 = (() => {
  const __ubxv = Symbol.for("xin-value");
  function __ub(v) {
    try {
      if (v !== null && (typeof v === "object" || typeof v === "function")) {
        const w = v[__ubxv];
        if (w !== undefined)
          return w;
      }
      if (v instanceof String)
        return String.prototype.valueOf.call(v);
      if (v instanceof Number)
        return Number.prototype.valueOf.call(v);
      if (v instanceof Boolean)
        return Boolean.prototype.valueOf.call(v);
    } catch {
      return v;
    }
    return v;
  }
  const __ac = Object.create(null);
  function __proj(v) {
    if (v === null || v === undefined || typeof v !== "object")
      return v;
    let k;
    try {
      k = v.constructor && v.constructor.name;
    } catch {
      return v;
    }
    let f = k && Object.prototype.hasOwnProperty.call(__ac, k) ? __ac[k] : null;
    if (typeof f !== "function") {
      try {
        f = v.asCompared;
      } catch {
        return v;
      }
    }
    if (typeof f !== "function")
      return v;
    let p;
    try {
      p = f.call(v);
    } catch {
      return v;
    }
    const t = typeof p;
    return p === null || p === undefined || t === "number" || t === "string" || t === "boolean" ? p : v;
  }
  function LegacyDate(...a) {
    return new Date(...a);
  }
  function TypeOf(v) {
    return v === null ? "null" : typeof v;
  }
  function toBool(v) {
    return Boolean(__ub(__proj(v)));
  }
  return { __ubxv, __ub, __proj, __ac, LegacyDate, TypeOf, toBool };
})();
var LegacyDate = __tjs_rt7.LegacyDate;
var TypeOf4 = __tjs_rt7.TypeOf;
var toBool7 = __tjs_rt7.toBool;
var __tjs7 = (globalThis.__tjs?.abi >= 2 ? globalThis.__tjs.createRuntime?.() : undefined) ?? { TypeOf: __tjs_rt7.TypeOf, toBool: __tjs_rt7.toBool };
var __tjsToBool7 = __tjs7.toBool;
__tjs7.toBool = function(v) {
  return __tjsToBool7(__tjs_rt7.__proj(v));
};
var GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
var MODEL = "gemini-2.5-flash-lite";
var DAILY_PER_USER = 100;
var DAILY_GLOBAL = 5000;
var MAX_PROMPT_CHARS = 8000;
function utcDay(now) {
  return LegacyDate(now).toISOString().slice(0, 10);
}
utcDay.__tjs = {
  params: {
    now: {
      type: {
        kind: "any"
      },
      required: false
    }
  },
  unsafe: true,
  source: "demo-llm.tjs:83"
};
async function claimQuota(db, uid, now, limits = {}) {
  const perUser = ((__tjs__t) => __tjs7.toBool(__tjs__t) ? __tjs__t : DAILY_PER_USER)(limits.perUser);
  const global = ((__tjs__t) => __tjs7.toBool(__tjs__t) ? __tjs__t : DAILY_GLOBAL)(limits.global);
  const day = utcDay(now);
  const userRef = db.collection("users").doc(uid).collection("usage").doc(`demo-${day}`);
  const globalRef = db.collection("demoUsage").doc(day);
  return db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const globalSnap = await tx.get(globalRef);
    const used = ((__tjs__t) => __tjs7.toBool(__tjs__t) ? __tjs__t : 0)(((__tjs__t) => __tjs7.toBool(__tjs__t) ? userSnap.data().count : __tjs__t)(userSnap.exists));
    const globalUsed = ((__tjs__t) => __tjs7.toBool(__tjs__t) ? __tjs__t : 0)(((__tjs__t) => __tjs7.toBool(__tjs__t) ? globalSnap.data().count : __tjs__t)(globalSnap.exists));
    if (__tjs7.toBool(used >= perUser)) {
      return { ok: false, reason: "per-user", used, remaining: 0 };
    }
    if (__tjs7.toBool(globalUsed >= global)) {
      return { ok: false, reason: "global", used, remaining: perUser - used };
    }
    tx.set(userRef, { count: FieldValue.increment(1), day, updated: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(globalRef, { count: FieldValue.increment(1) }, { merge: true });
    return { ok: true, used: used + 1, remaining: perUser - used - 1 };
  });
}
claimQuota.__tjs = {
  params: {
    db: {
      type: {
        kind: "any"
      },
      required: false
    },
    uid: {
      type: {
        kind: "any"
      },
      required: false
    },
    now: {
      type: {
        kind: "any"
      },
      required: false
    },
    limits: {
      type: {
        kind: "object",
        shape: {}
      },
      required: false,
      default: {}
    }
  },
  unsafe: true,
  source: "demo-llm.tjs:96"
};
var demoPredict = onCall({ secrets: [GEMINI_API_KEY], cors: true }, async (request) => {
  if (__tjs7.toBool(!__tjs7.toBool(request.auth))) {
    throw new HttpsError("unauthenticated", "Sign in to use the demo model. This keeps usage attributable and the cap enforceable.");
  }
  const uid = request.auth.uid;
  const prompt = ((__tjs__t) => __tjs7.toBool(__tjs__t) ? request.data.prompt : __tjs__t)(request.data);
  if (__tjs7.toBool(((__tjs__t) => __tjs7.toBool(__tjs__t) ? __tjs__t : (__tjs7.toBool(typeof prompt === "undefined") ? "undefined" : __tjs_rt7.TypeOf(prompt)) !== "string")(!__tjs7.toBool(prompt)))) {
    throw new HttpsError("invalid-argument", "prompt must be a non-empty string");
  }
  if (__tjs7.toBool(prompt.length > MAX_PROMPT_CHARS)) {
    throw new HttpsError("invalid-argument", `prompt is ${prompt.length} characters; the demo model accepts up to ${MAX_PROMPT_CHARS}`);
  }
  const db = getFirestore5();
  const quota = await claimQuota(db, uid, Date.now());
  if (__tjs7.toBool(!__tjs7.toBool(quota.ok))) {
    throw new HttpsError("resource-exhausted", __tjs7.toBool(quota.reason === "per-user") ? `Daily limit reached (${DAILY_PER_USER} calls). It resets at 00:00 UTC. Add your own API key in settings to keep going.` : "The demo model has hit its daily limit across all users. Try again tomorrow, or add your own API key in settings.");
  }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY.value()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 1024 }
    })
  });
  if (__tjs7.toBool(!__tjs7.toBool(res.ok))) {
    const detail = await res.text().catch(() => "");
    console.error("demoPredict upstream error", res.status, detail.slice(0, 500));
    throw new HttpsError("internal", `The demo model returned ${res.status}. ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = ((__tjs__t) => __tjs7.toBool(__tjs__t) ? __tjs__t : "")(((__tjs__t) => __tjs7.toBool(__tjs__t) ? data.candidates[0].content.parts[0].text : __tjs__t)(((__tjs__t) => __tjs7.toBool(__tjs__t) ? data.candidates[0].content.parts[0] : __tjs__t)(((__tjs__t) => __tjs7.toBool(__tjs__t) ? data.candidates[0].content.parts : __tjs__t)(((__tjs__t) => __tjs7.toBool(__tjs__t) ? data.candidates[0].content : __tjs__t)(((__tjs__t) => __tjs7.toBool(__tjs__t) ? data.candidates[0] : __tjs__t)(data.candidates))))));
  return { text, remaining: quota.remaining, model: MODEL };
});

// src/index.js
var __tjs_rt8 = (() => {
  const __ubxv = Symbol.for("xin-value");
  function __ub(v) {
    try {
      if (v !== null && (typeof v === "object" || typeof v === "function")) {
        const w = v[__ubxv];
        if (w !== undefined)
          return w;
      }
      if (v instanceof String)
        return String.prototype.valueOf.call(v);
      if (v instanceof Number)
        return Number.prototype.valueOf.call(v);
      if (v instanceof Boolean)
        return Boolean.prototype.valueOf.call(v);
    } catch {
      return v;
    }
    return v;
  }
  const __ac = Object.create(null);
  function __proj(v) {
    if (v === null || v === undefined || typeof v !== "object")
      return v;
    let k;
    try {
      k = v.constructor && v.constructor.name;
    } catch {
      return v;
    }
    let f = k && Object.prototype.hasOwnProperty.call(__ac, k) ? __ac[k] : null;
    if (typeof f !== "function") {
      try {
        f = v.asCompared;
      } catch {
        return v;
      }
    }
    if (typeof f !== "function")
      return v;
    let p;
    try {
      p = f.call(v);
    } catch {
      return v;
    }
    const t = typeof p;
    return p === null || p === undefined || t === "number" || t === "string" || t === "boolean" ? p : v;
  }
  function TypeOf(v) {
    return v === null ? "null" : typeof v;
  }
  function toBool(v) {
    return Boolean(__ub(__proj(v)));
  }
  return { __ubxv, __ub, __proj, __ac, TypeOf, toBool };
})();
var TypeOf5 = __tjs_rt8.TypeOf;
var toBool8 = __tjs_rt8.toBool;
var __tjs8 = (globalThis.__tjs?.abi >= 2 ? globalThis.__tjs.createRuntime?.() : undefined) ?? { TypeOf: __tjs_rt8.TypeOf, toBool: __tjs_rt8.toBool };
var __tjsToBool8 = __tjs8.toBool;
__tjs8.toBool = function(v) {
  return __tjsToBool8(__tjs_rt8.__proj(v));
};
initializeApp();
var db5 = getFirestore6();
async function getUserApiKeys(uid) {
  const userDoc = await db5.collection("users").doc(uid).get();
  if (__tjs8.toBool(!__tjs8.toBool(userDoc.exists))) {
    return {};
  }
  const userData = userDoc.data();
  const { encryptionKey, apiKeys } = userData;
  if (__tjs8.toBool(((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : !__tjs8.toBool(apiKeys))(!__tjs8.toBool(encryptionKey)))) {
    return {};
  }
  const decrypted = {};
  for (const [provider, encryptedKey] of Object.entries(apiKeys)) {
    if (__tjs8.toBool(encryptedKey)) {
      try {
        decrypted[provider] = await decrypt(encryptedKey, encryptionKey);
      } catch (e) {
        console.error(`Failed to decrypt ${provider} key:`, e.message);
      }
    }
  }
  return decrypted;
}
getUserApiKeys.__tjs = {
  params: {
    uid: {
      type: {
        kind: "any"
      },
      required: false
    }
  },
  unsafe: true,
  source: "index.tjs:51"
};
var health = onRequest((req, res) => {
  res.json({
    status: "ok",
    timestamp: Date.now(),
    version: "0.4.0",
    tjsLang: TJS_LANG_VERSION
  });
});
function hashPayload(payload) {
  const str = JSON.stringify(payload);
  let hash = 0;
  for (let i = 0;__tjs8.toBool(i < str.length); i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}
hashPayload.__tjs = {
  params: {
    payload: {
      type: {
        kind: "any"
      },
      required: false
    }
  },
  description: `## Agent Run Endpoint

Universal AJS endpoint - accepts code, args, and fuel limit.
Executes the code in a sandboxed VM with user's API keys as capabilities.`,
  unsafe: true,
  source: "index.tjs:107"
};
var agentRun2 = onCall2(async (request) => {
  if (__tjs8.toBool(!__tjs8.toBool(request.auth))) {
    throw new HttpsError2("unauthenticated", "Must be authenticated to run agents");
  }
  const uid = request.auth.uid;
  const { code, args = {}, fuel = 1000 } = request.data;
  if (__tjs8.toBool(((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : (__tjs8.toBool(typeof code === "undefined") ? "undefined" : __tjs_rt8.TypeOf(code)) !== "string")(!__tjs8.toBool(code)))) {
    throw new HttpsError2("invalid-argument", "code must be a non-empty string");
  }
  if (__tjs8.toBool(((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : fuel > 1e4)(((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : fuel <= 0)(((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : !__tjs8.toBool(Number.isFinite(fuel)))((__tjs8.toBool(typeof fuel === "undefined") ? "undefined" : __tjs_rt8.TypeOf(fuel)) !== "number"))))) {
    throw new HttpsError2("invalid-argument", "fuel must be a number from 1 to 10000");
  }
  const startTime = Date.now();
  let result = null;
  let error = null;
  try {
    const apiKeys = await getUserApiKeys(uid);
    const llm = createLlmCapability(apiKeys);
    const store = createStoreCapability(uid);
    result = await Eval({
      maxSourceBytes: 8 * 1024,
      code,
      context: args,
      fuel,
      timeoutMs: 30000,
      capabilities: { llm, store }
    });
  } catch (err) {
    console.error("Agent execution error:", err);
    error = { message: ((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : "Execution failed")(err.message) };
  }
  const fuelUsed = ((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : 0)(result?.fuelUsed);
  const duration = Date.now() - startTime;
  const usageLog = {
    timestamp: Date.now(),
    duration,
    payloadHash: hashPayload({ code, args }),
    fuelRequested: fuel,
    fuelUsed,
    hasError: !__tjs8.toBool(!__tjs8.toBool(((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : result?.error)(error))),
    resultHash: __tjs8.toBool(result?.result) ? hashPayload(result.result) : null
  };
  const usageRef = db5.collection("users").doc(uid).collection("usage");
  usageRef.add(usageLog).catch((err) => console.error("Failed to log usage:", err));
  usageRef.doc("total").set({
    totalCalls: FieldValue2.increment(1),
    totalFuelUsed: FieldValue2.increment(fuelUsed),
    totalDuration: FieldValue2.increment(duration),
    totalErrors: FieldValue2.increment(__tjs8.toBool(((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : result?.error)(error)) ? 1 : 0),
    lastUpdated: Date.now()
  }, { merge: true }).catch((err) => console.error("Failed to update totals:", err));
  if (__tjs8.toBool(error)) {
    return { result: null, fuelUsed: 0, error };
  }
  return {
    result: result.result,
    fuelUsed: ((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : 0)(result.fuelUsed),
    error: ((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : null)(result.error)
  };
});
var run = onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  if (__tjs8.toBool(req.method === "OPTIONS")) {
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.set("Access-Control-Max-Age", "3600");
    return res.status(204).send("");
  }
  if (__tjs8.toBool(req.method !== "POST")) {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const authHeader = req.headers.authorization;
  if (__tjs8.toBool(!__tjs8.toBool(authHeader?.startsWith("Bearer ")))) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }
  const idToken = authHeader.slice(7);
  let uid;
  try {
    const { getAuth } = await import("firebase-admin/auth");
    const decoded = await getAuth().verifyIdToken(idToken);
    uid = decoded.uid;
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
  const { code, args = {}, fuel = 1000 } = req.body;
  if (__tjs8.toBool(((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : (__tjs8.toBool(typeof code === "undefined") ? "undefined" : __tjs_rt8.TypeOf(code)) !== "string")(!__tjs8.toBool(code)))) {
    return res.status(400).json({ error: "code must be a non-empty string" });
  }
  if (__tjs8.toBool(((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : fuel > 1e4)(((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : fuel <= 0)(((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : !__tjs8.toBool(Number.isFinite(fuel)))((__tjs8.toBool(typeof fuel === "undefined") ? "undefined" : __tjs_rt8.TypeOf(fuel)) !== "number"))))) {
    return res.status(400).json({ error: "fuel must be a number from 1 to 10000" });
  }
  const startTime = Date.now();
  let result = null;
  let error = null;
  try {
    const apiKeys = await getUserApiKeys(uid);
    const llm = createLlmCapability(apiKeys);
    const store = createStoreCapability(uid);
    result = await Eval({
      maxSourceBytes: 8192,
      code,
      context: args,
      fuel,
      timeoutMs: 30000,
      capabilities: { llm, store }
    });
  } catch (err) {
    console.error("Agent execution error:", err);
    error = { message: ((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : "Execution failed")(err.message) };
  }
  const fuelUsed = ((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : 0)(result?.fuelUsed);
  const duration = Date.now() - startTime;
  const usageLog = {
    timestamp: Date.now(),
    duration,
    payloadHash: hashPayload({ code, args }),
    fuelRequested: fuel,
    fuelUsed,
    hasError: !__tjs8.toBool(!__tjs8.toBool(((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : result?.error)(error))),
    resultHash: __tjs8.toBool(result?.result) ? hashPayload(result.result) : null
  };
  const usageRef = db5.collection("users").doc(uid).collection("usage");
  usageRef.add(usageLog).catch((err) => console.error("Failed to log usage:", err));
  usageRef.doc("total").set({
    totalCalls: FieldValue2.increment(1),
    totalFuelUsed: FieldValue2.increment(fuelUsed),
    totalDuration: FieldValue2.increment(duration),
    totalErrors: FieldValue2.increment(__tjs8.toBool(((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : result?.error)(error)) ? 1 : 0),
    lastUpdated: Date.now()
  }, { merge: true }).catch((err) => console.error("Failed to update totals:", err));
  if (__tjs8.toBool(error)) {
    return res.status(200).json({ result: null, fuelUsed: 0, error });
  }
  res.json({
    result: result.result,
    fuelUsed: ((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : 0)(result.fuelUsed),
    error: ((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : null)(result.error)
  });
});
var page = onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  if (__tjs8.toBool(req.method === "OPTIONS")) {
    res.set("Access-Control-Allow-Methods", "GET, POST");
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.set("Access-Control-Max-Age", "3600");
    return res.status(204).send("");
  }
  const path = ((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : "/")(req.path);
  try {
    const storedFunctions = await getStoredFunctions();
    let matchedFunction = null;
    let params = null;
    for (const fn of storedFunctions) {
      if (__tjs8.toBool(((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : !__tjs8.toBool(fn.code))(!__tjs8.toBool(fn.urlPattern))))
        continue;
      const match = matchUrlPattern(fn.urlPattern, path);
      if (__tjs8.toBool(match !== null)) {
        matchedFunction = fn;
        params = match;
        break;
      }
    }
    if (__tjs8.toBool(!__tjs8.toBool(matchedFunction))) {
      return res.status(404).json({ error: "Not found", path });
    }
    let uid = null;
    if (__tjs8.toBool(!__tjs8.toBool(matchedFunction.public))) {
      const authHeader = req.headers.authorization;
      if (__tjs8.toBool(!__tjs8.toBool(authHeader?.startsWith("Bearer ")))) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const idToken = authHeader.slice(7);
      try {
        const { getAuth } = await import("firebase-admin/auth");
        const decoded = await getAuth().verifyIdToken(idToken);
        uid = decoded.uid;
      } catch (err) {
        return res.status(401).json({ error: "Invalid token" });
      }
    }
    const args = {
      ...params,
      ...req.query,
      ...((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : {})(req.body),
      _path: path,
      _method: req.method,
      _uid: uid
    };
    let result = null;
    let error = null;
    try {
      let llm = null;
      if (__tjs8.toBool(uid)) {
        const apiKeys = await getUserApiKeys(uid);
        llm = createLlmCapability(apiKeys);
      }
      result = await Eval({
        code: matchedFunction.code,
        context: args,
        fuel: ((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : 1000)(matchedFunction.fuel),
        timeoutMs: ((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : 1e4)(matchedFunction.timeoutMs),
        capabilities: __tjs8.toBool(llm) ? { llm } : {}
      });
    } catch (err) {
      console.error("Stored function execution error:", err);
      error = { message: ((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : "Execution failed")(err.message) };
    }
    if (__tjs8.toBool(((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : result?.error)(error))) {
      const errorMessage = ((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : "Unknown error")(((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : result?.error?.message)(error?.message));
      return res.status(500).json({ error: errorMessage });
    }
    const contentType = ((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : "application/json")(matchedFunction.contentType);
    res.set("Content-Type", contentType);
    if (__tjs8.toBool(((__tjs__t) => __tjs8.toBool(__tjs__t) ? __tjs__t : contentType.includes("html"))(contentType.includes("text/")))) {
      return res.send(result.result);
    } else {
      return res.json(result.result);
    }
  } catch (err) {
    console.error("Page endpoint error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});
export {
  agentRun2 as agentRun,
  demoPredict,
  health,
  page,
  run
};
