import { defineAtom, resolveValue, type RuntimeContext } from '../runtime'
import { s } from 'tosijs-schema'

export const regexMatch = defineAtom(
  'regexMatch',
  s.object({
    pattern: s.string,
    value: s.any,
  }),
  s.boolean,
  async ({ pattern, value }, ctx: RuntimeContext) => {
    const resolvedValue = resolveValue(value, ctx)
    const p = new RegExp(pattern)
    return p.test(resolvedValue)
  },
  {
    docs: 'Returns true if the value matches the regex pattern.',
    cost: 2,
  }
)
