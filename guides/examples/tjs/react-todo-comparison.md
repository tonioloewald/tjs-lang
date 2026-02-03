<!--{"section": "tjs", "type": "example", "group": "unbundled", "order": 0}-->

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
