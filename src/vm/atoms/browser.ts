import { s } from 'tosijs-schema'
import { defineAtom } from '../runtime'

// --- Capabilities ---

export interface DomCapabilities {
  querySelector(selector: string): Element | null
  querySelectorAll(selector: string): NodeListOf<Element>
}

export interface StorageCapabilities {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

// --- Atoms ---

// dom.text
defineAtom(
  'domText',
  s.object({
    selector: s.string,
  }),
  s.string,
  async ({ selector }, ctx) => {
    const caps = ctx.capabilities.dom as DomCapabilities
    if (!caps) throw new Error("Capability Error: 'dom' is not available.")
    const el = caps.querySelector(selector)
    if (!el) throw new Error(`DOM: Element not found '${selector}'`)
    return el.textContent || ''
  },
  { docs: 'Get text content of a DOM element.', cost: 1 }
)

// dom.value
defineAtom(
  'domValue',
  s.object({
    selector: s.string,
  }),
  s.string,
  async ({ selector }, ctx) => {
    const caps = ctx.capabilities.dom as DomCapabilities
    if (!caps) throw new Error("Capability Error: 'dom' is not available.")
    const el = caps.querySelector(selector) as HTMLInputElement
    if (!el) throw new Error(`DOM: Element not found '${selector}'`)
    return el.value || ''
  },
  { docs: 'Get value of a form element.', cost: 1 }
)

// dom.click
defineAtom(
  'domClick',
  s.object({
    selector: s.string,
  }),
  undefined,
  async ({ selector }, ctx) => {
    const caps = ctx.capabilities.dom as DomCapabilities
    if (!caps) throw new Error("Capability Error: 'dom' is not available.")
    const el = caps.querySelector(selector) as HTMLElement
    if (!el) throw new Error(`DOM: Element not found '${selector}'`)
    el.click()
  },
  { docs: 'Click a DOM element.', cost: 1 }
)

// dom.input
defineAtom(
  'domInput',
  s.object({
    selector: s.string,
    value: s.string,
  }),
  undefined,
  async ({ selector, value }, ctx) => {
    const caps = ctx.capabilities.dom as DomCapabilities
    if (!caps) throw new Error("Capability Error: 'dom' is not available.")
    const el = caps.querySelector(selector) as HTMLInputElement
    if (!el) throw new Error(`DOM: Element not found '${selector}'`)
    el.value = value
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  },
  { docs: 'Input text into a form element.', cost: 1 }
)

// localstorage.get
defineAtom(
  'localStorageGet',
  s.object({
    key: s.string,
  }),
  s.string.optional,
  async ({ key }, ctx) => {
    const caps = ctx.capabilities.storage as StorageCapabilities
    if (!caps) throw new Error("Capability Error: 'storage' is not available.")
    return caps.getItem(key) ?? undefined
  },
  { docs: 'Get a value from LocalStorage.', cost: 1 }
)

// localstorage.set
defineAtom(
  'localStorageSet',
  s.object({
    key: s.string,
    value: s.string,
  }),
  undefined,
  async ({ key, value }, ctx) => {
    const caps = ctx.capabilities.storage as StorageCapabilities
    if (!caps) throw new Error("Capability Error: 'storage' is not available.")
    caps.setItem(key, value)
  },
  { docs: 'Set a value in LocalStorage.', cost: 1 }
)

// --- Default Browser Factory ---

export const createBrowserCapabilities = () => {
  if (typeof window === 'undefined') {
    throw new Error(
      "Cannot create browser capabilities: 'window' is undefined."
    )
  }
  return {
    dom: {
      querySelector: (s: string) => document.querySelector(s),
      querySelectorAll: (s: string) => document.querySelectorAll(s),
    },
    storage: {
      getItem: (k: string) => localStorage.getItem(k),
      setItem: (k: string, v: string) => localStorage.setItem(k, v),
    },
  }
}
