/**
 * Demo Navigation Component
 *
 * Sidebar with 4 accordion details blocks:
 * - AJS Examples (examples that open AJS playground)
 * - TJS Examples (examples that open TJS playground)
 * - AJS Docs (documentation that opens in floating viewer)
 * - TJS Docs (documentation that opens in floating viewer)
 */

import { Component, elements, ElementCreator, vars, observe } from 'tosijs'
import {
  xinFloat,
  XinFloat,
  markdownViewer,
  MarkdownViewer,
  icons,
} from 'tosijs-ui'
import { tsExamples, type TSExample } from './ts-examples'

const { div, details, summary, span, button } = elements

// Example interface - matches docs.json structure for type: 'example'
interface Example {
  title: string
  name?: string // For compatibility with TSExample
  description?: string
  code?: string
  group?: string
  section?: string
  type?: string
  language?: string
  path?: string
  filename?: string
  requiresApi?: boolean
}

// Get display name from example (title or name)
function getExampleName(ex: Example | TSExample): string {
  return (ex as Example).title || (ex as TSExample).name || 'Untitled'
}

// Adapt Example to legacy format for event compatibility
function exampleToLegacy(ex: Example | TSExample): {
  name: string
  description: string
  code: string
  group?: string
} {
  return {
    name: getExampleName(ex),
    description: ex.description || getExampleName(ex),
    code: ex.code || '',
    group: ex.group,
  }
}

// DocItem interface - extends Example for docs
interface DocItem {
  title: string
  filename: string
  text?: string
  code?: string
  description?: string
  section?: string
  type?: string
  group?: string
  category?: 'ajs' | 'tjs' | 'general'
  hidden?: boolean
  path?: string
  language?: string
  requiresApi?: boolean
}

export class DemoNav extends Component {
  private _docs: DocItem[] = []
  private _appState: any = null // boxed proxy from index.ts
  private floatViewer: XinFloat | null = null
  private mdViewer: MarkdownViewer | null = null

  // Computed example arrays from docs
  private get tjsExamples(): Example[] {
    return this._docs.filter((d) => d.type === 'example' && d.section === 'tjs')
  }

  private get ajsExamples(): Example[] {
    return this._docs.filter((d) => d.type === 'example' && d.section === 'ajs')
  }
  get appState() {
    return this._appState
  }

  set appState(state: any) {
    this._appState = state
    if (!state) return
    // Observe state changes to update nav
    observe(/^app\.(currentView|currentExample)/, () => {
      this.rebuildNav()
      this.updateCurrentIndicator()
    })
    observe('app.openSection', () => {
      this.rebuildNav()
    })
    // Initial sync
    this.rebuildNav()
    this.updateCurrentIndicator()
  }

  private get _currentView(): string {
    return this._appState?.currentView?.valueOf() ?? 'home'
  }

  private get _currentExampleName(): string | null {
    const ex = this._appState?.currentExample?.valueOf()
    if (!ex) return null
    return ex.name || ex.title || null
  }

  private get _openSection(): string | null {
    return this._appState?.openSection?.valueOf() ?? null
  }

  private updateCurrentIndicator() {
    const exName = this._currentExampleName
    const items = this.querySelectorAll('.nav-item')
    items.forEach((item) => {
      const itemName = item.textContent?.trim()
      item.classList.toggle('current', itemName === exName)
    })
    const homeLink = this.querySelector('.home-link')
    homeLink?.classList.toggle('current', this._currentView === 'home')
  }

  get docs(): DocItem[] {
    return this._docs
  }

  set docs(value: DocItem[]) {
    this._docs = value
    this.rebuildNav()
    this.updateCurrentIndicator()
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
      background: vars.codeBackground,
      color: vars.textColor,
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
      background: vars.codeBorder,
    },

    '.section-content': {
      padding: '4px 0',
    },

    '.nav-item': {
      display: 'block',
      padding: '6px 12px 6px 24px',
      cursor: 'pointer',
      fontSize: '13px',
      color: vars.textColor,
      textDecoration: 'none',
      borderRadius: '4px',
      transition: 'background 0.15s',
    },

    '.nav-item:hover': {
      background: vars.codeBackground,
    },

    '.nav-item.requires-api::after': {
      content: '"🔑"',
      marginLeft: '4px',
      fontSize: '11px',
    },

    '.nav-item.current': {
      background: vars.brandColor,
      fontWeight: '500',
      color: '#fff',
    },

    '.group-header': {
      padding: '8px 12px 4px 16px',
      fontSize: '11px',
      fontWeight: '600',
      color: vars.textColorLight,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    },

    '.group-header:not(:first-child)': {
      marginTop: '8px',
      borderTop: `1px solid ${vars.codeBorder}`,
      paddingTop: '12px',
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

  // Group labels for display
  private static readonly GROUP_LABELS: Record<string, string> = {
    // TypeScript example groups
    intro: 'Introduction',
    validation: 'Runtime Validation',
    // TJS example groups
    featured: 'Featured',
    basics: 'Basics',
    patterns: 'Patterns',
    unbundled: 'Unbundled Integration',
    api: 'API',
    llm: 'LLM',
    fullstack: 'Full Stack',
    advanced: 'Advanced',
  }

  // Group ordering (featured first, then alphabetical-ish)
  private static readonly GROUP_ORDER = [
    // TypeScript groups
    'intro',
    'validation',
    // TJS groups
    'featured',
    'basics',
    'patterns',
    'unbundled',
    'api',
    'llm',
    'fullstack',
    'advanced',
  ]

  // Helper to render examples grouped by their group field
  private renderGroupedExamples<
    T extends { title?: string; name?: string; group?: string }
  >(examples: T[], renderItem: (ex: T) => HTMLElement): HTMLElement[] {
    const grouped = new Map<string, T[]>()

    // Group examples
    for (const ex of examples) {
      const group = ex.group || 'other'
      if (!grouped.has(group)) {
        grouped.set(group, [])
      }
      grouped.get(group)!.push(ex)
    }

    // Sort groups by GROUP_ORDER
    const sortedGroups = Array.from(grouped.keys()).sort((a, b) => {
      const orderA = DemoNav.GROUP_ORDER.indexOf(a)
      const orderB = DemoNav.GROUP_ORDER.indexOf(b)
      return (orderA === -1 ? 99 : orderA) - (orderB === -1 ? 99 : orderB)
    })

    // Render groups with headers
    const elements: HTMLElement[] = []
    for (const group of sortedGroups) {
      const items = grouped.get(group)!
      const label = DemoNav.GROUP_LABELS[group] || group

      // Add group header
      elements.push(div({ class: 'group-header' }, label))

      // Add items in this group
      for (const ex of items) {
        elements.push(renderItem(ex))
      }
    }

    return elements
  }

  rebuildNav() {
    const container = this.querySelector('.nav-sections')
    if (!container) return

    container.innerHTML = ''
    container.append(
      // Home link
      div(
        {
          class:
            this._currentView === 'home' ? 'home-link current' : 'home-link',
          onClick: () => this.selectHome(),
        },
        span({ class: 'section-icon' }, icons.home({ size: 16 })),
        'Home'
      ),

      // TypeScript Examples (TS -> TJS -> JS pipeline)
      details(
        {
          open: this._openSection === 'ts-demos',
          'data-section': 'ts-demos',
          onToggle: this.handleToggle,
        },
        summary(
          span({ class: 'section-icon' }, icons.code({ size: 16 })),
          'TypeScript Examples'
        ),
        div(
          { class: 'section-content' },
          ...this.renderGroupedExamples(tsExamples, (ex) =>
            div(
              {
                class: 'nav-item',
                title: ex.description,
                onClick: () => this.selectTsExample(ex),
              },
              ex.name
            )
          )
        )
      ),

      // TJS Examples
      details(
        {
          open: this._openSection === 'tjs-demos',
          'data-section': 'tjs-demos',
          onToggle: this.handleToggle,
        },
        summary(
          span({ class: 'section-icon' }, icons.code({ size: 16 })),
          'TJS Examples'
        ),
        div(
          { class: 'section-content' },
          ...this.renderGroupedExamples(this.tjsExamples, (ex) =>
            div(
              {
                class: 'nav-item',
                title: ex.description,
                onClick: () => this.selectTjsExample(ex),
              },
              ex.title || ex.name
            )
          )
        )
      ),

      // AJS Examples
      details(
        {
          open: this._openSection === 'ajs-demos',
          'data-section': 'ajs-demos',
          onToggle: this.handleToggle,
        },
        summary(
          span({ class: 'section-icon' }, icons.code({ size: 16 })),
          'AJS Examples'
        ),
        div(
          { class: 'section-content' },
          ...this.renderGroupedExamples(this.ajsExamples, (ex) =>
            div(
              {
                class: ex.requiresApi ? 'nav-item requires-api' : 'nav-item',
                title: ex.description,
                onClick: () => this.selectAjsExample(ex),
              },
              ex.title || ex.name
            )
          )
        )
      ),

      // TJS Docs
      details(
        {
          open: this._openSection === 'tjs-docs',
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
      ),

      // AJS Docs
      details(
        {
          open: this._openSection === 'ajs-docs',
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
      )
    )
  }

  handleToggle = (event: Event) => {
    const details = event.target as HTMLDetailsElement
    const section = details.getAttribute('data-section')

    if (details.open) {
      if (this._appState) this._appState.openSection.value = section
      // Close other sections (accordion behavior)
      this.querySelectorAll('details').forEach((d) => {
        if (d !== details && d.open) {
          d.open = false
        }
      })
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
    if (!this._appState) return
    this._appState.currentView.value = 'home'
    this._appState.currentExample.value = null
  }

  selectAjsExample(example: Example) {
    if (!this._appState) return
    this._appState.currentView.value = 'ajs'
    this._appState.currentExample.value = exampleToLegacy(example)
    this._appState.openSection.value = 'ajs-demos'
  }

  selectTjsExample(example: Example) {
    if (!this._appState) return
    this._appState.currentView.value = 'tjs'
    this._appState.currentExample.value = exampleToLegacy(example)
    this._appState.openSection.value = 'tjs-demos'
  }

  selectTsExample(example: TSExample) {
    if (!this._appState) return
    this._appState.currentView.value = 'ts'
    this._appState.currentExample.value = exampleToLegacy(example)
    this._appState.openSection.value = 'ts-demos'
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
      class: 'no-drag markdown-content',
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
