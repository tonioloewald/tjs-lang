<!--{"section": "ajs", "type": "example", "group": "basics", "order": 0, "parent": "ajs-basics.md"}-->

# Hello World

Simple greeting with template

<!-- TODO review -->
The smallest complete agent: named input in, an object out. Every AJS program, however large,
has this shape, because agents are meant to be chained, and one agent's output becomes the next
one's input.

```ajs:inline
function greet({ name = 'World' }) {
  let message = template({ tmpl: 'Hello, {{name}}!', vars: { name } })
  return { message }
}
```

<!-- TODO review -->
## What to notice

- **One destructured object in.** `function greet({ name = 'World' })` takes a single object, and
  `name = 'World'` is the value used when the caller does not supply one. This page runs every
  example with no arguments, so you are seeing the defaults.
- **One object out.** The entry function must return an object. `return message` would fail with
  `Agent must return an object, got string`.
- **`template` is an atom, and atoms take named inputs.** `template({ tmpl, vars })` names each
  input. A positional call, `template('Hello, {{name}}!', { name })` (refused), is a transpile
  error that tells you what the atom takes, so it never reaches the VM.
- **It cost fuel.** The result line shows `fuelUsed`. Every step an agent takes is metered,
  including this one; a budget the host sets is what stops a runaway agent.

<!-- TODO review -->
## A variation

A template literal does the same job without an atom. It is ordinary JavaScript syntax, and an
expression inside `${}` can call a method:

```ajs:inline
function greetAll({ names = ['Ada', 'Grace', 'Edsger'] }) {
  let greeting = `Hello, ${names.join(', ')}!`
  return { greeting, count: names.length }
}
```

<!-- TODO review -->
## The gotcha

Write `${names.join(', ')}`, not `${names}`. JavaScript would quietly turn the array into
`Ada,Grace,Edsger`; AJS refuses to convert an array or object to a string behind your back,
because that conversion is work (and memory) the VM could not budget. Say which string you want.
