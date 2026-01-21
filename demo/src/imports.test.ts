/**
 * Unit tests for import resolution infrastructure
 *
 * Tests the synchronous functions that don't require browser/network.
 */

import { describe, it, expect } from 'bun:test'
import {
  extractImports,
  getCDNUrl,
  generateImportMap,
  generateImportMapScript,
  wrapAsModule,
  clearModuleCache,
  getCacheStats,
} from './imports'

describe('extractImports', () => {
  it('should extract named imports', () => {
    const source = `import { foo, bar } from 'some-package'`
    expect(extractImports(source)).toEqual(['some-package'])
  })

  it('should extract default imports', () => {
    const source = `import React from 'react'`
    expect(extractImports(source)).toEqual(['react'])
  })

  it('should extract namespace imports', () => {
    const source = `import * as lodash from 'lodash'`
    expect(extractImports(source)).toEqual(['lodash'])
  })

  it('should extract side-effect imports', () => {
    const source = `import 'polyfill'`
    expect(extractImports(source)).toEqual(['polyfill'])
  })

  it('should extract re-exports', () => {
    const source = `export { foo } from 'some-package'`
    expect(extractImports(source)).toEqual(['some-package'])
  })

  it('should handle multiple imports', () => {
    const source = `
      import { add } from 'lodash'
      import { format } from 'date-fns'
      import React from 'react'
    `
    expect(extractImports(source)).toEqual(['lodash', 'date-fns', 'react'])
  })

  it('should deduplicate imports', () => {
    const source = `
      import { add } from 'lodash'
      import { subtract } from 'lodash'
    `
    expect(extractImports(source)).toEqual(['lodash'])
  })

  it('should ignore relative imports', () => {
    const source = `
      import { foo } from './local'
      import { bar } from '../parent'
      import { baz } from '/absolute'
      import { qux } from 'npm-package'
    `
    expect(extractImports(source)).toEqual(['npm-package'])
  })

  it('should handle subpath imports', () => {
    const source = `import { debounce } from 'lodash/debounce'`
    expect(extractImports(source)).toEqual(['lodash/debounce'])
  })

  it('should handle scoped packages', () => {
    const source = `import { something } from '@scope/package'`
    expect(extractImports(source)).toEqual(['@scope/package'])
  })

  it('should handle scoped packages with subpaths', () => {
    const source = `import { util } from '@scope/package/utils'`
    expect(extractImports(source)).toEqual(['@scope/package/utils'])
  })

  it('should handle double quotes', () => {
    const source = `import { foo } from "some-package"`
    expect(extractImports(source)).toEqual(['some-package'])
  })

  it('should return empty array for no imports', () => {
    const source = `const x = 1; function foo() { return x }`
    expect(extractImports(source)).toEqual([])
  })
})

describe('getCDNUrl', () => {
  it('should generate URL for simple package', () => {
    expect(getCDNUrl('some-unknown-package')).toBe(
      'https://esm.sh/some-unknown-package'
    )
  })

  it('should use pinned version for known packages', () => {
    expect(getCDNUrl('lodash')).toBe('https://esm.sh/lodash@4.17.21')
    expect(getCDNUrl('react')).toBe('https://esm.sh/react@18.2.0')
    expect(getCDNUrl('date-fns')).toBe('https://esm.sh/date-fns@3.0.0')
  })

  it('should handle subpath imports', () => {
    expect(getCDNUrl('lodash/debounce')).toBe(
      'https://esm.sh/lodash@4.17.21/debounce'
    )
  })

  it('should handle scoped packages', () => {
    expect(getCDNUrl('@scope/package')).toBe('https://esm.sh/@scope/package')
  })

  it('should handle scoped packages with subpaths', () => {
    expect(getCDNUrl('@scope/package/utils')).toBe(
      'https://esm.sh/@scope/package/utils'
    )
  })

  it('should handle scoped packages with pinned versions', () => {
    // lodash-es is pinned
    expect(getCDNUrl('lodash-es')).toBe('https://esm.sh/lodash-es@4.17.21')
  })
})

describe('generateImportMap', () => {
  it('should generate import map for specifiers', () => {
    const result = generateImportMap(['lodash', 'react'])
    expect(result).toEqual({
      imports: {
        lodash: 'https://esm.sh/lodash@4.17.21',
        react: 'https://esm.sh/react@18.2.0',
      },
    })
  })

  it('should handle empty array', () => {
    expect(generateImportMap([])).toEqual({ imports: {} })
  })

  it('should handle subpath imports', () => {
    const result = generateImportMap(['lodash/debounce'])
    expect(result.imports['lodash/debounce']).toBe(
      'https://esm.sh/lodash@4.17.21/debounce'
    )
  })
})

describe('generateImportMapScript', () => {
  it('should generate script tag with import map', () => {
    const importMap = { imports: { lodash: 'https://esm.sh/lodash@4.17.21' } }
    const script = generateImportMapScript(importMap)

    expect(script).toContain('<script type="importmap">')
    expect(script).toContain('</script>')
    expect(script).toContain('"lodash"')
    expect(script).toContain('https://esm.sh/lodash@4.17.21')
  })
})

describe('wrapAsModule', () => {
  it('should wrap code in module script tag', () => {
    const code = 'console.log("hello")'
    const wrapped = wrapAsModule(code)

    expect(wrapped).toContain('<script type="module">')
    expect(wrapped).toContain('</script>')
    expect(wrapped).toContain(code)
  })
})

describe('module cache', () => {
  it('should start empty', () => {
    clearModuleCache()
    const stats = getCacheStats()
    expect(stats.size).toBe(0)
    expect(stats.entries).toEqual([])
  })

  it('should clear cache', () => {
    // Just verify it doesn't throw
    clearModuleCache()
    expect(getCacheStats().size).toBe(0)
  })
})
