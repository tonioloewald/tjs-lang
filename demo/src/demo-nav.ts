/**
 * Demo Navigation Component
 *
 * Sidebar with 4 accordion details blocks:
 * - AJS Demos (examples that open AJS playground)
 * - TJS Demos (examples that open TJS playground)
 * - AJS Docs (documentation that opens in floating viewer)
 * - TJS Docs (documentation that opens in floating viewer)
 */

import { Component, elements, ElementCreator } from 'tosijs'
import {
  xinFloat,
  XinFloat,
  markdownViewer,
  MarkdownViewer,
  icons,
} from 'tosijs-ui'
import { examples as ajsExamples } from './examples'

const { div, details, summary, span, button } = elements

// TJS examples - demonstrating typed JavaScript features
export const tjsExamples = [
  {
    name: 'TJS Grammar Demo',
    description: 'Comprehensive example exercising all TJS syntax features',
    code: `/*
# TJS Grammar Demonstration

This example showcases **all TJS syntax features** for testing
syntax highlighting in editors.

## Features Covered
- Type annotations with examples
- Return type arrows
- test/mock/unsafe blocks
- Markdown in comments
*/

// Type annotations by example
function greet(name: 'World', times: 3) -> '' {
  /*
  ## Implementation Notes
  
  This function demonstrates:
  - Required parameters with example values
  - Return type annotation
  - Template literal usage
  */
  let result = ''
  let i = 0
  while (i < times) {
    result = result + \`Hello, \${name}! \`
    i = i + 1
  }
  return result.trim()
}

// Optional parameters use = instead of :
function divide(a: 10, b: 2, fallback = 0) -> 0 {
  if (b === 0) {
    return fallback
  }
  return a / b
}

// Schema-based types
function createUser(
  name: 'Alice',
  age: 30,
  email: 'alice@example.com',
  roles: ['user']
) -> { id: '', name: '', age: 0, email: '', roles: [''] } {
  return {
    id: 'user-' + Math.random().toString(36).slice(2),
    name,
    age,
    email,
    roles
  }
}

// Inline mock block - runs before each test
mock {
  // Setup test fixtures
  const testUser = { name: 'Test', age: 25 }
  const mockData = [1, 2, 3, 4, 5]
}

// Inline test blocks
test('greet returns proper greeting') {
  const result = greet('TJS', 2)
  expect(result).toBe('Hello, TJS! Hello, TJS!')
}

test('greet handles single repetition') {
  const result = greet('World', 1)
  expect(result).toBe('Hello, World!')
}

test('divide handles division') {
  expect(divide(10, 2)).toBe(5)
  expect(divide(15, 3)).toBe(5)
}

test('divide returns fallback on zero') {
  expect(divide(10, 0)).toBe(0)
  expect(divide(10, 0, -1)).toBe(-1)
}

test('createUser generates valid user') {
  const user = createUser('Bob', 35, 'bob@test.com', ['admin'])
  expect(user.name).toBe('Bob')
  expect(user.age).toBe(35)
  expect(user.roles).toContain('admin')
}

// Async test with await
test('async operations work in tests') {
  const delay = (ms) => new Promise(r => setTimeout(r, ms))
  await delay(10)
  expect(true).toBe(true)
}

// Unsafe function with (!) - skips all runtime validation
function fastAdd(! a: 0, b: 0) -> 0 {
  return a + b
}

// unsafe block for performance-critical code within a safe function
function fastSum(numbers: [0]) -> 0 {
  /*
  Parameters are validated, but the inner loop is unsafe.
  Skips runtime type validation for ~35x speedup.
  */
  unsafe {
    let sum = 0
    for (let i = 0; i < numbers.length; i++) {
      sum += numbers[i]
    }
    return sum
  }
}

test('fastSum calculates correctly') {
  expect(fastSum([1, 2, 3, 4, 5])).toBe(15)
  expect(fastSum([])).toBe(0)
}

// Union types with ||
function parseValue(input: '' || 0 || null) -> '' {
  if (input === null) {
    return 'null'
  }
  if (typeof input === 'number') {
    return \`number: \${input}\`
  }
  return \`string: \${input}\`
}

test('parseValue handles unions') {
  expect(parseValue('hello')).toBe('string: hello')
  expect(parseValue(42)).toBe('number: 42')
  expect(parseValue(null)).toBe('null')
}

// Array type examples
function processItems(items: ['']) -> { count: 0, first: '', last: '' } {
  return {
    count: items.length,
    first: items[0] || '',
    last: items[items.length - 1] || ''
  }
}

// Object spread and destructuring
function mergeConfig(base: { debug: false }, overrides: {}) -> {} {
  return { ...base, ...overrides }
}

/*
# Summary

This file demonstrates TJS syntax highlighting for:

| Feature | Syntax |
|---------|--------|
| Required param | \`name: 'example'\` |
| Optional param | \`name = 'default'\` |
| Return type | \`-> Type\` |
| Unsafe function | \`function foo(! x: 0) { }\` |
| Test block | \`test('desc') { }\` |
| Mock block | \`mock { }\` |
| Unsafe block | \`unsafe { }\` |
| Union type | \`Type1 \\|\\| Type2\` |

Check that all keywords and constructs are properly highlighted!
*/
`,
  },
  {
    name: 'Hello TJS',
    description: 'Simple typed greeting function',
    code: `// TJS: Type annotations via examples
// Use : for required params, = for optional

function greet(name: 'World') -> '' {
  return \`Hello, \${name}!\`
}

// The type metadata is attached to the function
console.log('Type info:', greet.__tjs)

// Call it
greet('TJS')`,
  },
  {
    name: 'Required vs Optional',
    description: 'Difference between : and = in parameters',
    code: `// In TJS:
//   param: 'default'  --> required, string type
//   param = 'default' --> optional with default

function createUser(
  name: 'anonymous',      // required string
  email: 'user@example.com', // required string  
  age = 0,                // optional number, defaults to 0
  admin = false           // optional boolean, defaults to false
) -> { name: '', email: '', age: 0, admin: false } {
  return { name, email, age, admin }
}

// Must provide name and email
createUser('Alice', 'alice@example.com')`,
  },
  {
    name: 'Object Types',
    description: 'Typed object parameters and returns',
    code: `// Object types are inferred from examples
// Note: type annotations use flat objects

function getFullName(person: { first: '', last: '' }) -> '' {
  return person.first + ' ' + person.last
}

function createPoint(x: 0, y: 0) -> { x: 0, y: 0 } {
  return { x, y }
}

function distance(p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 }) -> 0 {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  return Math.sqrt(dx * dx + dy * dy)
}

// Usage
const name = getFullName({ first: 'Jane', last: 'Doe' })
const origin = createPoint(0, 0)
const point = createPoint(3, 4)
const dist = distance(origin, point)

console.log('Name:', name)
console.log('Distance from origin:', dist)

dist`,
  },
  {
    name: 'Array Types',
    description: 'Working with typed arrays',
    code: `// Array types from example elements

function sum(numbers: [0]) -> 0 {
  return numbers.reduce((a, b) => a + b, 0)
}

function average(numbers: [0]) -> 0 {
  if (numbers.length === 0) return 0
  return sum(numbers) / numbers.length
}

function stats(data: [0]) -> { min: 0, max: 0, avg: 0 } {
  if (data.length === 0) {
    return { min: 0, max: 0, avg: 0 }
  }
  return {
    min: Math.min(...data),
    max: Math.max(...data),
    avg: average(data)
  }
}

stats([10, 20, 30, 40, 50])`,
  },
  {
    name: 'Higher-Order Functions',
    description: 'Functions that take or return functions',
    code: `// TJS handles higher-order functions
// Note: Function type annotations use simple syntax

function mapStrings(arr: [''], fn = (x) => x) -> [''] {
  return arr.map(fn)
}

function filterNumbers(arr: [0], predicate = (x) => true) -> [0] {
  return arr.filter(predicate)
}

function compose(f = (x) => x, g = (x) => x) -> 0 {
  // Returns a composed function, demo returns result
  const composed = (x) => f(g(x))
  return composed(5)
}

// Usage examples
const double = (x) => x * 2
const addOne = (x) => x + 1

// Map strings to uppercase
const words = mapStrings(['hello', 'world'], s => s.toUpperCase())

// Filter even numbers
const evens = filterNumbers([1, 2, 3, 4, 5, 6], x => x % 2 === 0)

// Compose functions: (5 * 2) + 1 = 11
const result = compose(addOne, double)

console.log('Mapped:', words)
console.log('Filtered:', evens)
console.log('Composed result:', result)

result`,
  },
  {
    name: 'Async Functions',
    description: 'Typed async/await patterns',
    code: `// Async functions work naturally

async function fetchUser(id: 'user-1') -> { name: '', email: '' } {
  // Simulated API call
  await new Promise(resolve => setTimeout(resolve, 100))
  return {
    name: 'User ' + id,
    email: id + '@example.com'
  }
}

async function fetchUsers(ids: ['']) -> [{ name: '', email: '' }] {
  return Promise.all(ids.map(id => fetchUser(id)))
}

// Run it
await fetchUsers(['alice', 'bob', 'charlie'])`,
  },
  {
    name: 'Error Handling',
    description: 'Type-safe error handling patterns',
    code: `// Result type pattern for error handling

function divide(a: 10, b: 2) -> { ok: true, value: 0, error: '' } {
  if (b === 0) {
    return { ok: false, value: 0, error: 'Division by zero' }
  }
  return { ok: true, value: a / b, error: '' }
}

function safeParse(json: '{}') -> { ok: true, data: null, error: '' } {
  try {
    return { ok: true, data: JSON.parse(json), error: '' }
  } catch (e) {
    return { ok: false, data: null, error: e.message }
  }
}

// Usage
const result = divide(10, 0)
if (result.ok) {
  console.log('Result:', result.value)
} else {
  console.log('Error:', result.error)
}

result`,
  },
  {
    name: 'Schema Validation',
    description: 'Using Schema for runtime type checking',
    code: `// TJS integrates with Schema for validation
import { Schema } from 'tosijs-schema'

// Define a schema
const UserSchema = Schema({
  name: 'anonymous',
  email: 'user@example.com',
  age: 0
})

// Validate data
function validateUser(data: { name: '', email: '', age: 0 }) -> { valid: true, errors: [''] } {
  const errors = []
  
  if (!UserSchema.validate(data)) {
    errors.push('Invalid user structure')
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}

validateUser({ name: 'Alice', email: 'alice@test.com', age: 30 })`,
  },
]

// Types for docs
interface DocItem {
  title: string
  filename: string
  text: string
  category?: 'ajs' | 'tjs' | 'general'
  hidden?: boolean
}

interface DemoNavEvents {
  'select-ajs-example': { example: (typeof ajsExamples)[0] }
  'select-tjs-example': { example: (typeof tjsExamples)[0] }
  'select-doc': { doc: DocItem }
}

export class DemoNav extends Component {
  private _docs: DocItem[] = []
  private openSection: string | null = null
  private floatViewer: XinFloat | null = null
  private mdViewer: MarkdownViewer | null = null
  
  // Track current selection for highlighting
  private _currentView: 'home' | 'ajs' | 'tjs' = 'home'
  private _currentExample: string | null = null

  constructor() {
    super()
    // Initialize from URL hash
    this.loadStateFromURL()
    // Listen for hash changes
    window.addEventListener('hashchange', () => this.loadStateFromURL())
  }
  
  get currentView() {
    return this._currentView
  }
  
  set currentView(value: 'home' | 'ajs' | 'tjs') {
    this._currentView = value
    // Auto-open the appropriate section
    if (value === 'ajs') {
      this.openSection = 'ajs-demos'
    } else if (value === 'tjs') {
      this.openSection = 'tjs-demos'
    }
    this.rebuildNav()
    // Update indicator after rebuild (DOM now exists)
    this.updateCurrentIndicator()
  }
  
  get currentExample() {
    return this._currentExample
  }
  
  set currentExample(value: string | null) {
    this._currentExample = value
    this.updateCurrentIndicator()
  }
  
  private updateCurrentIndicator() {
    // Update .current class on nav items
    const items = this.querySelectorAll('.nav-item')
    items.forEach((item) => {
      const itemName = item.textContent?.trim()
      const isCurrent = itemName === this._currentExample
      item.classList.toggle('current', isCurrent)
    })
    // Update home link
    const homeLink = this.querySelector('.home-link')
    homeLink?.classList.toggle('current', this._currentView === 'home')
  }

  private loadStateFromURL() {
    const hash = window.location.hash.slice(1) // Remove '#'
    if (!hash) return

    const params = new URLSearchParams(hash)
    const section = params.get('section')
    const view = params.get('view')
    const example = params.get('example')
    
    // Set view and open appropriate section
    if (view === 'ajs') {
      this._currentView = 'ajs'
      this.openSection = 'ajs-demos'
    } else if (view === 'tjs') {
      this._currentView = 'tjs'
      this.openSection = 'tjs-demos'
    } else if (view === 'home') {
      this._currentView = 'home'
    } else if (
      section &&
      ['ajs-demos', 'tjs-demos', 'ajs-docs', 'tjs-docs'].includes(section)
    ) {
      this.openSection = section
    }
    
    // Set current example for highlighting
    if (example) {
      this._currentExample = example
    }
    
    this.rebuildNav()
    this.updateCurrentIndicator()
  }

  private saveStateToURL() {
    const params = new URLSearchParams(window.location.hash.slice(1))
    if (this.openSection) {
      params.set('section', this.openSection)
    }
    const newHash = params.toString()
    if (newHash !== window.location.hash.slice(1)) {
      window.history.replaceState(null, '', `#${newHash}`)
    }
  }

  get docs(): DocItem[] {
    return this._docs
  }

  set docs(value: DocItem[]) {
    this._docs = value
    // Re-render when docs are set
    this.rebuildNav()
  }

  // Light DOM styles (no static styleSpec)
  static lightDOMStyles = {
    ':host': {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    },

    '.nav-sections': {
      flex: '1 1 auto',
      overflowY: 'auto',
      padding: '8px',
    },

    details: {
      marginBottom: '4px',
      borderRadius: '6px',
      overflow: 'hidden',
    },

    summary: {
      padding: '8px 12px',
      background: '#f3f4f6',
      cursor: 'pointer',
      fontWeight: '500',
      fontSize: '14px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      userSelect: 'none',
      listStyle: 'none',
    },

    'summary::-webkit-details-marker': {
      display: 'none',
    },

    'summary::before': {
      content: '"▶"',
      fontSize: '10px',
      transition: 'transform 0.2s',
    },

    'details[open] summary::before': {
      transform: 'rotate(90deg)',
    },

    'summary:hover': {
      background: '#e5e7eb',
    },

    '.section-content': {
      padding: '4px 0',
    },

    '.nav-item': {
      display: 'block',
      padding: '6px 12px 6px 24px',
      cursor: 'pointer',
      fontSize: '13px',
      color: '#374151',
      textDecoration: 'none',
      borderRadius: '4px',
      transition: 'background 0.15s',
    },

    '.nav-item:hover': {
      background: '#f3f4f6',
    },

    '.nav-item.requires-api::after': {
      content: '"🔑"',
      marginLeft: '4px',
      fontSize: '11px',
    },
    
    '.nav-item.current': {
      background: '#e0e7ff',
      fontWeight: '500',
      color: '#3730a3',
    },

    '.section-icon': {
      width: '16px',
      height: '16px',
    },
    
    '.home-link': {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '10px 12px',
      marginBottom: '8px',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: '500',
      color: '#374151',
      borderRadius: '6px',
      transition: 'background 0.15s',
    },
    
    '.home-link:hover': {
      background: '#f3f4f6',
    },
    
    '.home-link.current': {
      background: '#e0e7ff',
      color: '#3730a3',
    },
  }

  content = () => [div({ class: 'nav-sections', part: 'sections' })]

  connectedCallback() {
    super.connectedCallback()
    this.rebuildNav()
    // Update indicator after DOM is ready
    this.updateCurrentIndicator()
  }

  rebuildNav() {
    const container = this.querySelector('.nav-sections')
    if (!container) return

    container.innerHTML = ''
    container.append(
      // Home link
      div(
        {
          class: this._currentView === 'home' ? 'home-link current' : 'home-link',
          onClick: () => this.selectHome(),
        },
        span({ class: 'section-icon' }, icons.home({ size: 16 })),
        'Home'
      ),
      
      // AJS Demos
      details(
        {
          open: this.openSection === 'ajs-demos',
          'data-section': 'ajs-demos',
          onToggle: this.handleToggle,
        },
        summary(
          span({ class: 'section-icon' }, icons.play({ size: 16 })),
          'AJS Demos'
        ),
        div(
          { class: 'section-content' },
          ...ajsExamples.map((ex) =>
            div(
              {
                class: ex.requiresApi ? 'nav-item requires-api' : 'nav-item',
                title: ex.description,
                onClick: () => this.selectAjsExample(ex),
              },
              ex.name
            )
          )
        )
      ),

      // TJS Demos
      details(
        {
          open: this.openSection === 'tjs-demos',
          'data-section': 'tjs-demos',
          onToggle: this.handleToggle,
        },
        summary(
          span({ class: 'section-icon' }, icons.play({ size: 16 })),
          'TJS Demos'
        ),
        div(
          { class: 'section-content' },
          ...tjsExamples.map((ex) =>
            div(
              {
                class: 'nav-item',
                title: ex.description,
                onClick: () => this.selectTjsExample(ex),
              },
              ex.name
            )
          )
        )
      ),

      // AJS Docs
      details(
        {
          open: this.openSection === 'ajs-docs',
          'data-section': 'ajs-docs',
          onToggle: this.handleToggle,
        },
        summary(
          span({ class: 'section-icon' }, icons.book({ size: 16 })),
          'AJS Docs'
        ),
        div(
          { class: 'section-content' },
          ...this.getAjsDocs().map((doc) =>
            div(
              {
                class: 'nav-item',
                onClick: () => this.selectDoc(doc),
              },
              doc.title
            )
          )
        )
      ),

      // TJS Docs
      details(
        {
          open: this.openSection === 'tjs-docs',
          'data-section': 'tjs-docs',
          onToggle: this.handleToggle,
        },
        summary(
          span({ class: 'section-icon' }, icons.book({ size: 16 })),
          'TJS Docs'
        ),
        div(
          { class: 'section-content' },
          ...this.getTjsDocs().map((doc) =>
            div(
              {
                class: 'nav-item',
                onClick: () => this.selectDoc(doc),
              },
              doc.title
            )
          )
        )
      )
    )
  }

  handleToggle = (event: Event) => {
    const details = event.target as HTMLDetailsElement
    const section = details.getAttribute('data-section')

    if (details.open) {
      // Close other sections (accordion behavior)
      this.openSection = section
      const allDetails = this.querySelectorAll('details')
      allDetails.forEach((d) => {
        if (d !== details && d.open) {
          d.open = false
        }
      })
      // Save to URL
      this.saveStateToURL()
    }
  }

  getAjsDocs(): DocItem[] {
    return this.docs.filter(
      (d) =>
        !d.hidden &&
        (d.filename.includes('ASYNCJS') ||
          d.filename.includes('PATTERNS') ||
          d.filename === 'runtime.ts')
    )
  }

  getTjsDocs(): DocItem[] {
    return this.docs.filter(
      (d) =>
        !d.hidden &&
        (d.filename.includes('TJS') ||
          d.filename === 'CONTEXT.md' ||
          d.filename === 'PLAN.md')
    )
  }

  selectHome() {
    this._currentView = 'home'
    this._currentExample = null
    this.updateCurrentIndicator()
    this.dispatchEvent(
      new CustomEvent('select-home', {
        bubbles: true,
      })
    )
  }

  selectAjsExample(example: (typeof ajsExamples)[0]) {
    this._currentView = 'ajs'
    this._currentExample = example.name
    this.updateCurrentIndicator()
    this.dispatchEvent(
      new CustomEvent('select-ajs-example', {
        detail: { example },
        bubbles: true,
      })
    )
  }

  selectTjsExample(example: (typeof tjsExamples)[0]) {
    this._currentView = 'tjs'
    this._currentExample = example.name
    this.updateCurrentIndicator()
    this.dispatchEvent(
      new CustomEvent('select-tjs-example', {
        detail: { example },
        bubbles: true,
      })
    )
  }

  selectDoc(doc: DocItem) {
    // Open or update floating doc viewer
    if (!this.floatViewer || !document.body.contains(this.floatViewer)) {
      this.createFloatViewer(doc)
    } else {
      // Update existing viewer
      if (this.mdViewer) {
        this.mdViewer.value = doc.text
      }
      // Update title
      const title = this.floatViewer.querySelector('.float-title')
      if (title) {
        title.textContent = doc.title
      }
    }

    this.dispatchEvent(
      new CustomEvent('select-doc', {
        detail: { doc },
        bubbles: true,
      })
    )
  }

  createFloatViewer(doc: DocItem) {
    this.mdViewer = markdownViewer({
      class: 'no-drag',
      value: doc.text,
      style: {
        display: 'block',
        padding: '4px 20px 12px',
        overflow: 'auto',
        maxHeight: 'calc(80vh - 40px)',
      },
    })

    const closeBtn = button(
      {
        class: 'iconic no-drag',
        style: {
          padding: '4px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
        },
      },
      icons.x({ size: 16 })
    )

    this.floatViewer = xinFloat(
      {
        drag: true,
        remainOnResize: 'remain',
        remainOnScroll: 'remain',
        style: {
          position: 'fixed',
          top: '60px',
          right: '20px',
          width: '500px',
          maxWidth: 'calc(100vw - 40px)',
          maxHeight: '80vh',
          background: 'white',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          overflow: 'hidden',
          zIndex: '1000',
        },
      },
      // Header
      div(
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            padding: '6px 12px',
            background: '#f3f4f6',
            borderBottom: '1px solid #e5e7eb',
            cursor: 'move',
          },
        },
        span(
          { class: 'float-title', style: { flex: '1', fontWeight: '500' } },
          doc.title
        ),
        closeBtn
      ),
      // Content
      this.mdViewer
    )

    // Add click handler after element is created
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      this.floatViewer?.remove()
      this.floatViewer = null
      this.mdViewer = null
    })

    document.body.appendChild(this.floatViewer)
  }
}

export const demoNav: ElementCreator<DemoNav> = DemoNav.elementCreator({
  tag: 'demo-nav',
  styleSpec: DemoNav.lightDOMStyles,
})
