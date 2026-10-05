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
