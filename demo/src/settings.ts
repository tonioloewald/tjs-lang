/*
 * settings.ts - Settings dialog for API keys and preferences
 */

import { elements, vars, Component, StyleSheet } from 'tosijs'

import { icons } from 'tosijs-ui'

import {
  rescanLocalModels,
  checkServerLoad,
  getPendingRequests,
} from './capabilities'

const { div, button, span, label, input, h2, p, select, option } = elements

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

export type LLMProvider =
  | 'auto'
  | 'custom'
  | 'openai'
  | 'anthropic'
  | 'deepseek'

export interface SettingsData {
  preferredProvider: LLMProvider
  openaiKey: string
  anthropicKey: string
  deepseekKey: string
  customLlmUrl: string
}

export function showSettingsDialog(
  currentSettings: SettingsData,
  onSave: (settings: SettingsData) => void
): void {
  const overlay = div({ class: 'settings-overlay' })

  const providerSelect = select(
    { style: { width: '100%', padding: '8px 12px', borderRadius: '6px' } },
    option(
      { value: 'auto', selected: currentSettings.preferredProvider === 'auto' },
      'First Available'
    ),
    option(
      {
        value: 'custom',
        selected: currentSettings.preferredProvider === 'custom',
      },
      'Custom Endpoint (LM Studio, Ollama)'
    ),
    option(
      {
        value: 'openai',
        selected: currentSettings.preferredProvider === 'openai',
      },
      'OpenAI'
    ),
    option(
      {
        value: 'anthropic',
        selected: currentSettings.preferredProvider === 'anthropic',
      },
      'Anthropic'
    ),
    option(
      {
        value: 'deepseek',
        selected: currentSettings.preferredProvider === 'deepseek',
      },
      'Deepseek'
    )
  )

  const openaiInput = input({
    type: 'password',
    placeholder: 'sk-...',
    value: currentSettings.openaiKey,
    autocomplete: 'off',
  })

  const anthropicInput = input({
    type: 'password',
    placeholder: 'sk-ant-...',
    value: currentSettings.anthropicKey,
    autocomplete: 'off',
  })

  const deepseekInput = input({
    type: 'password',
    placeholder: 'sk-...',
    value: currentSettings.deepseekKey,
    autocomplete: 'off',
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
      preferredProvider: (providerSelect as HTMLSelectElement)
        .value as LLMProvider,
      openaiKey: (openaiInput as HTMLInputElement).value,
      anthropicKey: (anthropicInput as HTMLInputElement).value,
      deepseekKey: (deepseekInput as HTMLInputElement).value,
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
          'LLM Settings'
        ),
        p(
          { style: { fontSize: '0.85em', opacity: 0.8, marginBottom: '15px' } },
          'API keys are stored locally in your browser and never sent to any server except the respective API provider.'
        ),

        div(
          { class: 'settings-field' },
          label('Preferred Provider'),
          providerSelect,
          div(
            { class: 'hint' },
            '"First Available" uses the first configured provider in order below'
          )
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
                  'Note: Local endpoints require HTTP.'
                )
              : ''
          ),
          div(
            {
              style: {
                marginTop: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                flexWrap: 'wrap',
              },
            },
            button(
              {
                class: 'settings-btn secondary',
                style: { padding: '4px 10px', fontSize: '0.85em' },
                onClick: async (e: Event) => {
                  const btn = e.target as HTMLButtonElement
                  const container = btn.parentElement as HTMLElement
                  const statusEl = container.querySelector(
                    '.status-text'
                  ) as HTMLElement
                  btn.disabled = true
                  btn.textContent = 'Scanning...'
                  statusEl.textContent = ''

                  const url = (customUrlInput as HTMLInputElement).value
                  const models = await rescanLocalModels(url)

                  btn.disabled = false
                  btn.textContent = 'Rescan Models'

                  if (models.length > 0) {
                    const visionModels = models.filter(
                      (m) =>
                        m.includes('-vl') ||
                        m.includes('vl-') ||
                        m.includes('vision') ||
                        m.includes('llava') ||
                        m.includes('gemma-3') ||
                        m.includes('gemma3')
                    )
                    statusEl.textContent =
                      `Found ${models.length} model(s)` +
                      (visionModels.length > 0
                        ? ` (${visionModels.length} vision)`
                        : '')
                    statusEl.style.color = '#16a34a'
                  } else {
                    statusEl.textContent = 'No models found'
                    statusEl.style.color = '#dc2626'
                  }
                },
              },
              'Rescan Models'
            ),
            button(
              {
                class: 'settings-btn secondary',
                style: { padding: '4px 10px', fontSize: '0.85em' },
                onClick: async (e: Event) => {
                  const btn = e.target as HTMLButtonElement
                  const container = btn.parentElement as HTMLElement
                  const statusEl = container.querySelector(
                    '.status-text'
                  ) as HTMLElement
                  btn.disabled = true
                  btn.textContent = 'Checking...'

                  const url = (customUrlInput as HTMLInputElement).value
                  if (!url) {
                    statusEl.textContent = 'No URL configured'
                    statusEl.style.color = '#dc2626'
                    btn.disabled = false
                    btn.textContent = 'Check Status'
                    return
                  }

                  const isResponsive = await checkServerLoad(url)
                  const pending = getPendingRequests(url)

                  btn.disabled = false
                  btn.textContent = 'Check Status'

                  if (isResponsive) {
                    statusEl.textContent =
                      pending > 0 ? `Ready (${pending} pending)` : 'Ready'
                    statusEl.style.color = '#16a34a'
                  } else {
                    statusEl.textContent =
                      pending > 0
                        ? `Under load (${pending} pending)`
                        : 'Under load or unreachable'
                    statusEl.style.color = '#f59e0b'
                  }
                },
              },
              'Check Status'
            ),
            span({ class: 'status-text', style: { fontSize: '0.85em' } }, '')
          )
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
          label('Deepseek API Key'),
          deepseekInput,
          div({ class: 'hint' }, 'For Deepseek models (cheap & capable)')
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
