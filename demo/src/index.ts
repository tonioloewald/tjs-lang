/*
 * index.ts - Main entry point for agent-99 demo site
 *
 * Following the tosijs-ui documentation pattern:
 * - Header with branding and settings
 * - Sidebar navigation with search
 * - Markdown content with live examples
 */

import { elements, tosi, bindings, StyleSheet, bind } from 'tosijs'

import { icons, sideNav, SideNav, sizeBreak, popMenu } from 'tosijs-ui'

import { styleSpec } from './style'
StyleSheet('demo-style', styleSpec)

// Import playground components
import { playground, Playground } from './playground'
import { tjsPlayground, TJSPlayground } from './tjs-playground'

// Import new demo navigation
import { demoNav, DemoNav, tjsExamples } from './demo-nav'

// Import examples
import { examples as ajsExamples } from './examples'

// Import settings dialog
import { showSettingsDialog } from './settings'

// Import tosijs-agent for live examples
import * as agent from '../../src'
import * as tosijs from 'tosijs'
import * as tosijsui from 'tosijs-ui'

// Import capabilities builder for live examples
import { buildCapabilities, getSettings } from './capabilities'

// Create a demo runtime that uses settings-based capabilities
const demoRuntime = {
  // Wraps vm.run with capabilities from settings
  async run(ast: any, args: any, options: any = {}) {
    const vm = new agent.AgentVM()
    const caps = buildCapabilities(getSettings())
    return vm.run(ast, args, {
      ...options,
      capabilities: {
        ...options.capabilities,
        llm: caps.llm,
      },
    })
  },
}

// Make available globally for debugging
Object.assign(window, { agent, tosijs, tosijsui, demoRuntime })

// Load documentation
import docs from '../docs.json'

// Add playgrounds as special pages
const ajsPlaygroundDoc = {
  title: '▶ AJS Playground',
  filename: 'playground',
  text: '',
  isPlayground: 'ajs',
  pin: 'top',
}

const tjsPlaygroundDoc = {
  title: '▶ TJS Playground',
  filename: 'tjs-playground',
  text: '',
  isPlayground: 'tjs',
  pin: 'top',
}

// Insert playgrounds at top
const allDocs = [ajsPlaygroundDoc, tjsPlaygroundDoc, ...docs]

const PROJECT = 'tosijs-agent'
const VERSION = '0.1.0' // TODO: import from package.json

// Determine initial doc from URL
const docName =
  document.location.search !== ''
    ? document.location.search.substring(1).split('&')[0]
    : 'README.md'
const currentDoc =
  allDocs.find((doc: any) => doc.filename === docName) ||
  allDocs.find((d: any) => d.filename === 'README.md') ||
  allDocs[0]

// Initialize reactive state
const { app, prefs } = tosi({
  app: {
    title: PROJECT,
    version: VERSION,
    githubUrl: `https://github.com/tonioloewald/${PROJECT}#readme`,
    npmUrl: `https://www.npmjs.com/package/tosijs-agent`,
    bundleBadgeUrl: `https://deno.bundlejs.com/?q=tosijs-agent&badge=`,
    bundleUrl: `https://bundlejs.com/?q=tosijs-agent`,
    docs: allDocs,
    currentDoc,
    compact: false,
    currentView: 'ajs' as 'ajs' | 'tjs',
    currentExample: null as any,
  },
  prefs: {
    theme: 'system',
    highContrast: false,
    // LLM settings (stored in localStorage)
    preferredProvider: localStorage.getItem('preferredProvider') || 'auto',
    openaiKey: localStorage.getItem('openaiKey') || '',
    anthropicKey: localStorage.getItem('anthropicKey') || '',
    deepseekKey: localStorage.getItem('deepseekKey') || '',
    customLlmUrl: localStorage.getItem('customLlmUrl') || '',
  },
})

// Persist preferences
const savePrefs = () => {
  localStorage.setItem('preferredProvider', prefs.preferredProvider.valueOf())
  localStorage.setItem('openaiKey', prefs.openaiKey.valueOf())
  localStorage.setItem('anthropicKey', prefs.anthropicKey.valueOf())
  localStorage.setItem('deepseekKey', prefs.deepseekKey.valueOf())
  localStorage.setItem('customLlmUrl', prefs.customLlmUrl.valueOf())
}

// Custom bindings
bindings.docLink = {
  toDOM(elt: HTMLElement, filename: string) {
    elt.setAttribute('href', `?${filename}`)
  },
}

bindings.current = {
  toDOM(elt: HTMLElement, currentFile: string) {
    const boundFile = elt.getAttribute('href') || ''
    elt.classList.toggle('current', currentFile === boundFile.substring(1))
  },
}

// Elements
const { h1, h2, div, span, a, img, header, button, template, input } = elements

// Theme binding
bind(document.body, 'prefs.theme', {
  toDOM(element: HTMLElement, theme: string) {
    if (theme === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
    }
    element.classList.toggle('darkmode', theme === 'dark')
  },
})

bind(document.body, 'prefs.highContrast', {
  toDOM(element: HTMLElement, highContrast: any) {
    element.classList.toggle('high-contrast', highContrast.valueOf())
  },
})

// Handle browser navigation
window.addEventListener('popstate', () => {
  const filename = window.location.search.substring(1)
  app.currentDoc =
    app.docs.find((doc: any) => doc.filename === filename) || app.docs[0]
})

// URL state management for view and example
function loadViewStateFromURL() {
  const hash = window.location.hash.slice(1)
  if (!hash) return

  const params = new URLSearchParams(hash)
  const view = params.get('view')
  const example = params.get('example')

  if (view === 'ajs' || view === 'tjs') {
    app.currentView = view
  }

  if (example) {
    // Find example by name in appropriate list
    if (view === 'tjs') {
      const found = tjsExamples.find((e: any) => e.name === example)
      if (found) app.currentExample = found
    } else {
      const found = ajsExamples.find((e: any) => e.name === example)
      if (found) app.currentExample = found
    }
  }
}

function saveViewStateToURL(view: string, exampleName?: string) {
  const params = new URLSearchParams(window.location.hash.slice(1))
  params.set('view', view)
  if (exampleName) {
    params.set('example', exampleName)
  } else {
    params.delete('example')
  }
  const newHash = params.toString()
  window.history.replaceState(null, '', `#${newHash}`)
}

// Load initial state from URL
loadViewStateFromURL()

// Listen for hash changes
window.addEventListener('hashchange', loadViewStateFromURL)

// Main app
const main = document.querySelector('main') as HTMLElement

if (main) {
  // Clear loading state
  main.innerHTML = ''

  main.append(
    // Header
    header(
      // Menu toggle (compact mode)
      button(
        {
          class: 'iconic',
          title: 'Toggle navigation',
          bind: {
            value: app.compact,
            binding: {
              toDOM(element: HTMLElement, compact: boolean) {
                element.style.display = compact ? '' : 'none'
              },
            },
          },
          onClick() {
            const nav = document.querySelector(SideNav.tagName!) as SideNav
            nav.contentVisible = !nav.contentVisible
          },
        },
        icons.menu()
      ),

      // Logo and title
      a(
        {
          href: '/',
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          },
        },
        // Agent icon
        img({ src: '/favicon.svg', style: { width: '32px', height: '32px' } }),
        h1('tosijs-agent')
      ),

      // Elastic spacer
      span({ class: 'elastic' }),

      // Bundle size badge (responsive)
      sizeBreak(
        { minWidth: 600 },
        span(
          { class: 'badge' },
          a(
            { href: app.bundleUrl, target: '_blank' },
            img({ alt: 'bundle size', src: app.bundleBadgeUrl })
          )
        ),
        span({ slot: 'small' })
      ),

      // GitHub link
      a(
        {
          class: 'iconic',
          title: 'GitHub',
          target: '_blank',
          href: app.githubUrl,
        },
        icons.github()
      ),

      // NPM link
      a(
        {
          class: 'iconic',
          title: 'npm',
          target: '_blank',
          href: app.npmUrl,
        },
        icons.npm()
      ),

      // Settings menu
      button(
        {
          class: 'iconic',
          title: 'Settings',
          onClick(event: MouseEvent) {
            popMenu({
              target: event.target as HTMLButtonElement,
              menuItems: [
                {
                  caption: 'API Keys',
                  icon: 'key',
                  action: () => {
                    showSettingsDialog(
                      {
                        preferredProvider:
                          prefs.preferredProvider.valueOf() as any,
                        openaiKey: prefs.openaiKey.valueOf(),
                        anthropicKey: prefs.anthropicKey.valueOf(),
                        deepseekKey: prefs.deepseekKey.valueOf(),
                        customLlmUrl: prefs.customLlmUrl.valueOf(),
                      },
                      (settings) => {
                        prefs.preferredProvider = settings.preferredProvider
                        prefs.openaiKey = settings.openaiKey
                        prefs.anthropicKey = settings.anthropicKey
                        prefs.deepseekKey = settings.deepseekKey
                        prefs.customLlmUrl = settings.customLlmUrl
                        savePrefs()
                      }
                    )
                  },
                },
                {
                  caption: 'Color Theme',
                  icon: 'rgb',
                  menuItems: [
                    {
                      caption: 'System',
                      checked: () => prefs.theme.valueOf() === 'system',
                      action: () => {
                        prefs.theme = 'system'
                      },
                    },
                    {
                      caption: 'Dark',
                      checked: () => prefs.theme.valueOf() === 'dark',
                      action: () => {
                        prefs.theme = 'dark'
                      },
                    },
                    {
                      caption: 'Light',
                      checked: () => prefs.theme.valueOf() === 'light',
                      action: () => {
                        prefs.theme = 'light'
                      },
                    },
                    null,
                    {
                      caption: 'High Contrast',
                      checked: () => prefs.highContrast.valueOf(),
                      action: () => {
                        prefs.highContrast = !prefs.highContrast.valueOf()
                      },
                    },
                  ],
                },
                null,
                {
                  caption: 'GitHub',
                  icon: 'github',
                  action: () => window.open(app.githubUrl.valueOf(), '_blank'),
                },
                {
                  caption: 'npm',
                  icon: 'npm',
                  action: () => window.open(app.npmUrl.valueOf(), '_blank'),
                },
              ],
            })
          },
        },
        icons.moreVertical()
      )
    ),

    // Side navigation + content
    sideNav(
      {
        name: 'Demos',
        navSize: 220,
        minSize: 600,
        style: {
          flex: '1 1 auto',
          overflow: 'hidden',
        },
        onChange() {
          const nav = document.querySelector(SideNav.tagName!) as SideNav
          app.compact = nav.compact
        },
      },

      // Demo navigation with 4 accordion sections
      (() => {
        const nav = demoNav({
          slot: 'nav',
          style: {
            width: '100%',
            height: '100%',
          },
        }) as DemoNav

        // Pass docs to the nav component
        nav.docs = docs

        // Handle AJS example selection - load into AJS playground
        nav.addEventListener('select-ajs-example', ((event: CustomEvent) => {
          const { example } = event.detail
          app.currentView = 'ajs'
          app.currentExample = example
          saveViewStateToURL('ajs', example.name)
        }) as EventListener)

        // Handle TJS example selection - load into TJS playground
        nav.addEventListener('select-tjs-example', ((event: CustomEvent) => {
          const { example } = event.detail
          app.currentView = 'tjs'
          app.currentExample = example
          saveViewStateToURL('tjs', example.name)
        }) as EventListener)

        return nav
      })(),

      // Content area - shows the active playground
      div(
        {
          style: {
            position: 'relative',
            overflow: 'hidden',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
          },
        },
        // AJS Playground
        (() => {
          const pg = playground({
            style: {
              display: 'none',
              flex: '1 1 auto',
              height: '100%',
              padding: '10px',
            },
          }) as Playground

          // Show/hide based on currentView
          bind(pg, 'app.currentView', {
            toDOM(element: HTMLElement, view: string) {
              element.style.display = view === 'ajs' ? 'block' : 'none'
            },
          })

          // Load example when selected
          bind(pg, 'app.currentExample', {
            toDOM(element: Playground, example: any) {
              if (
                example &&
                app.currentView.valueOf() === 'ajs' &&
                element.editor
              ) {
                element.editor.dispatch({
                  changes: {
                    from: 0,
                    to: element.editor.state.doc.length,
                    insert: example.code,
                  },
                })
              }
            },
          })

          return pg
        })(),

        // TJS Playground
        (() => {
          const pg = tjsPlayground({
            style: {
              display: 'none',
              flex: '1 1 auto',
              height: '100%',
              padding: '10px',
            },
          }) as TJSPlayground

          // Show/hide based on currentView
          bind(pg, 'app.currentView', {
            toDOM(element: HTMLElement, view: string) {
              element.style.display = view === 'tjs' ? 'block' : 'none'
            },
          })

          // Load example when selected
          bind(pg, 'app.currentExample', {
            toDOM(element: TJSPlayground, example: any) {
              if (example && app.currentView.valueOf() === 'tjs') {
                // Set value on the TJS editor
                setTimeout(() => {
                  if (element.parts?.tjsEditor) {
                    element.parts.tjsEditor.value = example.code
                  }
                }, 0)
              }
            },
          })

          return pg
        })()
      )
    )
  )
}

// Log welcome message
console.log(
  `%c tosijs-agent %c v${VERSION} `,
  'background: #6366f1; color: white; padding: 2px 6px; border-radius: 3px 0 0 3px;',
  'background: #374151; color: white; padding: 2px 6px; border-radius: 0 3px 3px 0;'
)
