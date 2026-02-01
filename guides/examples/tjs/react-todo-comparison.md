<!--{"section": "tjs", "type": "example", "group": "unbundled", "order": 0}-->

# React Todo (Comparison)

React todo app for comparison - requires bundler, JSX transpilation.

```javascript
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'

function TodoApp() {
  const [items, setItems] = useState(['bathe the cat', 'buy milk'])
  const [newItem, setNewItem] = useState('')

  const addItem = () => {
    if (newItem !== '') {
      setItems([...items, newItem])
      setNewItem('')
    }
  }

  return (
    <div>
      <h1>To Do</h1>
      <ul>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
      <label>
        New item
        <input
          placeholder="enter thing to do"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
        />
        <button disabled={!newItem} onClick={addItem}>
          Add
        </button>
      </label>
    </div>
  )
}

const root = document.createElement('div')
root.setAttribute('id', 'root')
document.body.append(root)
createRoot(root).render(<TodoApp />)
```
