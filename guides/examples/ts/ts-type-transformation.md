<!--{"section": "ts", "type": "example", "group": "intro", "order": 3, "parent": "ts-intro.md"}-->

# Type Transformation

See how TypeScript types become TJS examples

```ts
// TypeScript type syntax -> TJS example syntax
//
// TypeScript:          TJS:
// name: string    ->   name: ''
// count: number   ->   count: 0
// flag: boolean   ->   flag: true
// items: string[] ->   items: ['']
// ): string       ->   -> ''

function processData(
  name: string,
  count: number,
  active: boolean,
  tags: string[]
): string {
  return `${name}: ${count} items, active=${active}, tags=[${tags.join(', ')}]`
}

console.log(processData('Test', 42, true, ['a', 'b', 'c']))
```
