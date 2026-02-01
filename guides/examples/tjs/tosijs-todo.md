<!--{"section": "tjs", "type": "example", "group": "unbundled", "order": 1}-->

# tosijs Todo App

Unbundled todo app - runs directly in browser, no build step.

```tjs
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

document.body.append(
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
