<!--{"section": "tjs", "type": "example", "group": "unbundled", "order": 1, "parent": "tjs-unbundled.md"}-->

# tosijs Todo App

Unbundled todo app - runs directly in browser, no build step.

```tjs:inline
import { elements, tosi } from 'tosijs'

const { todoApp } = tosi({
  todoApp: {
    items: ['bathe the cat', 'buy milk'],
    newItem: '',
    addItem() {
      if (todoApp.newItem !== '') {
        todoApp.items.push(String(todoApp.newItem))
        todoApp.newItem = ''
      }
    }
  }
})

const { h1, ul, template, li, label, input, button } = elements

// Render into the example's own box: the doc site gives an example a `preview` element (its
// page IS the doc page); the old playground ran each example in a page of its own.
const stage = typeof preview === 'undefined' ? document.body : preview
stage.append(
  h1('To Do'),
  ul(
    {
      bindList: {
        value: todoApp.items
      }
    },
    template(li({ bindText: '^' }))
  ),
  label(
    'New item',
    input({ placeholder: 'enter thing to do', bindValue: todoApp.newItem }),
    button({ bindEnabled: todoApp.newItem, onClick: todoApp.addItem }, 'Add')
  )
)
```

<!-- TODO review -->
## What problem this solves

A small interactive page should not need a toolchain. This app has no bundler, no JSX, no
`node_modules` and no build step: the TJS is transpiled in the page, and `tosijs` is
imported straight from a CDN. Compare it line for line with the
[React version](/react-todo-comparison/), which does the same job.

<!-- TODO review -->
## What to notice

- **State is a plain object.** `tosi({ todoApp: { … } })` registers the object and hands back
  a reactive view of it. `addItem` is an ordinary method on that object; there is no setter,
  no reducer and no hook.
- **Mutation is the update.** `todoApp.items.push(…)` changes the list, and the `ul` bound to
  `todoApp.items` updates. There is no "copy the array so the framework notices" step.
- **The DOM is built once and bound, not re-rendered.** `elements` provides one function per
  tag (`h1`, `ul`, `li`, …). `bindList` keeps the `ul` in step with the array, using the
  `template` for each row; `bindText: '^'` binds each `li` to its own item;
  `bindValue` ties the input to `todoApp.newItem` in both directions; `bindEnabled` disables
  the button while the text is empty.
- **The example draws into its own box.** On the doc site a live example gets a `preview`
  element; in the old playground each example had a page of its own. The `stage` line picks
  whichever exists, which is a useful habit for any example meant to run in both.

<!-- TODO review -->
## Gotchas

- **It needs a browser and the network.** `tosijs` is fetched from a CDN at run time, and the
  code appends elements to the page, so it cannot run under the command-line `tjs run`.
  How the playground resolves the bare `'tosijs'` import, and how to pick a different CDN,
  is the subject of [CDN Hints](/cdn-hints/).
- **Read values out as values.** `addItem` pushes `String(todoApp.newItem)`, a plain string
  taken from the current input, rather than the reactive reference itself, and then clears
  the input. Store data, not live bindings, in your lists.
- **This is tosijs, not TJS.** TJS is the language the page is written in; tosijs is a UI
  library that happens to suit unbundled pages. Nothing here requires TJS, and TJS does not
  require tosijs.
