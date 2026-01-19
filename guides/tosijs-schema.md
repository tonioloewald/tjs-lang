# Context: Working with `tosijs-schema`

You are an expert in `tosijs-schema`, a lightweight, schema-first, LLM-native replacement for Zod. Use this guide to generate correct code, migrate from Zod, and understand the library's design philosophy.

## 1. Core Philosophy & Design

- **Schema-First:** The primary artifact is a standard JSON Schema object. `tosijs-schema` is a fluent API to generate these schemas.
- **LLM-Native:** The generated schemas are optimized for LLM consumption (cleaner, flatter, fewer tokens than Zod-to-JSON-Schema adapters).
- **Strict by Default:** Objects automatically set `additionalProperties: false` and mark all keys as `required` to satisfy OpenAI Structured Output requirements out-of-the-box.
- **Performance:** Uses "Ghost Constraints" for expensive checks (like `maxProperties` on large objects) and a "prime-jump" strategy for validating large arrays in O(1) time.
- **Validation Separation:** Separates "Is this valid?" (fast, boolean return) from "Why is it invalid?" (detailed debugging).

## 2. Basic Setup & Syntax

### Imports

```typescript
import { s, type Infer } from 'tosijs-schema'
```

### Defining Schemas

Use the `s` proxy to define schemas. The syntax is property-based and chainable.

```typescript
const UserSchema = s.object({
  id: s.string.uuid, // Format shorthand
  username: s.string.min(3).max(20), // Chainable constraints
  email: s.email, // First-class email type (no .string wrapper needed)
  age: s.integer.min(0).optional, // Optional integer
  tags: s.array(s.string).min(1), // Array with constraints
  role: s.enum(['admin', 'user']), // Enums
  meta: s.record(s.string), // Record/Dictionary
})
```

### Type Inference

Inference works similarly to Zod but exports `Infer` directly.

```typescript
type User = Infer<typeof UserSchema>
```

### Accessing the JSON Schema

You can access the raw JSON schema object via the `.schema` property.

```typescript
console.log(UserSchema.schema)
// Outputs standard JSON Schema object: { type: "object", properties: { ... } }
```

## 3. Validation API

**Crucial Difference from Zod:**

- `tosijs-schema` validation is optimized for speed and returns a **boolean** by default.
- It does **not** throw errors or return a parsed object like Zod's `.parse()`.

```typescript
const data = { ... };

// Fast validation (returns true/false)
if (UserSchema.validate(data)) {
  // logic here
} else {
  // Handle invalid data
}
```

## 4. Migration Guide (Zod vs. tosijs-schema)

| Feature         | Zod (`z`)                  | tosijs-schema (`s`)                      |
| --------------- | -------------------------- | ---------------------------------------- |
| **String**      | `z.string()`               | `s.string`                               |
| **Email**       | `z.string().email()`       | `s.email` (First-class citizen)          |
| **UUID**        | `z.string().uuid()`        | `s.string.uuid` or `s.uuid`              |
| **Optional**    | `schema.optional()`        | `schema.optional` (Property, not method) |
| **Objects**     | `z.object({...})`          | `s.object({...})`                        |
| **Strict Mode** | `z.object({...}).strict()` | **Default** (No method needed)           |
| **Arrays**      | `z.array(schema)`          | `s.array(schema)`                        |
| **Enums**       | `z.enum(['a', 'b'])`       | `s.enum(['a', 'b'])`                     |
| **Unions**      | `z.union([a, b])`          | `s.union([a, b])`                        |
| **Inference**   | `z.infer<typeof T>`        | `Infer<typeof T>`                        |
| **Metadata**    | `.describe("...")`         | `.describe("...")` / `.title("...")`     |

## 5. Monadic Pipelines (`M`)

`tosijs-schema` includes a "Railway Oriented Programming" module for building type-safe tool chains. This is especially useful for **AI Agents**, ensuring that hallucinations or bad data are caught immediately at the source (Input vs Output) rather than cascading.

### 1. Guarded Functions (`M.func`)

Create functions that enforce schemas on both input and output.

```typescript
import { M, s } from 'tosijs-schema'

// M.func(InputSchema, OutputSchema, Implementation)
const getSize = M.func(s.string, s.number, (str) => {
  return str.length
})

// Usage:
const len = getSize('hello') // Returns 5
// getSize(123) // Throws SchemaError (Input mismatch)
```

### 2. Execution Contexts (`new M`)

Chain multiple functions together. The execution context handles error propagation automatically.

```typescript
const pipeline = new M({
  getSize,
  isEven: M.func(s.number, s.boolean, (n) => n % 2 === 0),
})

const result = pipeline
  .getSize('hello') // Output: 5
  .isEven() // Input: 5 -> Output: false
  .result() // Returns false | Error

// If any step fails schema validation, .result() returns the specific error.
```

## 6. Advanced Features

### Ghost Constraints

Constraints that are computationally expensive (O(N)) are documented in the schema but skipped by the runtime validator for performance (O(1)).

- **Example:** `.max(n)` on Objects/Records.
- `minProperties` is strictly validated.
- `maxProperties` is a "Ghost" constraint (documentation only).

### Metadata & LLM Optimization

Use metadata methods to enrich schemas for LLMs or OpenAPI docs without affecting runtime validation.

```typescript
const ApiKey = s.string
  .min(32)
  .describe("The user's secret API key") // standard JSON schema "description"
  .title('API Key')
  .default('sk-...')
```

### Date Handling

`tosijs-schema` treats dates as strings with format validation, aligning with JSON transport.

```typescript
const Timestamp = s.string.datetime // Validates ISO string format
```

## 6. Common Patterns & Gotchas

1. **Chaining Order:** Primitives (like `s.string`) start the chain. Constraints (`.min()`) and metadata (`.describe()`) follow. The `.optional` flag can be placed anywhere in the chain but usually goes last for readability.
2. **No Transformers:** Unlike Zod, `tosijs` is a pure validation/schema library. It does not "transform" data (e.g., string to number coercion) during validation.
3. **Strict Objects:** Remember that `s.object()` disallows unknown keys by default. If you need a flexible object, use `s.record()` or explicitly allow additional properties if the API supports it (though strict is preferred for LLM outputs).
4. **Tuples:** Use `s.tuple([s.string, s.number])` for fixed-length arrays.

## 7. Example: LLM Structured Output

When defining a response format for an LLM:

```typescript
const ResponseSchema = s.object({
  reasoning: s.string.describe('Step-by-step thinking process'),
  final_answer: s.string.describe('The concise final answer'),
  confidence: s.number
    .min(0)
    .max(1)
    .describe('Confidence score between 0 and 1'),
})

// Pass to LLM
const jsonSchema = ResponseSchema.schema
```
