/**
 * TJS WASM Bootstrap Generation
 *
 * Compiles inline WASM blocks and generates JavaScript bootstrap code.
 */

import { compileToWasm } from '../wasm'
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
  const results: {
    id: string
    success: boolean
    error?: string
    byteLength?: number
  }[] = []
  const compiledBlocks: {
    id: string
    base64: string
    captures: string[]
    needsMemory: boolean
    wat: string
  }[] = []

  for (const block of blocks) {
    const result = compileToWasm(block)
    if (result.success) {
      // Convert bytes to base64 for embedding
      const base64 = btoa(String.fromCharCode(...result.bytes))
      compiledBlocks.push({
        id: block.id,
        base64,
        captures: block.captures,
        needsMemory: result.needsMemory ?? false,
        wat: result.wat ?? '',
      })
      results.push({
        id: block.id,
        success: true,
        byteLength: result.bytes.length,
      })
    } else {
      results.push({
        id: block.id,
        success: false,
        error: result.error,
      })
    }
  }

  if (compiledBlocks.length === 0) {
    return { code: '', results }
  }

  // Generate WAT comments for each block
  const watComments = compiledBlocks
    .map((b) => {
      const watLines = b.wat.split('\n').map((line) => ` * ${line}`)
      return `/**\n * WASM: ${b.id}\n${watLines.join('\n')}\n */`
    })
    .join('\n')

  // Generate self-contained bootstrap code
  // This runs immediately and sets up globalThis.__tjs_wasm_N functions
  const blockData = compiledBlocks
    .map(
      (b) =>
        `{id:${JSON.stringify(b.id)},b64:${JSON.stringify(
          b.base64
        )},c:${JSON.stringify(b.captures)},m:${b.needsMemory}}`
    )
    .join(',')

  // Check if any block needs memory (shared across all blocks)
  const anyNeedsMemory = compiledBlocks.some((b) => b.needsMemory)

  const code = `${watComments}
;(async()=>{
const __wasmBlocks=[${blockData}];
const __b64ToBytes=s=>{const b=atob(s),a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a};
const __parseType=c=>{const m=c.match(/^(\\w+)\\s*:\\s*(\\w+)$/);if(!m)return{n:c,t:'f64',a:false};const[,n,ts]=m;const at={Float32Array:'f32',Float64Array:'f64',Int32Array:'i32',Uint8Array:'i32'};if(at[ts])return{n,t:'i32',a:true,at:ts};return{n,t:'f64',a:false}};
${
  anyNeedsMemory
    ? `const __wasmMem=new WebAssembly.Memory({initial:1024});
let __woff=0;
globalThis.wasmBuffer=function(Ctor,len){const bytes=len*Ctor.BYTES_PER_ELEMENT;const align=Math.max(Ctor.BYTES_PER_ELEMENT,16);__woff=(__woff+align-1)&~(align-1);const arr=new Ctor(__wasmMem.buffer,__woff,len);__woff+=bytes;return arr};`
    : ''
}
for(const{id,b64,c,m}of __wasmBlocks){
  const bytes=__b64ToBytes(b64);
  const params=c.map(__parseType);
  const hasArrays=params.some(p=>p.a);
  const mem=m?__wasmMem:null;
  const imp=mem?{env:{memory:mem}}:{};
  const inst=await WebAssembly.instantiate(await WebAssembly.compile(bytes),imp);
  const compute=inst.exports.compute;
  if(!hasArrays){globalThis[id]=compute;continue}
  globalThis[id]=function(...args){
    const mv=new Uint8Array(mem.buffer);let off=__woff;const ptrs=[];
    for(let i=0;i<params.length;i++){const p=params[i],a=args[i];
      if(p.a&&a?.buffer){
        if(a.buffer===mem.buffer){ptrs.push(a.byteOffset)}
        else{const ab=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);off=(off+15)&~15;mv.set(ab,off);ptrs.push(off);off+=ab.length}
      } else ptrs.push(a)}
    const r=compute(...ptrs);off=__woff;
    for(let i=0;i<params.length;i++){const p=params[i],a=args[i];
      if(p.a&&a?.buffer){
        if(a.buffer===mem.buffer) continue;
        const ab=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);off=(off+15)&~15;ab.set(mv.slice(off,off+ab.length));off+=ab.length}}
    return r};
}})();
`.trim()

  return { code, results }
}
