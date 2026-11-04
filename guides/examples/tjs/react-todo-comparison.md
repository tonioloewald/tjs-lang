<!--{"section": "tjs", "type": "example", "group": "unbundled", "order": 0, "parent": "tjs-unbundled.md"}-->

# React Todo (Comparison)

React todo app for comparison with the tosijs version. This would be easier with JSX, but we're not supporting JSX build magic (yet).

```javascript
import { useState, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'

// Without JSX, we use createElement (aliased as h for brevity)
// h(type, props, ...children)

function TodoApp() {
  const [items, setItems] = useState(['bathe the cat', 'buy milk'])
  const [newItem, setNewItem] = useState('')

  const addItem = () => {
    if (newItem !== '') {
      setItems([...items, newItem])
      setNewItem('')
    }
  }

  return h(
    'div',
    null,
    h('h1', null, 'To Do'),
    h(
      'ul',
      null,
      items.map((item, i) => h('li', { key: i }, item))
    ),
    h(
      'label',
      null,
      'New item',
      h('input', {
        placeholder: 'enter thing to do',
        value: newItem,
        onChange: (e) => setNewItem(e.target.value),
      }),
      h(
        'button',
        {
          disabled: !newItem,
          onClick: addItem,
        },
        'Add'
      )
    )
  )
}

const root = document.createElement('div')
root.setAttribute('id', 'root')
document.body.append(root)
createRoot(root).render(h(TodoApp))
```

<!-- TODO review -->
## Why this page exists

This is the yardstick for the next chapter, [tosijs Todo App](/tosijs-todo/). Both programs
do the same thing: show a list, let the user type a new item, add it on a button press, and
disable the button while the input is empty. Read them side by side and count what each one
asks you to manage.

<!-- TODO review -->
## What to notice

- **State lives inside a function that runs again and again.** `useState` gives `TodoApp` a
  value and a setter, and every keystroke calls `setNewItem`, which re-runs the whole
  function and rebuilds the element tree for React to diff. Correctness depends on the
  rules of hooks: the calls must happen in the same order on every render.
- **Updates must be immutable.** `setItems([...items, newItem])` copies the array, because
  React decides what changed by comparing references. `items.push(newItem)` would mutate the
  state in place, React would see the same array, and nothing would re-render.
- **The input is "controlled".** Its `value` comes from state and every change goes through
  `onChange` back into state. That round trip is the price of keeping the DOM and the data
  in agreement.
- **Lists need keys.** `{ key: i }` tells React which `<li>` is which between renders. Using
  the index works here because items are only ever appended; it misbehaves once items can
  be removed or reordered.
- **No JSX means `createElement`.** JSX is a build-time syntax. In an unbundled page the
  calls have to be written out, which is what makes the nesting above hard to read.

The tosijs version replaces all five of these with bindings: state is an ordinary object,
`push` works, the input is bound to a path rather than controlled through a callback, and the
list is bound to an array.

<!-- TODO review -->
## Limits of the comparison

- **This page's code is plain JavaScript**, not TJS, and it is shown as a listing rather than
  run on this page: it needs React from a CDN and a DOM to render into. It runs in the
  [playground](https://tjs-platform.web.app).
- **It is a small app.** React's model pays for itself in large teams and large component
  trees; the point here is narrower. For a page you want to ship without a build step, the
  ceremony is real, and it is all visible in forty lines.
