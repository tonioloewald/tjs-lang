import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'
import { generateDTS } from '/Users/tonioloewald/tjs-lang/src/lang/emitters/dts'
import { createRuntime } from '/Users/tonioloewald/tjs-lang/src/lang/runtime'
const src = `export const id = (x: 0) => x
export function idFn(x: 0) { return x }
`
const r = tjs(src, { runTests: false })
console.log('--- DTS ---')
console.log(generateDTS(r as any, src))
;(globalThis as any).__tjs = createRuntime()
const mod: any = new Function(
  r.code.replace(/export /g, '') + '\nreturn {id, idFn}'
)()
console.log('id()      =>', JSON.stringify(mod.id()))
console.log('idFn()    =>', String(mod.idFn()))
console.log("id('str') =>", String(mod.id('str')))
