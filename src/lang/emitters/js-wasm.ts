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
    return { code: '', results }
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
  const exportData = compiled.exports
    .map(
      (e) =>
        `{id:${JSON.stringify(e.id)},n:${JSON.stringify(
          e.exportName
        )},c:${JSON.stringify(e.captures)},m:${e.needsMemory}}`
    )
    .join(',')

  const moduleBase64 = btoa(String.fromCharCode(...compiled.bytes))
  const anyNeedsMemory = compiled.needsMemory

  const code = `${watComments}
;(async()=>{
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
const __wasmInst=await WebAssembly.instantiate(await WebAssembly.compile(__b64ToBytes(__wasmModuleB64)),${
    anyNeedsMemory ? '{env:{memory:__wasmMem}}' : '{}'
  });
for(const{id,n,c,m}of __wasmExports){
  const compute=__wasmInst.exports[n];
  const params=c.map(__parseType);
  const hasArrays=params.some(p=>p.a);
  if(!hasArrays){globalThis[id]=compute;continue}
  globalThis[id]=function(...args){
    const mv=new Uint8Array(__wasmMem.buffer);let off=__woff;const ptrs=[];
    for(let i=0;i<params.length;i++){const p=params[i],a=args[i];
      if(p.a&&a?.buffer){
        if(a.buffer===__wasmMem.buffer){ptrs.push(a.byteOffset)}
        else{const ab=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);off=(off+15)&~15;mv.set(ab,off);ptrs.push(off);off+=ab.length}
      } else ptrs.push(a)}
    const r=compute(...ptrs);off=__woff;
    for(let i=0;i<params.length;i++){const p=params[i],a=args[i];
      if(p.a&&a?.buffer){
        if(a.buffer===__wasmMem.buffer) continue;
        const ab=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);off=(off+15)&~15;ab.set(mv.slice(off,off+ab.length));off+=ab.length}}
    return r};
}})();
`.trim()

  // Strip the temporary _exportName field before returning to caller.
  const publicResults = results.map(({ _exportName: _, ...rest }) => rest)

  return { code, results: publicResults }
}
