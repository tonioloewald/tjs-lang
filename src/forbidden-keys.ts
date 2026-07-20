/**
 * Property names that enable prototype pollution. Blocked everywhere a guest or
 * a payload can name a key or a variable: the VM's member-access and scope-write
 * guards (`src/vm/runtime.ts`), the dictionary-default emitter's key census
 * (`src/lang/emitters/js.ts`), and the linter's excess-key rule
 * (`src/lang/linter.ts`) all derive from this one list — a security-critical
 * constant with a single source. Zero imports so it's safe in every bundle.
 */
export const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype'] as const

/** The same set, for `.has()` membership checks. */
export const FORBIDDEN_KEYS_SET: ReadonlySet<string> = new Set(FORBIDDEN_KEYS)
