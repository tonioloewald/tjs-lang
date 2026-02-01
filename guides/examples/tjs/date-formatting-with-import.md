<!--{"section":"tjs","type":"example","group":"patterns","order":9}-->

# Date Formatting (with import)

Uses date-fns for date formatting via ESM import

```tjs
/**
 * # Date Formatting with Imports
 *
 * This example demonstrates importing an external ESM module
 * (date-fns) and using it with TJS type safety.
 */

import { format, formatDistance, addDays, parseISO } from 'date-fns'

// Format a date with various patterns
function formatDate(date: '2024-01-15', pattern: 'yyyy-MM-dd') -> '' {
  const parsed = parseISO(date)
  return format(parsed, pattern)
}

// Get human-readable relative time
function timeAgo(date: '2024-01-15') -> '' {
  const parsed = parseISO(date)
  return formatDistance(parsed, new Date(), { addSuffix: true })
}

// Add days to a date
function addWorkdays(date: '2024-01-15', days: 5) -> '' {
  const parsed = parseISO(date)
  const result = addDays(parsed, days)
  return format(result, 'yyyy-MM-dd')
}

// Complex date operation with validation
function createEvent(input: {
  title: 'Meeting',
  startDate: '2024-01-15',
  durationDays: 1
}) -> { title: '', start: '', end: '', formatted: '' } {
  const start = parseISO(input.startDate)
  const end = addDays(start, input.durationDays)

  return {
    title: input.title,
    start: format(start, 'yyyy-MM-dd'),
    end: format(end, 'yyyy-MM-dd'),
    formatted: \`\${input.title}: \${format(start, 'MMM d')} - \${format(end, 'MMM d, yyyy')}\
```
