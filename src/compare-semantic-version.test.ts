import { test, expect } from 'bun:test'

import { compareSemanticVersion } from './compare-semantic-version'

test('compareSemanticVersion works', () => {
  expect(compareSemanticVersion('0.1.0', '0.1.0')).toBe(0)
  expect(compareSemanticVersion('5.1.0', '5.1.0')).toBe(0)
  expect(compareSemanticVersion('2.3.4', '2.3.4')).toBe(0)
  expect(compareSemanticVersion('0.1.0', '0.1.1')).toBe(1)
  expect(compareSemanticVersion('0.1.0', '0.2.0')).toBe(1)
  expect(compareSemanticVersion('0.1.0', '1.0.0')).toBe(1)
  expect(compareSemanticVersion('0.2.0', '0.1.1')).toBe(-1)
  expect(compareSemanticVersion('0.3.0', '0.2.0')).toBe(-1)
  expect(compareSemanticVersion('1.0.1', '1.0.0')).toBe(-1)
})
