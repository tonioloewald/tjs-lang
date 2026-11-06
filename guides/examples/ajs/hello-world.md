<!--{"section": "ajs", "type": "example", "group": "basics", "order": 0, "parent": "ajs-basics.md"}-->
<!-- TODO review -->

# Hello World

An AJS agent is a JavaScript-like function that a host program runs inside the sandboxed AJS
VM. The host passes it one object of inputs and gets back one object. Here is the smallest
complete one:

```ajs:inline
function greet({ name = 'World' }) {
  let message = `Hello, ${name}!`
  return { message }
}
```

Run with no arguments, as this page runs every example, it returns:

```text
{ message: 'Hello, World!' }      fuelUsed: under 1
```

Called with `{ name: 'Ada' }`, it returns `{ message: 'Hello, Ada!' }`.

## How a host runs it

AJS source is first **transpiled** to a JSON AST, and the VM then executes that AST. The host
does both steps and sets the budget:

```javascript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const { ast } = transpile(source)
const vm = new AgentVM()
const { result, fuelUsed, error } = await vm.run(ast, { name: 'Ada' }, { fuel: 1000 })
```

On this site the page plays the host: each `ajs` example is transpiled and run in place, with no
arguments.

## What to notice

- **One destructured object in.** `function greet({ name = 'World' })` takes a single object
  with named fields. `name = 'World'` makes `name` optional, with `'World'` as its default
  (write `name: 'World'` to make it required). Named fields are what let the VM check the input
  before the agent runs.
- **The default is also the input contract.** `'World'` is a string, so `name` must be a
  string. A call with `{ name: 42 }`, or with a key the agent does not declare
  (`{ name: 'Ada', extra: 1 }`), is refused before the agent runs:
  `Input validation failed: args do not match expected schema`. See
  [Input/Output Contract](../../../DOCS-AJS.md#inputoutput-contract).
- **One object out.** A file may also declare helper functions; the **last** function is the
  entry point, and it must return an object. `return message` would end the run with
  `Agent must return an object, got string`.
- **It cost fuel.** Fuel is the VM's unit of work. Every step is charged, and the host passes a
  `fuel` budget to `vm.run`; when the budget is used up, the run stops with an error. This agent
  used under 1 fuel. See [Fuel limits](fuel-limits.md).

## A variation: a template that is data

A template literal is fixed when you write the agent. When the template itself comes from
outside (an input, a stored setting, a model's output), use the `template` atom. An **atom** is
a built-in VM operation; atoms are the only operations an agent can call apart from its own
functions and a few builtins like `Math`, and each one declares named inputs. The
[Atom Reference](../../ajs-atoms.md) lists them.

```ajs:inline
function greet({ name = 'World', tmpl = 'Hello, {{name}}!' }) {
  let message = template({ tmpl, vars: { name } })
  return { message }
}
```

```text
{ message: 'Hello, World!' }      fuelUsed: about 2
```

Called with `{ name: 'Ada', tmpl: 'Hi {{name}}.' }`, it returns `{ message: 'Hi Ada.' }`.

An atom takes one object of named inputs, `template({ tmpl, vars })`. A positional call is
refused by the transpiler, so it never reaches the VM:
`template('Hello, {{name}}!', { name })` (refused) fails with
`'template' takes named arguments: write template({ name: value, … })`.

## Another variation: an array

An expression inside `${}` can call a method:

```ajs:inline
function greetAll({ names = ['Ada', 'Grace', 'Edsger'] }) {
  let greeting = `Hello, ${names.join(', ')}!`
  return { greeting, count: names.length }
}
```

```text
{ greeting: 'Hello, Ada, Grace, Edsger!', count: 3 }
```

## The gotcha

```javascript
let greeting = `Hello, ${names.join(', ')}!` // works
let greeting = `Hello, ${names}!` // refused when it runs
```

JavaScript would quietly turn the array into `Ada,Grace,Edsger`. AJS refuses to convert an array
or object to a string behind your back. The size of that conversion is not known until it has
already happened, so the VM cannot charge for it in advance, and every allocation in AJS is paid
for before it is made. Say which string you want.

The run does not throw. It returns an error value, and the host sees it in the result. A template
literal compiles to string concatenation, so the message talks about `+`:

```text
'+' needs a string, number, boolean or null, not an array — convert it explicitly
(e.g. arr.join(','), JSON.stringify(obj))
```
