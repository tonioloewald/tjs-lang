/**
 * Unit tests for TFS import resolution
 */

import { describe, it, expect } from 'bun:test'
import { extractImports, rewriteImports } from './imports'

describe('extractImports', () => {
  it('should extract named imports', () => {
    expect(extractImports(`import { foo } from 'pkg'`)).toEqual(['pkg'])
  })

  it('should extract default imports', () => {
    expect(extractImports(`import React from 'react'`)).toEqual(['react'])
  })

  it('should ignore relative imports', () => {
    expect(
      extractImports(`import { a } from './local'\nimport { b } from 'pkg'`)
    ).toEqual(['pkg'])
  })

  it('should handle versioned specifiers', () => {
    expect(extractImports(`import { x } from 'tosijs@1.3.11'`)).toEqual([
      'tosijs@1.3.11',
    ])
  })

  it('should deduplicate', () => {
    expect(
      extractImports(`import { a } from 'pkg'\nimport { b } from 'pkg'`)
    ).toEqual(['pkg'])
  })
})

describe('rewriteImports', () => {
  const CDN = 'https://cdn.jsdelivr.net/npm'

  it('should rewrite bare specifiers to JSDelivr /+esm URLs', () => {
    expect(rewriteImports(`import { foo } from 'tosijs'`)).toBe(
      `import { foo } from '${CDN}/tosijs@latest/+esm'`
    )
  })

  it('should preserve versioned specifiers', () => {
    expect(rewriteImports(`import { x } from 'tosijs@1.3.11'`)).toBe(
      `import { x } from '${CDN}/tosijs@1.3.11/+esm'`
    )
  })

  it('should handle subpath imports', () => {
    expect(
      rewriteImports(`import { debounce } from 'lodash-es/debounce'`)
    ).toBe(`import { debounce } from '${CDN}/lodash-es@latest/debounce/+esm'`)
  })

  it('should handle react-dom/client (the React Todo case)', () => {
    expect(rewriteImports(`import { createRoot } from 'react-dom/client'`)).toBe(
      `import { createRoot } from '${CDN}/react-dom@latest/client/+esm'`
    )
  })

  it('should handle scoped packages', () => {
    expect(rewriteImports(`import { x } from '@scope/pkg'`)).toBe(
      `import { x } from '${CDN}/@scope/pkg@latest/+esm'`
    )
  })

  it('should handle scoped packages with version and subpath', () => {
    expect(rewriteImports(`import { x } from '@scope/pkg@1.0.0/sub'`)).toBe(
      `import { x } from '${CDN}/@scope/pkg@1.0.0/sub/+esm'`
    )
  })

  it('should not rewrite relative imports', () => {
    expect(rewriteImports(`import { x } from './local'`)).toBe(
      `import { x } from './local'`
    )
  })

  it('should not rewrite absolute imports', () => {
    expect(rewriteImports(`import { x } from '/abs/path'`)).toBe(
      `import { x } from '/abs/path'`
    )
  })

  it('should not rewrite http imports', () => {
    expect(
      rewriteImports(`import { x } from 'https://cdn.example.com/pkg.js'`)
    ).toBe(`import { x } from 'https://cdn.example.com/pkg.js'`)
  })

  it('should handle multiple imports', () => {
    const source = `import { a } from 'pkg-a'\nimport { b } from 'pkg-b'`
    const result = rewriteImports(source)
    expect(result).toContain(`from '${CDN}/pkg-a@latest/+esm'`)
    expect(result).toContain(`from '${CDN}/pkg-b@latest/+esm'`)
  })

  it('should handle re-exports', () => {
    expect(rewriteImports(`export { foo } from 'pkg'`)).toBe(
      `export { foo } from '${CDN}/pkg@latest/+esm'`
    )
  })
})
