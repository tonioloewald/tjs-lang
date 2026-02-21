/**
 * Demo Navigation Component
 *
 * Sidebar with 4 accordion details blocks:
 * - AJS Examples (examples that open AJS playground)
 * - TJS Examples (examples that open TJS playground)
 * - AJS Docs (documentation that opens in floating viewer)
 * - TJS Docs (documentation that opens in floating viewer)
 */

import { Component, elements, ElementCreator, vars, bind } from 'tosijs'
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
  private _built = false
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
    this.tryBuild()
  }

  get docs(): DocItem[] {
    return this._docs
  }

  set docs(value: DocItem[]) {
    this._docs = value
    this.tryBuild()
  }

  // Build nav once when both docs and appState are available
  private tryBuild() {
    if (this._built || !this._appState || !this._docs.length) return
    const container = this.querySelector('.nav-sections')
    if (!container) return
    this._built = true
    this.buildNav(container)
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
    this.tryBuild()
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

    for (const ex of examples) {
      const group = ex.group || 'other'
      if (!grouped.has(group)) grouped.set(group, [])
      grouped.get(group)!.push(ex)
    }

    const sortedGroups = Array.from(grouped.keys()).sort((a, b) => {
      const orderA = DemoNav.GROUP_ORDER.indexOf(a)
      const orderB = DemoNav.GROUP_ORDER.indexOf(b)
      return (orderA === -1 ? 99 : orderA) - (orderB === -1 ? 99 : orderB)
    })

    const elts: HTMLElement[] = []
    for (const group of sortedGroups) {
      const items = grouped.get(group)!
      const label = DemoNav.GROUP_LABELS[group] || group
      elts.push(div({ class: 'group-header' }, label))
      for (const ex of items) elts.push(renderItem(ex))
    }
    return elts
  }

  // Create a nav item bound to currentExample for highlighting
  private boundNavItem(
    name: string,
    extra: { description?: string; requiresApi?: boolean },
    onClick: () => void
  ): HTMLElement {
    const baseClass = extra.requiresApi ? 'nav-item requires-api' : 'nav-item'
    const item = div(
      {
        class: baseClass,
        title: extra.description,
        'data-name': name,
        onClick,
      },
      name
    )
    bind(item, 'app.currentExample', {
      toDOM(el: HTMLElement, example: any) {
        const current = example?.name || example?.title || null
        el.classList.toggle('current', current === name)
      },
    })
    return item
  }

  // Create a details section bound to openSection for open/close
  private boundSection(
    sectionId: string,
    icon: Element,
    label: string,
    children: HTMLElement[]
  ): HTMLElement {
    const det = details(
      {
        'data-section': sectionId,
        onToggle: this.handleToggle,
      },
      summary(span({ class: 'section-icon' }, icon), label),
      div({ class: 'section-content' }, ...children)
    )
    bind(det, 'app.openSection', {
      toDOM(el: HTMLDetailsElement, section: string | null) {
        el.open = section === sectionId
      },
    })
    return det
  }

  // Build the nav once — all reactive updates via bind
  private buildNav(container: Element) {
    const homeLink = div(
      {
        class: 'home-link',
        onClick: () => this.selectHome(),
      },
      span({ class: 'section-icon' }, icons.home({ size: 16 })),
      'Home'
    )
    bind(homeLink, 'app.currentView', {
      toDOM(el: HTMLElement, view: string) {
        el.classList.toggle('current', view === 'home')
      },
    })

    container.append(
      homeLink,

      this.boundSection(
        'ts-demos',
        icons.code({ size: 16 }),
        'TypeScript Examples',
        this.renderGroupedExamples(tsExamples, (ex) =>
          this.boundNavItem(ex.name, ex, () => this.selectTsExample(ex))
        )
      ),

      this.boundSection(
        'tjs-demos',
        icons.code({ size: 16 }),
        'TJS Examples',
        this.renderGroupedExamples(this.tjsExamples, (ex) => {
          const name = ex.title || ex.name || 'Untitled'
          return this.boundNavItem(name, ex, () => this.selectTjsExample(ex))
        })
      ),

      this.boundSection(
        'ajs-demos',
        icons.code({ size: 16 }),
        'AJS Examples',
        this.renderGroupedExamples(this.ajsExamples, (ex) => {
          const name = ex.title || ex.name || 'Untitled'
          return this.boundNavItem(name, ex, () => this.selectAjsExample(ex))
        })
      ),

      this.boundSection(
        'tjs-docs',
        icons.book({ size: 16 }),
        'TJS Docs',
        this.getTjsDocs().map((doc) =>
          this.boundNavItem(doc.title, doc, () => this.selectDoc(doc))
        )
      ),

      this.boundSection(
        'ajs-docs',
        icons.book({ size: 16 }),
        'AJS Docs',
        this.getAjsDocs().map((doc) =>
          this.boundNavItem(doc.title, doc, () => this.selectDoc(doc))
        )
      )
    )
  }

  handleToggle = (event: Event) => {
    const det = event.target as HTMLDetailsElement
    const section = det.getAttribute('data-section')
    if (!this._appState) return

    const current = this._appState.openSection.valueOf()
    if (det.open && current !== section) {
      // User opened a section — update state (bind handles the rest)
      this._appState.openSection.value = section
    } else if (!det.open && current === section) {
      // User closed the current section
      this._appState.openSection.value = null
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
          color: vars.textColor,
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
          background: vars.background,
          color: vars.textColor,
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
            background: vars.codeBackground,
            borderBottom: `1px solid ${vars.codeBorder}`,
            cursor: 'move',
          },
        },
        span(
          {
            class: 'float-title',
            style: { flex: '1', fontWeight: '500', color: vars.textColor },
          },
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
