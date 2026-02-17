<!--{"section":"ajs","type":"example","group":"basics","order":2}-->

# Conditional Logic

If/else branching

```ajs
function checkAge({ age = 25 }) {
  if (age >= 18) {
    let status = 'adult'
    return { status, canVote: true }
  } else {
    let status = 'minor'
    return { status, canVote: false }
  }
}
```
