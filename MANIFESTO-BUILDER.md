<!--{"section": "meta", "order": 1, "navTitle": "For Builders"}-->

# Applied Laziness: The "Zero-Infrastructure" Stack

**Stop building pipelines. Start shipping logic.**

---

## The Problem

You wanted to build a feature. Instead you're debugging webpack configs, waiting for Docker builds, and wondering why your TypeScript types don't match reality.

The modern stack has become a tax on productivity. Every "improvement" adds another layer of indirection, another config file, another thing that can break.

---

## The TJS Win

**"I write the type as an example, and I get validation, documentation, and autocomplete for free."**

TJS flips the script on types. Instead of describing what a value *could* be, you show what it *looks like*:

```typescript
// TypeScript: describe the abstract shape
function greet(name: string): string

// TJS: show a concrete example
function greet(name: 'World') -> '' { return `Hello, ${name}!` }
```

The type *is* the example. The example *is* the documentation. One thing, not three.

### What You Stop Doing

- **No webpack config to debug.** The browser is the compiler.
- **No TypeScript errors about missing `.d.ts` files.** Types survive to runtime.
- **No "works on my machine."** Browser is the single source of truth.
- **No rebuild cycles.** Edit, save, see.

### What You Start Doing

- Write code in the browser or your editor
- Save it
- It runs

That's it. No build server. No bundler. No transpilation step. The loop is: write → run.

### The "Oops, It's Robust" Moment

Here's the happy accident: you left Safe Mode on.

You didn't write validation logic. You didn't write `if (x == null) throw`. You just wrote `function add(x: 0)`.

Because you left Safe Mode on, your function now automatically rejects bad inputs with a clean, traceable report:

```javascript
{
  $error: true,
  message: "Expected 'number', got 'banana'",
  path: "add.input.x"
}
```

You accidentally built an enterprise-grade API while prototyping.

**This is the physics change:** In every other language, a type error at runtime is a catastrophe—uncaught exception, stack trace, 500 server error. In TJS Safe Mode, a type error is just *data*. You trace the error to the *source* (the caller), not the *symptom* (the crash).

| Mode | Behavior | The "Oops" Factor |
|------|----------|-------------------|
| **Unsafe (`!`)** | "Trust me, bro." Fast, loose. | You write tests to catch edge cases. |
| **Safe (`?`)** | The Contract. Inputs validated, outputs guaranteed. | "I forgot to turn it off, and now my API is bulletproof." |

Laziness = Quality. You did less work (no validation code), got a better result (robust contracts).

---

## The AJS Win

**"I don't deploy microservices. I save AJS records to Postgres. My 'deployment' takes 10ms."**

AJS compiles to JSON. Your agent *is* a database record:

```sql
INSERT INTO agents (name, logic) VALUES (
  'summarize-article',
  '{"$seq": [{"$op": "httpFetch", ...}, {"$op": "llmPredict", ...}]}'
);
```

Want to update the agent? Update the row. Want to A/B test? Query different rows. Want to audit what changed? `git diff` the JSON.

### What You Stop Doing

- **No deploying microservices.** One endpoint runs any agent.
- **No managing containers.** The VM is a function call.
- **No CI/CD pipelines for logic changes.** Logic is data.
- **No cold starts.** The endpoint is always hot.

### What You Start Doing

- Store agents as JSON in your database
- Load and run them on demand
- Ship new logic by inserting rows

Your "deployment" is a database write. Your "rollback" is loading the previous row.

---

## The Stack You Delete

| Before | After |
|--------|-------|
| TypeScript | TJS |
| Webpack / Vite / Babel | Browser |
| `node_modules` (300MB) | Import URLs |
| Source maps | Direct execution |
| Build server | Nothing |
| Microservices | One endpoint |
| Docker / K8s | A function call |
| CI/CD for logic | Database write |

---

## The Vibe

This isn't about doing less work. It's about doing *the right* work.

Every hour you spend debugging build tools is an hour you're not shipping features. Every deployment pipeline you maintain is cognitive overhead you carry forever.

TJS and AJS are opinionated about one thing: **the fastest path from idea to running code wins.**

- Types should validate themselves
- Code should run where you write it
- Logic should travel as data
- Deployment should be instant

If your stack disagrees, your stack is wrong.

---

## Who This Is For

- **The solo dev** who doesn't have time for infrastructure theater
- **The startup** that needs to ship features, not manage K8s
- **The AI builder** whose agents need to evolve faster than deploy cycles allow
- **The pragmatist** who knows that the best infrastructure is no infrastructure
- **The TypeScript dev** who doesn't care about TJS but wants the tooling (see below)

---

## For TypeScript Developers Who Don't Care About TJS

You're happy with TypeScript. You don't want a new language. Fine.

You can still use TJS tooling for one thing: **inline tests that live with your code.**

```typescript
// mymath.ts - normal TypeScript
function add(a: number, b: number): number {
  return a + b
}

/*test 'adds positive numbers' {
  expect(add(2, 3)).toBe(5)
}*/

/*test 'handles negatives' {
  expect(add(-1, 1)).toBe(0)
}*/
```

The `/*test ... */` comments survive TypeScript compilation. TJS extracts and runs them.

### What You Get

- **Literate programming.** Tests live next to the code they verify.
- **Faster debug loops.** No switching between files.
- **Private tests.** They're comments—they don't ship to production.
- **Zero buy-in.** Keep your tsconfig, your build, your everything.

### How It Works

```typescript
import { extractTests, testUtils } from 'tjs-lang'

// Read your compiled JS (or TS source)
const source = fs.readFileSync('mymath.js', 'utf-8')

// Extract tests from comments
const { tests, testRunner } = extractTests(source)

// Run them
const result = eval(source + '\n' + testUtils + '\n' + testRunner)
// { passed: 2, failed: 0 }
```

That's it. You don't adopt TJS. You don't change your types. You just get inline tests for free.

Set `safety none` and keep living in your world. We're not here to convert you.

---

## Quick Start

```bash
npm install tjs-lang
```

```typescript
import { tjs, AgentVM } from 'tjs-lang'

// TJS: types as examples, runs in browser
const greet = tjs`
  function greet(name: 'World') -> '' {
    return 'Hello, ' + name + '!'
  }
`

// AJS: logic as data, runs in sandbox
const agent = ajs`
  function process({ url }) {
    let data = httpFetch({ url })
    return { fetched: data }
  }
`

const vm = new AgentVM()
const result = await vm.run(agent, { url: 'https://api.example.com' })
```

That's the whole stack. No config files. No build step. No deployment.

---

## Learn More

- [TJS Documentation](DOCS-TJS.md) — The language reference
- [AJS Documentation](DOCS-AJS.md) — The agent runtime
- [Enterprise Guide](MANIFESTO-ENTERPRISE.md) — For when you need governance
- [Playground](demo/) — Try it now, no install
