# TosiJS / XinJS Context & Best Practices

**TosiJS** (formerly **XinJS**) is a library for path-based state management, web components, and data binding.

## Core Concepts

### State Management

#### Evolution & Terminology

- **`tosi()`** (formerly `boxedProxy()`): The modern replacement. It wraps _all_ outputs (including primitives) in a `BoxedProxy`. This ensures consistent behavior where properties like `.xinValue` and `.xinPath` are always available.
- **`boxed`**: A `BoxedProxy` of the global state object.
- **`xin` / `xinProxy()`**: **Deprecated**. `xin` is the `XinProxy` of the global state object (returns bare values for non-objects), and `xinProxy` leaked implementation details, complicating TypeScript usage.

#### Usage (`tosi`)

Application state is managed via proxies created by `tosi()`.

```typescript
import { tosi, touch } from 'xinjs'

const _appState = {
  count: 0,
  user: { name: 'Foo' },
  items: [],
}

// Typed initialization pattern
const { app } = tosi({
  app: { ..._appState },
}) as unknown as { app: typeof _appState }
```

- **Access**: Accessing properties on the proxy returns the value. Objects/arrays return proxies. Primitives return a `BoxedProxy` (e.g., a String wrapper with proxy sugar).
- **TypeScript**: While `app.count = 1` works at runtime, TypeScript will flag the type mismatch (`BoxedProxy<number>` vs `number`). Use `app.count.xinValue = 1` to assign values cleanly without casting.
- **Unwrapping**: Use `xinValue(proxy)` (or `.xinValue` on BoxedProxies) to get the underlying value for comparison or assignment.
- **Path Extraction**: Use `xinPath(proxy)` to safely get the path string of a proxy.
- **Future (TosiJS 1.0.10+)**: `null` and `undefined` will also be boxed. New syntax sugar for `bindList` will allow passing type placeholders for full autocompletion support.
- **Observation**:
  - `observe(test: string | RegExp | ((path: string) => boolean), callback: (path: string) => void)`: Registers a listener that executes when a path matching `test` changes. It does _not_ track dependencies automatically or run immediately by default.
  - `proxy.prop.xinObserve(callback)`: Watches a specific path.
- **Manual Updates**: Use `touch('path.to.prop')` or `touch(proxy.path.to.prop)` to force observers to run if data was changed without going through the proxy.
  - **Integration**: Essential when modifying state via pre-existing or vanilla code that shouldn't depend on XinJS.
  - **Performance**: Useful for massive updates (e.g., huge arrays) where bypassing the proxy is beneficial. While XinJS queues changes efficiently, direct manipulation followed by a single `touch` allows for native API speed with large datasets (a technique derived from optimizing MapBox updates).
- **Vs MobX**: Unlike MobX, XinJS is non-invasive. You don't need to rewrite library code to make it reactive; you can simply wrap existing objects in a proxy or use `touch()` to signal changes from external code.

### View Composition (`elements`)

The `elements` object is a **Proxy** that generates `ElementCreator` factory functions on demand.

- **Tag Name Inference**: Accessing a property on `elements` returns a creator for the inferred tag name (camelCase to kebab-case, e.g., `elements.fooBar` produces `<foo-bar>` elements).
- **Typing**: Standard HTML tags (like `div`, `span`, `input`) return creators that produce correctly typed DOM elements (e.g., `HTMLDivElement`), ensuring TypeScript safety.
- **Efficiency**: Generates DOM nodes directly with minimal overhead, without the need for JSX or a Virtual DOM.

```typescript
import { elements } from 'xinjs'
const { div, h1, button, fooBar } = elements // fooBar creates <foo-bar>

const myView = () =>
  div(
    h1('Hello'),
    // Arguments (children and properties) can be mixed
    button('Click Me', { onClick: () => console.log('click') }),
    fooBar({ class: 'custom' })
  )
```

- **Flexible Arguments**: Children and buckets of properties can be passed in any order. Buckets are composed before application.
- **Property vs Attribute**: If `element.foo` is not `undefined`, it is treated as a property; otherwise, it is assumed to be an attribute.
  - **Dataset**: `dataSomeProp` maps to `element.dataset.someProp`.
  - **Boolean Attributes**: `true` sets the attribute (presence), `false` removes it (absence).
- **Events**: `on<Event>` properties (e.g., `onClick`) automatically create root-level event handlers. You can bind functions directly or proxied handlers (by path).
- **Styling**: The `style` property is strongly typed and supports all CSS features.
  - **Binding**: Supports implicit one-way binding. You can bind a value to a style property (e.g., `style: { width: app.width }`) or bind an object to `style`.
  - _Note_: You cannot currently bind to an actual stylesheet object.
- **Children**: Passing a proxy as a child (e.g., `h1(proxy.prop)`) creates a one-way text binding (shorthand for `h1(span({bindText: proxy.prop}))`).

### CSS Support

XinJS provides powerful proxies and utilities for working with CSS variables and colors.

#### CSS Variables (`vars` & `varDefault`)

The `vars` proxy maps camelCase properties to kebab-case CSS variables.

- **Access**: `vars.fooBar` → `var(--foo-bar)`
- **Scaling**: Suffixing a number scales the variable (percentage/factor).
  - `vars.gap50` → `calc(var(--gap) * 0.5)`
  - `vars.fontSize125` → `calc(var(--font-size) * 1.25)`
- **Defaults**: Use `varDefault` to provide fallbacks.
  - `varDefault.fooBar('10px')` → `var(--foo-bar, 10px)`

#### Colors (`Color`)

The `Color` class provides utilities for manipulating colors and generating CSS values.

- **Creation**: `Color.fromCss('#f00')`, `Color.fromHsl(0, 1, 0.5)`
- **Manipulation**:
  - `.opacity(0.5)`
  - `.inverse` (inverse color)
  - `.inverseLuminance` (high contrast for text)
  - `.mono` (monochrome)
  - `.blend(otherColor, ratio)`
- **Output**: `.html` (hex/rgba string), `.rgba`, `.hsla`

### Data Binding (`bind` / `bindValue`)

XinJS supports 2-way binding between state and DOM elements.

- **One-Way Binding**: Simply passing a proxy to an element property (e.g., `{ value: app.count }`) sets up a one-way binding. The property updates whenever the proxy changes.

- **Built-in Bindings**: Special syntax sugar attributes for `ElementCreator`:

  - `bindValue`: Binds `element.value`. Note: `bindValue: 'app.count'` (string path) is recommended over passing the proxy directly to avoid initialization ordering issues.
  - `bindText`: Binds `element.textContent`.
  - `bindEnabled` / `bindDisabled`: Binds boolean state to `element.disabled`.
  - `bindList`: Binds an array to child elements (see below).

- **Custom Bindings**: Define custom behavior directly in the attribute object.

  ```typescript
  bind: {
    value: app.someProp,
    binding: {
      toDOM(element, value) { ... },
      fromDOM(element) { return ... }
    }
  }
  ```

- **`bind()` function**: Manual binding (useful for logic outside `ElementCreator`).

  ```typescript
  import { bind } from 'xinjs'
  bind(element, 'app.count', {
    toDOM(el, value) {
      el.textContent = value
    },
  })
  ```

- **Lists (`bindList`)**: Extremely powerful array rendering.
  - **Structure**: The bound element must have exactly one child: a `<template>` element containing exactly one child element.
  - **Configuration**:
    - `value`: The proxy array (e.g., `proxy.path.to.things`).
    - `idPath` (optional): Property name for stable identity (like React `key`).
    - `virtual` (optional): Configuration for virtual lists/grids.
      ```typescript
      virtual: {
        height: 40,
        visibleColumns: 7, // Only necessary for grids
        rowChunkSize: 2, // Use to maintain stable nth-child row shading
      }
      ```
      _Note: Rows are virtual, but virtual columns are not yet implemented._
  ```typescript
  // assume ul and li are ElementCreators
  ul(
    {
      bindList: {
        value: app.items,
        idPath: 'id',
      },
    },
    template(li({ bindText: '^.caption' }))
  )
  ```
  `^` refers to the path of the current list item.

### Web Components (`Component`)

XinJS provides a `Component` class for creating Web Components with scoped styles and reactive rendering.

1.  **Definition**: Extend `Component<PartsMap>` and define a `content` method (returning an array of elements) and a static `elementCreator` factory.
2.  **Parts**: Define an interface for `this.parts` to access elements identified by the `part` attribute.
3.  **Attributes**: Initialize observed attributes in the constructor using `initAttributes`.
    - `initAttributes('foo')` makes `foo` observable; changes trigger a render.
    - Boolean attributes behave like standard HTML (presence/absence).
    - Uninitialized properties behave as standard class properties.
4.  **Styling & Shadow DOM**:
    - **Shadow DOM**: Define `styleSpec` as a static property on the class. Best for low-level "widgets" encapsulating structure. Heavier and harder to style.
    - **Light DOM**: Pass `styleSpec` to `elementCreator`. `:host` selectors are automatically replaced by the tag name. Generates a global stylesheet (ID `tag-name-component`). Easier to style/theme.
    - **Theming**: Use CSS variables for consistent theming. `varDefault` helper can be used in style specs (e.g. `padding: varDefault.buttonPadding('8px 12px')`).
5.  **Lifecycle & Features**:
    - **Render**: `super.render()` is mandatory.
    - **Updates**: `queueRender()` debounces updates. `queueRender(true)` triggers a `change` event.
    - **Input**: Assigning a `value` property makes the component behave like an `<input>` automatically.
    - **Resize**: Defining an `onResize` handler automatically adds a `ResizeObserver`.
6.  **ElementCreator**: Calling `Component.elementCreator` produces an `ElementCreator` factory function that is correctly typed for the Component subclass. It also registers the element immediately (required for hydration). Must export the creator. If the tag name is taken, a unique one is generated (with a warning), and `:host` styles are updated.
7.  **Shadow DOM Constraints**:
    - **Data Binding**: Standard XinJS data bindings (e.g., `bindValue`) _cannot_ be used inside the Shadow DOM because the elements are isolated. Updates must be handled manually in `render()`.
    - **Events**: Event handlers in `content()` work but must be bound to the component instance (e.g., use arrow functions or `.bind(this)`).

```typescript
import { Component, elements, PartsMap } from 'xinjs'
const { div, slot, button } = elements

interface MyParts extends PartsMap {
  counter: HTMLElement
}

class MyComponent extends Component<MyParts> {
  count = 0

  content = () => [
    div({ part: 'counter' }),
    button({ onClick: this.inc }, '+'),
    slot(),
  ]

  constructor() {
    super()
    this.initAttributes('count')
  }

  inc = () => {
    this.count++
    this.queueRender(true) // Trigger render and 'change' event
  }

  onResize() {
    console.log('resized') // Automatic ResizeObserver
  }

  render() {
    super.render() // Mandatory
    this.parts.counter.textContent = String(this.count)
  }
}

export const myComponent = MyComponent.elementCreator({
  tag: 'my-component',
  styleSpec: {
    ':host': { display: 'block', border: '1px solid #ccc' },
    ':host [part="counter"]': { fontSize: '2em' },
  },
})
// Note: This example uses Light DOM (styleSpec in elementCreator).
// A global stylesheet with ID "my-component-component" is created.
```

### Blueprints

[Official Documentation](https://tosijs.net/?blueprint-loader.ts)

Blueprints allow you to define components as pure functions (factories) that can be loaded from a CDN. They address several issues:

1.  **Decoupling**: Standard web components "suck in" the version of the library they are built with. Blueprints are dependency-free factories that use the consumer's version of TosiJS/XinJS at runtime.
2.  **Name Collisions**: The consumer chooses the tag name. While TosiJS handles name collisions gracefully, many frameworks do not. Blueprints allow you to avoid conflicts if multiple components want to use the same tag or if you want multiple versions of the same component.
3.  **Lazy Loading**: Not only can the blueprint itself be lazy-loaded from a CDN, but because the blueprint function can be `async`, it can also lazy-load its own dependencies dynamically.

#### Defining a Blueprint (`XinBlueprint`)

A blueprint is a function that takes a `tag` name and a `module` object (containing `Component`, `elements`, `vars`, etc.) and returns a packaged component definition.

```typescript
export type XinBlueprint = (
  tag: string,
  module: XinFactory
) => XinPackagedComponent
```

**Standard Component vs. Blueprint Example**

Instead of importing `Component` directly and defining a class:

```typescript
// Standard Component
import { Component, elements, varDefault } from 'xinjs'
const { h2, slot } = elements

export class MyThing extends Component {
  static styleSpec = {
    ':host': { color: varDefault.textColor('#222') },
  }
  content = () => [h2('my thing'), slot()]
}

export const myThing = MyThing.elementCreator({ tag: 'my-thing' })
```

You export a `XinBlueprint` function that receives dependencies:

```typescript
// Blueprint
import { XinBlueprint } from 'xinjs'

const blueprint: XinBlueprint = (
  tag,
  { Component, elements, vars, varDefault }
) => {
  const { h2, slot } = elements

  class MyThing extends Component {
    static styleSpec = {
      ':host': { color: varDefault.textColor('#222') },
    }
    content = () => [h2('my thing'), slot()]
  }

  return {
    type: MyThing,
    styleSpec: { _bgColor: '#f00' },
  }
}
export default blueprint
```

#### Consuming Blueprints

**Using `<xin-loader>`**

The `<xin-loader>` component facilitates parallel dynamic loading of blueprints.

```html
<xin-loader>
  <xin-blueprint
    tag="swiss-clock"
    src="https://loewald.com/lib/swiss-clock"
  ></xin-blueprint>
</xin-loader>
<!-- Component is available once loaded -->
<swiss-clock></swiss-clock>
```

- **`<xin-blueprint>` Attributes**:
  - `src`: URL of the blueprint module (required).
  - `tag`: The tag name to use (defaults to source file name if suitable).
  - `property`: The exported property name from the module (default: `default`).
  - `loaded`: (Read-only) The `XinPackagedComponent` after loading.
- **Callbacks**:
  - `blueprintLoaded(package)`: Method on `<xin-blueprint>` called when ready.
  - `allLoaded()`: Method on `<xin-loader>` called when all children are loaded.

**Programmatic Loading (`blueprintLoader`)**

`blueprintLoader` is the `ElementCreator` for `<xin-loader>`.

```typescript
import { blueprintLoader, blueprint } from 'xinjs'

document.body.append(
  blueprintLoader(
    {
      allLoaded() {
        console.log('All blueprints loaded')
      },
    },
    blueprint({
      tag: 'swiss-clock',
      src: 'https://tonioloewald.github.io/xin-clock/dist/blueprint.js',
    })
  )
)
```

**Manual Loading (`makeComponent`)**

`makeComponent` takes a tag and a blueprint function and generates the component class and creator.

```typescript
import { makeComponent } from 'xinjs'
import myThingBlueprint from './path/to/my-thing-blueprint'

makeComponent('different-tag', myThingBlueprint).then((packaged) => {
  document.body.append(packaged.creator())
})
```

## Common Patterns

### One-Way Data Flow (Hash Sync)

For state that syncs with the URL hash:

1.  **Init**: Initialize state from `parsedHash()`.
2.  **UI -> Hash**: UI components (`onChange`) update the hash directly (e.g., `updateHash({ t: 'Tab1' })`).
3.  **Hash -> State**: A global `hashchange` listener updates the app state proxy.
4.  **State -> UI**: UI components bind to the app state (e.g., `bindValue: 'app.tab'`) to reflect changes from the hash.

This avoids loops and ensures the URL is the source of truth.

### Event Bubbling & Performance

XinJS enforces a **single root event listener** pattern. All event binding in XinJS relies on events bubbling up to the document root.

- **Philosophy**: This design mirrors the predictable event behavior of systems like HyperCard, avoiding the inconsistent bubbling behavior often found in the DOM.
- **Performance & Safety**: By avoiding event listeners on individual elements, XinJS eliminates the risk of memory leaks caused by dangling event handlers on removed DOM elements.
- **Usage**: Since events bubble by default, a listener on a container (e.g., `onChange` on `tabSelector`) will receive events from its children (e.g., `localePicker`). Always check `event.target` to filter events if necessary.

```typescript
onChange(event) {
  // Check if event came from the component itself if necessary
  // or use specific event handling on children
}
```

### Debugging

- `window.xin = xin`, `window.boxed = boxed` can be exposed for console debugging.

## Troubleshooting

- **"V is not a function"**: Often due to minification obfuscating a missing export or undefined function call. Disable minification in build config to debug.
- **"app.prop not found"**: Check if you are accessing `.xinValue` on a primitive string. `xinValue(val)` is safer than `val.xinValue`.
- **State Resets**: If binding (`bindValue`) resets state to default on load, verify initialization order or switch to manual one-way binding + event handling.

## Co-existing with React

XinJS can coexist seamlessly with React, simplifying state management and facilitating gradual migration.

### React Integration (`useXin`)

You can sync React components with XinJS state using a custom hook. This allows React components to re-render automatically when the underlying `tosi` proxy changes.

**`useXin.ts` Hook Implementation:**

```typescript
import { useState, useEffect } from 'react'
import { xin, observe, unobserve, xinPath, XinTouchableType } from 'xinjs'

type HookType<T> = [value: T, setValue: (newValue: T) => void]

export function useXin<T>(
  observed: XinTouchableType,
  initialValue: T
): HookType<T> {
  const path = typeof observed === 'string' ? observed : xinPath(observed)
  // ... validation ...
  const [value, update] = useState(
    xin[path] !== undefined ? xin[path] : initialValue
  )
  useEffect(() => {
    const observer = () => update(xin[path])
    const listener = observe(path, observer)
    return () => unobserve(listener)
  })
  return [
    value,
    (val) => {
      xin[path] = val
    },
  ]
}
```

**Usage in React Component:**

```typescript
const [user, setUser] = useXin(app.user, { name: '' })
```

### Migration Strategy

- **State First**: Move state to XinJS proxies (`tosi`) while keeping views in React. This often simplifies state logic compared to Redux or Context API.
- **Routing**: Use a navigation proxy to bridge React Router and XinJS routing (e.g., using `link.ts` custom element alongside React routes). This reconciles multiple sources of truth during the transition.

## Development Checklist for AI Agents

1.  **Imports:** Use `xinjs` for core functionality (`Component`, `elements`, `tosi`, `PartsMap`, `xinValue`, `touch`) and `xinjs-ui` for UI components.
2.  **Component Class:** Extend `Component<PartsMap>` and implement `content`.
3.  **Registration:** Use `MyComponent.elementCreator({ tag: '...', styleSpec: { ... } })` to register and export the component.
4.  **State:** Use `tosi` for state proxies with explicit typing for TypeScript support. Use `xinValue` when needing raw values.
5.  **Bindings:** Use string paths (e.g., `bindValue: '^.someProp'`) for data binding in lists or `bindValue: 'app.somePath'` for global state to avoid initialization loops.
6.  **Parts:** Define a `PartsMap` interface and access named elements via `this.parts`.
