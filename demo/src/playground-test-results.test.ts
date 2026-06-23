import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => GlobalRegistrator.register())
afterAll(() => GlobalRegistrator.unregister())

// Imported after DOM globals exist.
const { renderTestResults } = await import('./playground-shared')

function fakeEditor() {
  const calls: any[] = []
  return {
    setMarkers: (m: any) => calls.push({ setMarkers: m }),
    clearMarkers: () => calls.push({ clearMarkers: true }),
    _calls: calls,
  } as any
}

describe('renderTestResults — inconclusive affordance', () => {
  it('separates inconclusive from passed and failed', () => {
    const out = document.createElement('div')
    const editor = fakeEditor()
    const counts = renderTestResults(
      [
        { description: 'a', passed: true },
        { description: 'b', passed: false, error: 'Expected 5 got 6' },
        {
          description: 'c signature example',
          passed: false,
          inconclusive: true,
          isSignatureTest: true,
          error: 'httpFetch is not defined',
        },
      ],
      out,
      editor,
      () => {}
    )

    expect(counts).toEqual({ passed: 1, failed: 1, inconclusive: 1 })

    // Summary shows all three states
    expect(out.querySelector('.test-summary')?.textContent).toContain(
      '1 passed'
    )
    expect(out.querySelector('.test-summary')?.textContent).toContain(
      '1 failed'
    )
    expect(out.querySelector('.test-summary')?.textContent).toContain(
      '1 inconclusive'
    )

    // The inconclusive test renders with its own class + a warning note (not
    // a red error), with the "could not run" framing.
    const incLi = out.querySelector('li.test-inconclusive')
    expect(incLi).not.toBeNull()
    expect(incLi?.textContent).toContain('—') // not the ✗ failure icon
    expect(incLi?.querySelector('.test-note')).not.toBeNull()
    expect(incLi?.querySelector('.test-error')).toBeNull()
    expect(incLi?.querySelector('.test-note')?.textContent).toContain(
      'could not run'
    )

    // The genuine failure keeps the red error box + ✗ icon.
    const failLi = out.querySelector('li.test-fail')
    expect(failLi?.textContent).toContain('✗')
    expect(failLi?.querySelector('.test-error')).not.toBeNull()
  })

  it('renders REAL transpiler output: atom-calling agent → inconclusive', async () => {
    // End-to-end: the transpiler emits inconclusive for an un-runnable
    // signature test; the playground must render it as such (not a failure).
    const { tjs } = await import('../../src/lang')
    const { testResults } = tjs(
      `function main(url: ''): { x: '' } {\n  const x = httpFetch({ url })\n  return { x }\n}`
    )
    const out = document.createElement('div')
    const counts = renderTestResults(
      testResults as any,
      out,
      fakeEditor(),
      () => {}
    )
    expect(counts.failed).toBe(0)
    expect(counts.inconclusive).toBe(1)
    expect(out.querySelector('li.test-inconclusive')).not.toBeNull()
    expect(out.querySelector('li.test-fail')).toBeNull()
  })

  it('does NOT put an error marker on an inconclusive test line', () => {
    const out = document.createElement('div')
    const editor = fakeEditor()
    renderTestResults(
      [
        {
          description: 'sig',
          passed: false,
          inconclusive: true,
          line: 3,
          error: 'atom not defined',
        },
      ],
      out,
      editor,
      () => {}
    )
    // No setMarkers with an error for the inconclusive line; clearMarkers instead.
    const markerCalls = editor._calls.filter((c: any) => c.setMarkers)
    expect(markerCalls).toHaveLength(0)
    expect(editor._calls.some((c: any) => c.clearMarkers)).toBe(true)
  })
})
