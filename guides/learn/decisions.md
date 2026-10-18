<!--{"parent": "learn-to-program.md", "order": 4}-->

# Decisions

Every program so far has done the same thing every time. Real programs decide: if the user
is new, say welcome; if the number is too big, say so. This chapter is about making a program
choose what to do.

## `if`: only sometimes

`if` runs a block of code only when a condition is true. The condition goes in parentheses,
and the code to run goes in braces:

```tjs:inline {"view": "code"}
function advice(temperature: 0) {
  let message = 'Have a nice day.'
  if (temperature < 10) {
    message = 'Take a coat.'
  }
  return message
}

preview.append(advice(5))

test 'a coat when it is cold, not when it is warm' {
  expect(advice(5)).toBe('Take a coat.')
  expect(advice(20)).toBe('Have a nice day.')
}
```

`temperature < 10` is a comparison, so its value is `true` or `false` (chapter 2). When it is
true, the block runs and `message` changes; when it is false, the block is skipped. Change
`advice(5)` to `advice(25)` and watch the advice change.

## `else`: one or the other

`else` gives the other choice: what to do when the condition is false.

```tjs:inline {"view": "code"}
function describe(n: 0) {
  if (n % 2 == 0) {
    return `${n} is even`
  } else {
    return `${n} is odd`
  }
}

preview.append(describe(7))

test 'even and odd' {
  expect(describe(4)).toBe('4 is even')
  expect(describe(7)).toBe('7 is odd')
}
```

`%` gives the **remainder** after dividing: `7 % 2` is 1, because 7 is three 2s and 1 over.
An even number leaves no remainder. Notice that each branch can `return` straight away: once a
function returns, nothing after it runs.

## `else if`: more than two choices

Chain `else if` to test one condition after another. The first one that is true wins, and the
rest are skipped:

```tjs:inline {"view": "code"}
function grade(score: 0) {
  if (score >= 90) {
    return 'A'
  } else if (score >= 80) {
    return 'B'
  } else if (score >= 70) {
    return 'C'
  } else {
    return 'keep practising'
  }
}

preview.append(`85 earns ${grade(85)}`)

test 'grades' {
  expect(grade(95)).toBe('A')
  expect(grade(85)).toBe('B')
  expect(grade(70)).toBe('C')
  expect(grade(10)).toBe('keep practising')
}
```

The order matters. 95 is also at least 80, but the `score >= 90` test comes first, so it wins.
Try moving the `score >= 80` branch to the top and see which tests fail.

## Combining conditions

Three words build bigger conditions out of smaller ones:

- `&&` means **and**: both must be true.
- `||` means **or**: at least one must be true.
- `!` means **not**: it turns true into false and false into true.

```tjs:inline {"view": "code"}
function canRide(age: 0, height: 0) {
  return age >= 8 && height >= 120
}

preview.append(`An 8-year-old who is 130cm tall can ride: ${canRide(8, 130)}`)

test 'old enough AND tall enough' {
  expect(canRide(8, 130)).toBe(true)
  expect(canRide(8, 100)).toBe(false)
  expect(canRide(6, 130)).toBe(false)
}
```

## `given`: choosing by value

When the decision is "which of these values is it?", a chain of `else if`s gets long. `given`
lists the values instead. Each line names one or more values, then the block to run:

```tjs:inline {"view": "code"}
function kindOfDay(day: 'monday') {
  given day {
    'saturday', 'sunday' {
      return 'weekend'
    }
    'friday' {
      return 'almost the weekend'
    }
  } else {
    return 'a working day'
  }
}

preview.append(`Friday is ${kindOfDay('friday')}.`)

test 'days of the week' {
  expect(kindOfDay('sunday')).toBe('weekend')
  expect(kindOfDay('friday')).toBe('almost the weekend')
  expect(kindOfDay('tuesday')).toBe('a working day')
}
```

Exactly one block runs: the one whose value matches, or the `else` block when none does.
(Other languages have `switch` for this. It is easy to get wrong, so TJS gives you `given`.)

## Try it

A cinema charges children (under 12) 5, seniors (65 and over) 6, and everyone else 10. Write
`ticketPrice(age: 0)` and test all three prices, plus the edges: an 11-year-old, a
12-year-old, a 64-year-old and a 65-year-old. Edges are where decisions go wrong, so they are
where tests earn their keep.
