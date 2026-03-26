/**
 * Unit tests for TFS import resolution
 */

import { describe, it, expect } from 'bun:test'
import { extractImports, generateImportMap } from './imports'

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

  it('should handle versioned imports', () => {
    const source = `import { tosi } from 'tosijs@1.3.11'`
    expect(extractImports(source)).toEqual(['tosijs@1.3.11'])
  })

  it('should return empty array for no imports', () => {
    const source = `const x = 1; function foo() { return x }`
    expect(extractImports(source)).toEqual([])
  })
})

describe('generateImportMap', () => {
  it('should map bare specifiers to /tfs/ URLs', () => {
    const result = generateImportMap(['tosijs', 'date-fns'])
    expect(result).toEqual({
      imports: {
        tosijs: '/tfs/tosijs',
        'date-fns': '/tfs/date-fns',
      },
    })
  })

  it('should handle versioned specifiers', () => {
    const result = generateImportMap(['tosijs@1.3.11'])
    expect(result).toEqual({
      imports: {
        'tosijs@1.3.11': '/tfs/tosijs@1.3.11',
      },
    })
  })

  it('should handle empty array', () => {
    expect(generateImportMap([])).toEqual({ imports: {} })
  })

  it('should handle subpath imports', () => {
    const result = generateImportMap(['lodash-es/debounce'])
    expect(result.imports['lodash-es/debounce']).toBe('/tfs/lodash-es/debounce')
  })

  it('should handle scoped packages', () => {
    const result = generateImportMap(['@scope/pkg@1.0.0'])
    expect(result.imports['@scope/pkg@1.0.0']).toBe('/tfs/@scope/pkg@1.0.0')
  })
})
