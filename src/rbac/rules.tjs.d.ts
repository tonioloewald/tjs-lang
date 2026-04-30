// Ambient declarations for rules.tjs. The bun plugin (bunfig.toml)
// transpiles .tjs at runtime; tsc needs explicit names to resolve the
// `from './rules.tjs'` imports in index.ts.
export function evaluateAccessShortcut(accessRule: any, context: any): any
export function selectAccessRule(rule: any, context: any): any
export function validateSchema(schema: any, data: any): any
export function interpretRuleResult(result: any): any
export function hasRoleLevel(userRoles: any, requiredRole: any): any
export function buildRuleContext(options: any): any
