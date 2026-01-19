/**
 * Tests for playground import resolver
 */

import { describe, it, expect } from 'bun:test'
import {
  extractImports,
  getCDNUrl,
  generateImportMap,
  clearModuleCache,
} from './src/imports'

describe('extractImports', () => {
  it('should extract simple imports', () => {
    const source = `
      import { debounce } from 'lodash'
      import * as R from 'ramda'
    `
    const imports = extractImports(source)
    expect(imports).toContain('lodash')
    expect(imports).toContain('ramda')
  })

  it('should extract default imports', () => {
    const source = `import lodash from 'lodash'`
    const imports = extractImports(source)
    expect(imports).toContain('lodash')
  })

  it('should extract side-effect imports', () => {
    const source = `import 'normalize.css'`
    const imports = extractImports(source)
    expect(imports).toContain('normalize.css')
  })

  it('should extract scoped packages', () => {
    const source = `
      import { useState } from '@preact/hooks'
      import Schema from '@effect/schema'
    `
    const imports = extractImports(source)
    expect(imports).toContain('@preact/hooks')
    expect(imports).toContain('@effect/schema')
  })

  it('should extract subpath imports', () => {
    const source = `
      import debounce from 'lodash/debounce'
      import { format } from 'date-fns/format'
    `
    const imports = extractImports(source)
    expect(imports).toContain('lodash/debounce')
    expect(imports).toContain('date-fns/format')
  })

  it('should ignore relative imports', () => {
    const source = `
      import { foo } from './foo'
      import { bar } from '../bar'
      import lodash from 'lodash'
    `
    const imports = extractImports(source)
    expect(imports).not.toContain('./foo')
    expect(imports).not.toContain('../bar')
    expect(imports).toContain('lodash')
  })

  it('should ignore absolute imports', () => {
    const source = `
      import { foo } from '/absolute/path'
      import lodash from 'lodash'
    `
    const imports = extractImports(source)
    expect(imports).not.toContain('/absolute/path')
    expect(imports).toContain('lodash')
  })

  it('should dedupe imports', () => {
    const source = `
      import { a } from 'lodash'
      import { b } from 'lodash'
      import { c } from 'lodash'
    `
    const imports = extractImports(source)
    expect(imports.filter((i) => i === 'lodash')).toHaveLength(1)
  })

  it('should extract re-exports', () => {
    const source = `export { foo } from 'some-package'`
    const imports = extractImports(source)
    expect(imports).toContain('some-package')
  })
})

describe('getCDNUrl', () => {
  it('should generate esm.sh URL for simple package', () => {
    const url = getCDNUrl('ramda')
    expect(url).toBe('https://esm.sh/ramda')
  })

  it('should use pinned version for known packages', () => {
    const url = getCDNUrl('lodash')
    expect(url).toContain('lodash@')
    expect(url).toContain('4.17.21')
  })

  it('should handle subpaths', () => {
    const url = getCDNUrl('lodash/debounce')
    expect(url).toContain('/debounce')
  })

  it('should handle scoped packages', () => {
    const url = getCDNUrl('@preact/hooks')
    expect(url).toBe('https://esm.sh/@preact/hooks')
  })

  it('should handle scoped packages with subpaths', () => {
    const url = getCDNUrl('@scope/pkg/utils')
    expect(url).toBe('https://esm.sh/@scope/pkg/utils')
  })
})

describe('generateImportMap', () => {
  it('should generate valid import map', () => {
    const map = generateImportMap(['lodash', 'ramda'])
    expect(map.imports).toBeDefined()
    expect(map.imports['lodash']).toContain('esm.sh')
    expect(map.imports['ramda']).toContain('esm.sh')
  })

  it('should handle empty array', () => {
    const map = generateImportMap([])
    expect(map.imports).toEqual({})
  })
})

describe('cache', () => {
  it('should clear cache', () => {
    clearModuleCache()
    // Just verify it doesn't throw
    expect(true).toBe(true)
  })
})
