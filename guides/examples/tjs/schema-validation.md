<!--{"section":"tjs","type":"example","group":"patterns","order":8}-->

# Schema Validation

Using Schema for runtime type checking

```tjs
// TJS integrates with Schema for validation
import { Schema } from 'tosijs-schema'

// Define a schema
const UserSchema = Schema({
  name: 'anonymous',
  email: 'user@example.com',
  age: 0
})

// Validate data
function validateUser(data: { name: '', email: '', age: 0 }) -> { valid: true, errors: [''] } {
  const errors = []

  if (!UserSchema.validate(data)) {
    errors.push('Invalid user structure')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

validateUser({ name: 'Alice', email: 'alice@test.com', age: 30 })
```
