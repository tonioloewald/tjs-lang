/**
 * TJS WASM Bootstrap Generation
 *
 * Compiles the file's WASM blocks into a single WebAssembly.Module with
 * one exported function per block, then emits JavaScript that compiles
 * and instantiates the module once at startup. This is the foundation
 * for cross-file wasm composition (see wasm-library-plan.md, Phase 3) —
 * once everything's in one module, intra-module calls cost nothing.
 */

import { compileBlocksToModule } from '../wasm'
import type { WasmBlock } from '../parser'

export function generateWasmBootstrap(blocks: WasmBlock[]): {
  code: string
  results: {
    id: string
    success: boolean
    error?: string
    byteLength?: number
  }[]
  /** Compile-time lints (e.g. i32/i32 integer-division) across all blocks. */
  warnings: string[]
} {
  const compiled = compileBlocksToModule(blocks)

  // Map per-block status to the public result shape (preserves input order)
  const exportById = new Map(compiled.exports.map((e) => [e.id, e]))
  const results = compiled.results.map((r) => {
    if (!r.success) {
      return { id: r.id, success: false, error: r.error }
    }
    const exp = exportById.get(r.id)!
    return {
      id: r.id,
      success: true,
      byteLength: compiled.bytes.length,
      // Per-export byte length isn't meaningful in the consolidated module;
      // we report the total module size for every successful block.
      _exportName: exp.exportName,
    }
  })

  if (compiled.exports.length === 0) {
    return { code: '', results, warnings: compiled.warnings }
  }

  // WAT comment block — one section per included function
  const watComments = compiled.exports
    .map((e) => {
      const watLines = e.wat.split('\n').map((line) => ` * ${line}`)
      return `/**\n * WASM: ${e.id} (export: ${e.exportName})\n${watLines.join(
        '\n'
      )}\n */`
    })
    .join('\n')

  // Per-export metadata embedded in the bootstrap.
  //   id   = original block id (becomes globalThis[id])
  //   n    = export name in the composed module (instance.exports[n])
  //   c    = capture annotations for type-aware wrapping
  //   m    = whether this export uses memory (must be true if any other
  //          export uses it, since memory is shared at module level)
  //
  // Blocks that FAILED to compile are excluded. They remain in the module as
  // stubs (function indices must stay stable for other blocks' `call <i>`), but
  // binding one to `globalThis[id]` would be actively wrong: the emitted call
  // site guards the wasm path on `globalThis.__tjs_wasm_…` being a function, so
  // a bound stub makes a block that never compiled look available — and the call
  // site then invokes it with the block's captured variables, which in a failed
  // block can include names that don't exist in that scope. That was masked for
  // as long as instantiation was async (nothing was bound during the window when
  // most tests call the function); making instantiation synchronous exposed it.
  const exportData = compiled.exports
    .filter((e) => !e.failed)
    .map(
      (e) =>
        `{id:${JSON.stringify(e.id)},n:${JSON.stringify(
          e.exportName
        )},c:${JSON.stringify(e.captures)},m:${e.needsMemory}}`
    )
    .join(',')

  const moduleBase64 = btoa(String.fromCharCode(...compiled.bytes))
  const anyNeedsMemory = compiled.needsMemory

  const imports = anyNeedsMemory ? '{env:{memory:__wasmMem}}' : '{}'

  // Instantiate SYNCHRONOUSLY where the platform allows it.
  //
  // This bootstrap used to be a fire-and-forget `async` IIFE, so `globalThis[id]`
  // was only bound after the first `await`. An inline `wasm{} fallback{}` block
  // degrades gracefully in that window (it runs the JS fallback), but a
  // `wasm function` declaration HAS no fallback — it calls `globalThis.__tjs_wasm_x`
  // directly. So `import { dot } from 'tjs-lang/linalg'; dot(a,b,n)` threw
  // "__tjs_wasm_dot is not a function": the call raced instantiation and there was
  // nothing to fall back to. A shipped entry point you cannot simply import and
  // call is broken, and `await __tjs_wasm_ready()` is not an acceptable tax on
  // every caller of a library function.
  //
  // `new WebAssembly.Module()` is synchronous everywhere EXCEPT a browser main
  // thread with a module over 4KB, which throws by spec. So: try sync, and keep
  // the async path as the fallback for exactly that case. `__tjs_wasm_ready()`
  // still resolves in both, so it remains the correct thing to await in a browser.
  const code = `${watComments}
;(globalThis.__tjs_wasm_pending??=[]);
globalThis.__tjs_wasm_ready??=(()=>Promise.all(globalThis.__tjs_wasm_pending));
;(()=>{
const __rec=e=>{try{globalThis.__tjs?.record?.(e)}catch{}};
const __wasmExports=[${exportData}];
const __wasmModuleB64=${JSON.stringify(moduleBase64)};
const __b64ToBytes=s=>{const b=atob(s),a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a};
const __parseType=c=>{const m=c.match(/^(\\w+)\\s*:\\s*(\\w+)$/);if(!m)return{n:c,t:'f64',a:false};const[,n,ts]=m;const at={Float32Array:'f32',Float64Array:'f64',Int32Array:'i32',Uint8Array:'i32'};if(at[ts])return{n,t:'i32',a:true,at:ts};return{n,t:'f64',a:false}};
${
  anyNeedsMemory
    ? `const __wasmMem=new WebAssembly.Memory({initial:1024});
let __woff=0;
globalThis.wasmBuffer=function(Ctor,len){const bytes=len*Ctor.BYTES_PER_ELEMENT;const align=Math.max(Ctor.BYTES_PER_ELEMENT,16);__woff=(__woff+align-1)&~(align-1);const arr=new Ctor(__wasmMem.buffer,__woff,len);__woff+=bytes;return arr};`
    : ''
}
const __bind=__wasmInst=>{
for(const{id,n,c,m}of __wasmExports){
  const compute=__wasmInst.exports[n];
  const params=c.map(__parseType);
  const hasArrays=params.some(p=>p.a);
  if(!hasArrays){globalThis[id]=compute;continue}
  let __copied=false;
  globalThis[id]=function(...args){
    const mv=new Uint8Array(__wasmMem.buffer);let off=__woff;const ptrs=[];
    for(let i=0;i<params.length;i++){const p=params[i],a=args[i];
      if(p.a&&a?.buffer){
        if(a.buffer===__wasmMem.buffer){ptrs.push(a.byteOffset)}
        else{if(!__copied){__copied=true;__rec({source:'wasm',severity:'notice',message:"'"+id+"' was passed a typed array outside wasm memory — copying in and out on every call. This can be SLOWER than plain JS. Allocate it with wasmBuffer() to pass it zero-copy.",data:{fn:id,param:p.n,bytes:a.byteLength}})}const ab=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);off=(off+15)&~15;mv.set(ab,off);ptrs.push(off);off+=ab.length}
      } else ptrs.push(a)}
    const r=compute(...ptrs);off=__woff;
    for(let i=0;i<params.length;i++){const p=params[i],a=args[i];
      if(p.a&&a?.buffer){
        if(a.buffer===__wasmMem.buffer) continue;
        const ab=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);off=(off+15)&~15;ab.set(mv.slice(off,off+ab.length));off+=ab.length}}
    return r};
}};
const __fail=e=>{try{globalThis.__tjs?.record?.({source:'wasm',severity:'warning',message:'wasm module failed to instantiate — every wasm{} block in this file is running its JS fallback: '+((e&&e.message)||e),data:{error:String(e)}})}catch{}};
try{
  __bind(new WebAssembly.Instance(new WebAssembly.Module(__b64ToBytes(__wasmModuleB64)),${imports}));
  globalThis.__tjs_wasm_pending.push(Promise.resolve());
}catch(__syncErr){
  globalThis.__tjs_wasm_pending.push(WebAssembly.instantiate(__b64ToBytes(__wasmModuleB64),${imports}).then(r=>__bind(r.instance)).catch(__fail));
}
})();
`.trim()

  // Strip the temporary _exportName field before returning to caller.
  const publicResults = results.map(({ _exportName: _, ...rest }) => rest)

  return { code, results: publicResults, warnings: compiled.warnings }
}
