/*
 * index.ts - Main entry point for agent-99 demo site
 *
 * Following the tosijs-ui documentation pattern:
 * - Header with branding and settings
 * - Sidebar navigation with search
 * - Markdown content with live examples
 */

import {
  elements,
  tosi,
  vars,
  bindings,
  touch,
  getListItem,
  StyleSheet,
  bind,
  debounce,
} from 'tosijs'

import {
  icons,
  markdownViewer,
  MarkdownViewer,
  LiveExample,
  sideNav,
  SideNav,
  sizeBreak,
  popMenu,
} from 'tosijs-ui'

import { styleSpec } from './style'
StyleSheet('demo-style', styleSpec)

// Import playground component
import { playground } from './playground'

// Import settings dialog
import { showSettingsDialog } from './settings'

// Import tosijs-agent for live examples
import * as agent from '../../src'
import * as tosijs from 'tosijs'
import * as tosijsui from 'tosijs-ui'

// Make available globally for debugging
Object.assign(window, { agent, tosijs, tosijsui })

// Load documentation
import docs from '../docs.json'

// Add playground as a special page
const playgroundDoc = {
  title: '▶ Playground',
  filename: 'playground',
  text: '', // Not used - playground renders custom component
  isPlayground: true,
  pin: 'top',
}

// Insert playground after pinned docs
const allDocs = [playgroundDoc, ...docs]

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
  },
  prefs: {
    theme: 'system',
    highContrast: false,
    // LLM API keys (stored in localStorage)
    openaiKey: localStorage.getItem('openaiKey') || '',
    anthropicKey: localStorage.getItem('anthropicKey') || '',
    customLlmUrl: localStorage.getItem('customLlmUrl') || '',
  },
})

// Persist preferences
const savePrefs = () => {
  localStorage.setItem('openaiKey', prefs.openaiKey.valueOf())
  localStorage.setItem('anthropicKey', prefs.anthropicKey.valueOf())
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

// Search functionality
const filterDocs = debounce(() => {
  const needle = searchField.value.toLocaleLowerCase()
  app.docs.forEach((doc: any) => {
    doc.hidden =
      !doc.title.toLocaleLowerCase().includes(needle) &&
      !doc.text.toLocaleLowerCase().includes(needle)
  })
  touch(app.docs)
}, 150)

const searchField = input({
  slot: 'nav',
  placeholder: 'Search docs...',
  type: 'search',
  style: {
    width: 'calc(100% - 10px)',
    margin: '5px',
  },
  onInput: filterDocs,
})

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
                        openaiKey: prefs.openaiKey.valueOf(),
                        anthropicKey: prefs.anthropicKey.valueOf(),
                        customLlmUrl: prefs.customLlmUrl.valueOf(),
                      },
                      (settings) => {
                        prefs.openaiKey = settings.openaiKey
                        prefs.anthropicKey = settings.anthropicKey
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
        name: 'Documentation',
        navSize: 200,
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

      // Search field
      searchField,

      // Doc list
      div(
        {
          slot: 'nav',
          style: {
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            overflowY: 'auto',
            padding: '5px',
          },
          bindList: {
            hiddenProp: 'hidden',
            value: app.docs,
          },
        },
        template(
          a(
            {
              class: 'doc-link',
              bindCurrent: 'app.currentDoc.filename',
              bindDocLink: '^.filename',
              onClick(event: Event) {
                event.preventDefault()
                const doc = getListItem(event.target as HTMLElement)
                const nav = (event.target as HTMLElement).closest(
                  'xin-sidenav'
                ) as SideNav
                nav.contentVisible = true
                const href = `?${doc.filename}`
                window.history.pushState({ href }, '', href)
                app.currentDoc = doc
              },
            },
            span({ bindText: '^.title' })
          )
        )
      ),

      // Content area
      div({
        style: {
          position: 'relative',
          overflowY: 'auto',
          height: '100%',
        },
        bind: {
          value: app.currentDoc,
          binding: {
            toDOM(element: HTMLElement, doc: any) {
              element.innerHTML = ''
              if (doc.isPlayground) {
                element.append(
                  playground({
                    style: {
                      display: 'block',
                      height: '100%',
                      padding: 10,
                    },
                  })
                )
              } else {
                // Render markdown viewer
                element.append(
                  markdownViewer({
                    class: 'markdown-content',
                    style: {
                      display: 'block',
                      maxWidth: '48em',
                      margin: 'auto',
                      padding: '0 20px 40px',
                    },
                    value: doc.text,
                    didRender(this: MarkdownViewer) {
                      // Make code blocks interactive
                      LiveExample.insertExamples(this, {
                        'tosijs-agent': agent,
                        agent,
                        tosijs,
                        'tosijs-ui': tosijsui,
                      })
                    },
                  })
                )
              }
            },
          },
        },
      })
    )
  )
}

// Log welcome message
console.log(
  `%c tosijs-agent %c v${VERSION} `,
  'background: #6366f1; color: white; padding: 2px 6px; border-radius: 3px 0 0 3px;',
  'background: #374151; color: white; padding: 2px 6px; border-radius: 0 3px 3px 0;'
)
