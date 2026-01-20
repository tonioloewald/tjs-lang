/*
 * style.ts - CSS styles for agent-99 demo site
 *
 * Uses tosijs StyleSheet with CSS variables for theming.
 */

import { vars } from 'tosijs'

// Brand colors
const brandColor = '#3d4a6b' // Dark muted blue
const brandTextColor = '#ffffff'

// Extend CSS variables
export const styleSpec = {
  ':root': {
    _brandColor: brandColor,
    _brandTextColor: brandTextColor,
    _headerHeight: '50px',
    _sidebarWidth: '220px',
    _spacing: '10px',
    _spacing50: '5px',
    _spacing200: '20px',
    _borderRadius: '6px',
    _fontMono: "'SF Mono', Monaco, 'Cascadia Code', Consolas, monospace",
    _fontSize: '15px',
    _lineHeight: '1.6',
    _xinTabsSelectedColor: vars.brandColor,
    // Light mode colors
    _background: '#ffffff',
    _textColor: '#1f2937',
    _codeBackground: '#f3f4f6',
    _codeBorder: '#e5e7eb',
    _linkColor: brandColor,
  },

  // Dark mode - explicit colors for better control
  '.darkmode': {
    _background: '#111827',
    _textColor: '#f3f4f6',
    _codeBackground: '#1f2937',
    _codeBorder: '#374151',
    _linkColor: '#818cf8',
    // xin-tabs uses these
    _xinTabsBarColor: '#374151',
  },

  // High contrast mode - uses filter for comprehensive contrast boost
  '.high-contrast': {
    filter: 'contrast(1.4)',
  },

  // Base styles
  'html, body': {
    margin: 0,
    padding: 0,
    height: '100%',
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: vars.fontSize,
    lineHeight: vars.lineHeight,
    background: vars.background,
    color: vars.textColor,
  },

  body: {
    display: 'flex',
    flexDirection: 'column',
  },

  main: {
    flex: '1',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },

  // Header
  header: {
    display: 'flex',
    alignItems: 'center',
    height: vars.headerHeight,
    padding: `0 ${vars.spacing}`,
    background: vars.brandColor,
    color: vars.brandTextColor,
    gap: vars.spacing,
    flexShrink: 0,
  },

  'header h1': {
    margin: 0,
    fontSize: '1.25em',
    fontWeight: 600,
  },

  'header a': {
    color: vars.brandTextColor,
    textDecoration: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: vars.spacing50,
  },

  'header .elastic': {
    flex: '1 1 auto',
  },

  // Icon buttons
  '.iconic': {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: vars.spacing50,
    borderRadius: vars.borderRadius,
    color: 'inherit',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.15s',
  },

  '.iconic:hover': {
    background: 'rgba(255, 255, 255, 0.15)',
  },

  // Links
  a: {
    color: vars.linkColor,
    textDecoration: 'none',
  },

  'a:hover': {
    textDecoration: 'underline',
  },

  // Doc links in sidebar
  '.doc-link': {
    display: 'block',
    padding: `${vars.spacing50} ${vars.spacing}`,
    color: vars.textColor,
    borderRadius: vars.borderRadius,
    textDecoration: 'none',
    transition: 'background 0.15s',
  },

  '.doc-link:hover': {
    background: 'rgba(99, 102, 241, 0.1)',
    textDecoration: 'none',
  },

  '.doc-link.current': {
    background: vars.brandColor,
    color: vars.brandTextColor,
  },

  // Code blocks (exclude CodeMirror)
  'pre:not(.cm-content), code:not(.cm-content code)': {
    fontFamily: vars.fontMono,
    fontSize: '0.9em',
  },

  'pre:not(.cm-content)': {
    background: vars.codeBackground,
    border: `1px solid ${vars.codeBorder}`,
    borderRadius: vars.borderRadius,
    padding: vars.spacing,
    overflow: 'auto',
  },

  // CodeMirror fixes
  '.cm-editor': {
    height: '100%',
  },

  'code:not(pre code)': {
    background: vars.codeBackground,
    padding: '2px 6px',
    borderRadius: '4px',
  },

  // Badges
  '.badge': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  },

  '.badge img': {
    height: '20px',
  },

  // Search input
  'input[type="search"]': {
    width: '100%',
    padding: vars.spacing50,
    border: `1px solid ${vars.codeBorder}`,
    borderRadius: vars.borderRadius,
    background: vars.background,
    color: vars.textColor,
    fontSize: 'inherit',
  },

  'input[type="search"]:focus': {
    outline: 'none',
    borderColor: vars.brandColor,
    boxShadow: `0 0 0 2px rgba(99, 102, 241, 0.2)`,
  },

  // Markdown content styling
  '.markdown-content': {
    maxWidth: '48em',
    margin: '0 auto',
    padding: vars.spacing200,
  },

  '.markdown-content h1': {
    fontSize: '2em',
    marginTop: 0,
  },

  '.markdown-content h2': {
    fontSize: '1.5em',
    marginTop: '1.5em',
    paddingBottom: '0.3em',
    borderBottom: `1px solid ${vars.codeBorder}`,
  },

  '.markdown-content h3': {
    fontSize: '1.25em',
    marginTop: '1.25em',
  },

  // Table styles (global)
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginBottom: '1em',
    fontSize: '0.9em',
  },

  'th, td': {
    padding: '6px 10px',
    borderBottom: `1px solid ${vars.codeBorder}`,
    textAlign: 'left',
  },

  th: {
    fontWeight: 600,
    background: 'rgba(0, 0, 0, 0.03)',
  },

  '.darkmode th': {
    background: 'rgba(255, 255, 255, 0.03)',
  },

  'tr:nth-child(even)': {
    background: 'rgba(0, 0, 0, 0.03)',
  },

  '.darkmode tr:nth-child(even)': {
    background: 'rgba(255, 255, 255, 0.03)',
  },

  'tr:hover': {
    background: 'rgba(0, 0, 0, 0.06)',
  },

  '.darkmode tr:hover': {
    background: 'rgba(255, 255, 255, 0.06)',
  },

  // Loading state
  '.loading': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    fontSize: '1.2em',
    opacity: 0.6,
  },
}
