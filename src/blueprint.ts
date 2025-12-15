/*!
# agent-99

Information about the `<agent-99>` component blueprint.
*/

import type { XinBlueprint, PartsMap } from 'tosijs'
import { compareSemanticVersion } from './compare-semantic-version'
interface ToggleParts extends PartsMap {
  valueHolder: HTMLInputElement
}

// v0.8.5 required for async blueprints
const REQUIRED_VERSION = '0.8.5'

export const blueprint: XinBlueprint = async (tag, factory) => {
  const { Component, elements, vars, version } = factory
  const { input, label, div, slot } = elements

  if (compareSemanticVersion(REQUIRED_VERSION, version) < 0) {
    throw new Error(`blueprint requires xinjs ${REQUIRED_VERSION}`)
  }

  class WebComponent extends Component {
    value = false
    disabled = false

    get checked(): boolean {
      return this.value
    }

    set checked(value: boolean) {
      this.value = value
    }

    constructor() {
      super()

      this.initAttributes('disabled')
    }

    static styleSpec = {
      ':host': {
        display: 'inline-block',
      },

      ':host label': {
        display: 'inline-flex',
        gap: vars.toggleGap,
        alignItems: 'center',
      },

      ':host::part(container)': {
        display: 'block',
        height: vars.toggleKnobSize,
        lineHeight: vars.toggleKnobSize,
        position: 'relative',
      },

      '[part=track]': {
        transition: vars.toggleTransition,
        margin: vars.toggleTrackInset,
        height: vars.toggleTrackHeight,
        width: vars.toggleTrackWidth,
        borderRadius: vars.toggleTrackRadius,
        background: vars.toggleTrackColor,
        boxShadow: vars.toggleTrackShadow,
      },

      'input:checked + div > [part=track]': {
        background: vars.toggleTrackOnColor,
      },

      '[part=knob]': {
        transition: vars.toggleTransition,
        height: vars.toggleKnobSize,
        width: vars.toggleKnobSize,
        borderRadius: vars.toggleKnobRadius,
        top: 0,
        left: 0,
        position: 'absolute',
        background: vars.toggleOffColor,
        boxShadow: vars.toggleKnobShadow,
      },

      'input:checked + div > [part=knob]': {
        left: `calc(${vars.toggleTrackWidth} + ${vars.toggleTrackInset200} - ${vars.toggleKnobSize})`,
        background: vars.toggleOnColor,
      },

      'input:not(:checked) + * + * > [name=on], input:checked + * + * > [name=off]':
        {
          display: 'none',
        },
    }

    setChecked = () => {
      const { input } = this.parts as { input: HTMLInputElement }
      this.value = input.checked
    }

    toggleChecked = (event: KeyboardEvent) => {
      if (!this.disabled && event.code === 'Space') {
        this.value = !this.value
        event.preventDefault()
        event.stopPropagation()
        this.queueRender(true)
      }
    }

    content = () =>
      label(
        input({
          hidden: true,
          type: 'checkbox',
          part: 'valueHolder',
        }),
        div(
          { part: 'container' },
          div({ part: 'track' }),
          div({ part: 'knob' })
        ),
        div(slot({ name: 'on' }), slot({ name: 'off' }))
      )

    connectedCallback() {
      super.connectedCallback()

      this.value = this.hasAttribute('checked')
      this.parts.valueHolder.addEventListener('change', this.setChecked)
      this.addEventListener('keydown', this.toggleChecked)
      this.setAttribute('tabindex', '0')
    }

    role = 'checkbox'

    render() {
      super.render()

      const { valueHolder } = this.parts as ToggleParts
      valueHolder.checked = this.value
      this.toggleAttribute('checked', this.value)
    }
  }

  return {
    type: WebComponent as typeof Component,
    styleSpec: {
      ':root': {
        _toggleTrackColor: 'lightgray',
        _toggleTrackOnColor: vars.toggleTrackColor,
        _toggleOffColor: 'gray',
        _toggleOnColor: 'limegreen',
        _toggleKnobSize: '24px',
        _toggleKnobRadius: vars.toggleKnobSize50,
        _toggleTransition: 'ease-in-out 0.2s',
        _toggleTrackWidth: '32px',
        _toggleTrackInset: '8px',
        _toggleTrackHeight: `calc(${vars.toggleKnobSize} - ${vars.toggleTrackInset200})`,
        _toggleTrackRadius: vars.toggleTrackHeight50,
        _toggleDisabledOpacity: '0.5',
        _toggleKnobShadow:
          'inset 0 1px 1px #fff8, inset 0 -1px 1px #0004, 0 2px 4px #0006',
        _toggleTrackShadow: 'inset 0 1px 2px #0004',
        _toggleGap: '8px',
      },
      ':host[disabled]': {
        pointerEvents: 'none',
        opacity: vars.toggleDisabledOpacity,
      },
    },
  }
}

export default blueprint
