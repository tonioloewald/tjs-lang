/*
 * settings.ts - Settings dialog for API keys and preferences
 */

import { elements, vars, Component, StyleSheet } from 'tosijs'

import { icons } from 'tosijs-ui'

const { div, button, span, label, input, h2, p } = elements

// Settings dialog styles
StyleSheet('settings-styles', {
  '.settings-overlay': {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },

  '.settings-dialog': {
    background: vars.background,
    borderRadius: vars.borderRadius,
    padding: vars.spacing200,
    maxWidth: '500px',
    width: '90%',
    maxHeight: '80vh',
    overflow: 'auto',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
  },

  '.settings-header': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: vars.spacing,
  },

  '.settings-header h2': {
    margin: 0,
    fontSize: '1.25em',
  },

  '.settings-section': {
    marginBottom: vars.spacing200,
  },

  '.settings-section h3': {
    fontSize: '1em',
    marginBottom: vars.spacing,
    color: vars.brandColor,
  },

  '.settings-field': {
    marginBottom: vars.spacing,
  },

  '.settings-field label': {
    display: 'block',
    marginBottom: '4px',
    fontSize: '0.9em',
    fontWeight: 500,
  },

  '.settings-field input': {
    width: '100%',
    padding: '8px 12px',
    border: `1px solid ${vars.codeBorder}`,
    borderRadius: vars.borderRadius,
    background: vars.background,
    color: vars.textColor,
    fontSize: 'inherit',
  },

  '.settings-field input:focus': {
    outline: 'none',
    borderColor: vars.brandColor,
    boxShadow: `0 0 0 2px rgba(99, 102, 241, 0.2)`,
  },

  '.settings-field .hint': {
    fontSize: '0.8em',
    color: vars.textColor,
    opacity: 0.7,
    marginTop: '4px',
  },

  '.settings-actions': {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: vars.spacing,
    marginTop: vars.spacing200,
    paddingTop: vars.spacing,
    borderTop: `1px solid ${vars.codeBorder}`,
  },

  '.settings-btn': {
    padding: '8px 16px',
    borderRadius: vars.borderRadius,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 500,
  },

  '.settings-btn.primary': {
    background: vars.brandColor,
    color: 'white',
  },

  '.settings-btn.secondary': {
    background: vars.codeBackground,
    color: vars.textColor,
  },
})

export interface SettingsData {
  openaiKey: string
  anthropicKey: string
  customLlmUrl: string
}

export function showSettingsDialog(
  currentSettings: SettingsData,
  onSave: (settings: SettingsData) => void
): void {
  const overlay = div({ class: 'settings-overlay' })

  const openaiInput = input({
    type: 'password',
    placeholder: 'sk-...',
    value: currentSettings.openaiKey,
  })

  const anthropicInput = input({
    type: 'password',
    placeholder: 'sk-ant-...',
    value: currentSettings.anthropicKey,
  })

  const customUrlInput = input({
    type: 'url',
    placeholder: 'http://localhost:1234/v1',
    value: currentSettings.customLlmUrl,
  })

  const close = () => {
    overlay.remove()
  }

  const save = () => {
    onSave({
      openaiKey: (openaiInput as HTMLInputElement).value,
      anthropicKey: (anthropicInput as HTMLInputElement).value,
      customLlmUrl: (customUrlInput as HTMLInputElement).value,
    })
    close()
  }

  overlay.append(
    div(
      { class: 'settings-dialog' },
      // Header
      div(
        { class: 'settings-header' },
        h2('Settings'),
        button(
          {
            class: 'iconic',
            onClick: close,
          },
          icons.x()
        )
      ),

      // LLM API Keys section
      div(
        { class: 'settings-section' },
        div(
          { style: { fontWeight: 600, marginBottom: '10px' } },
          'LLM API Keys'
        ),
        p(
          { style: { fontSize: '0.85em', opacity: 0.8, marginBottom: '15px' } },
          'API keys are stored locally in your browser and never sent to any server except the respective API provider.'
        ),

        div(
          { class: 'settings-field' },
          label('OpenAI API Key'),
          openaiInput,
          div({ class: 'hint' }, 'For GPT-4, GPT-3.5, etc.')
        ),

        div(
          { class: 'settings-field' },
          label('Anthropic API Key'),
          anthropicInput,
          div({ class: 'hint' }, 'For Claude models')
        ),

        div(
          { class: 'settings-field' },
          label('Custom LLM Endpoint'),
          customUrlInput,
          div(
            { class: 'hint' },
            'OpenAI-compatible endpoint (e.g., LM Studio, Ollama). ',
            window.location.protocol === 'https:'
              ? span(
                  { style: { color: '#dc2626' } },
                  'Note: Local endpoints require HTTP. Use http://localhost:8699 for local LLMs.'
                )
              : 'Local endpoints work on HTTP.'
          )
        )
      ),

      // Actions
      div(
        { class: 'settings-actions' },
        button(
          {
            class: 'settings-btn secondary',
            onClick: close,
          },
          'Cancel'
        ),
        button(
          {
            class: 'settings-btn primary',
            onClick: save,
          },
          'Save'
        )
      )
    )
  )

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      close()
    }
  })

  // Close on Escape
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      close()
      document.removeEventListener('keydown', handleEscape)
    }
  }
  document.addEventListener('keydown', handleEscape)

  document.body.append(overlay)
}
