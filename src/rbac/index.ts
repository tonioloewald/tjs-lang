/*#
# RBAC Module

Role-Based Access Control with pluggable storage backends.

## Usage

```typescript
import { createRBAC } from 'tosijs/rbac'
import { createMemoryStore } from 'tosijs/store'

// Create RBAC with memory store (for testing)
const store = createMemoryStore()
const rbac = createRBAC(store)

// Set up a security rule
await rbac.setRule('posts', {
  read: 'all',
  create: 'authenticated',
  update: 'owner:authorId',
  delete: 'admin'
})

// Check access
const result = await rbac.check({
  uid: 'user123',
  roles: ['user'],
  method: 'read',
  collection: 'posts',
  docId: 'post1'
})

if (result.allowed) {
  // proceed
}
```
*/

import type { Store } from '../store/interface'

// Re-export pure logic functions
export {
  evaluateAccessShortcut,
  selectAccessRule,
  validateSchema,
  interpretRuleResult,
  hasRoleLevel,
  buildRuleContext,
} from './rules.js'

/**
 * Security rule definition
 */
export interface SecurityRule {
  /** Rule for read operations */
  read?: string | { code: string; fuel?: number }
  /** Rule for write operations (fallback for create/update) */
  write?: string | { code: string; fuel?: number }
  /** Rule for create operations */
  create?: string | { code: string; fuel?: number }
  /** Rule for update operations */
  update?: string | { code: string; fuel?: number }
  /** Rule for delete operations */
  delete?: string | { code: string; fuel?: number }
  /** Legacy: single code rule for all operations */
  code?: string
  /** Schema validation for writes */
  schema?: {
    required?: string[]
    properties?: Record<string, { type: string }>
  }
  /** Max fuel for AJS evaluation */
  fuel?: number
  /** Timeout for AJS evaluation */
  timeoutMs?: number
}

/**
 * Access check options
 */
export interface CheckOptions {
  uid?: string | null
  roles?: string[]
  method: 'read' | 'write' | 'delete'
  collection: string
  docId?: string | null
  doc?: Record<string, any> | null
  newData?: Record<string, any> | null
}

/**
 * Access check result
 */
export interface CheckResult {
  allowed: boolean
  reason?: string
  ruleType: 'shortcut' | 'schema' | 'code' | 'default' | 'error'
  evalTimeMs: number
}

/**
 * RBAC instance with store backend
 */
export interface RBAC {
  /** Check if an operation is allowed */
  check(options: CheckOptions): Promise<CheckResult>

  /** Set a security rule for a collection */
  setRule(collection: string, rule: SecurityRule): Promise<void>

  /** Get the security rule for a collection */
  getRule(collection: string): Promise<SecurityRule | null>

  /** Delete a security rule */
  deleteRule(collection: string): Promise<void>

  /** Load user roles from store */
  loadUserRoles(uid: string): Promise<string[]>
}

// Import the compiled rules module
import {
  evaluateAccessShortcut,
  selectAccessRule,
  validateSchema,
  buildRuleContext,
  interpretRuleResult,
} from './rules.js'

/**
 * Create an RBAC instance with a store backend
 */
export function createRBAC(store: Store): RBAC {
  // Cache for security rules
  const ruleCache = new Map<
    string,
    { rule: SecurityRule | null; timestamp: number }
  >()
  const CACHE_TTL = 60000 // 60 seconds

  async function getCachedRule(
    collection: string
  ): Promise<SecurityRule | null> {
    const cached = ruleCache.get(collection)
    const now = Date.now()

    if (cached && now - cached.timestamp < CACHE_TTL) {
      return cached.rule
    }

    const doc = await store.get('securityRules', collection)
    const rule = doc as SecurityRule | null
    ruleCache.set(collection, { rule, timestamp: now })
    return rule
  }

  return {
    async check(options: CheckOptions): Promise<CheckResult> {
      const startTime = performance.now()

      try {
        const rule = await getCachedRule(options.collection)

        // No rule = deny by default
        if (!rule) {
          return {
            allowed: false,
            reason: `No security rule for collection: ${options.collection}`,
            ruleType: 'default',
            evalTimeMs: performance.now() - startTime,
          }
        }

        // Build context
        const context = buildRuleContext({
          uid: options.uid,
          roles: options.roles,
          method: options.method,
          collection: options.collection,
          docId: options.docId,
          doc: options.doc,
          newData: options.newData,
        })

        // Select the appropriate access rule
        const accessRule = selectAccessRule(rule, context)

        // Schema validation for writes (run first - fail fast on bad data)
        if (options.method === 'write' && rule.schema && options.newData) {
          const schemaResult = validateSchema(rule.schema, options.newData)
          if (!schemaResult.valid) {
            return {
              allowed: false,
              reason:
                'Schema validation failed: ' + schemaResult.errors.join('; '),
              ruleType: 'schema',
              evalTimeMs: performance.now() - startTime,
            }
          }
        }

        // Try shortcut evaluation (fast path for simple rules)
        if (typeof accessRule === 'string') {
          const shortcutResult = evaluateAccessShortcut(accessRule, context)
          if (shortcutResult) {
            return {
              ...shortcutResult,
              ruleType: 'shortcut',
              evalTimeMs: performance.now() - startTime,
            }
          }
        }

        // If we get here and there's code, we'd need to evaluate it
        // For now, just return the schema-only result if applicable
        if (rule.schema && !rule.code && typeof accessRule !== 'object') {
          return {
            allowed: true,
            ruleType: 'schema',
            evalTimeMs: performance.now() - startTime,
          }
        }

        // Default deny if no rule matched
        return {
          allowed: false,
          reason: 'No matching access rule',
          ruleType: 'default',
          evalTimeMs: performance.now() - startTime,
        }
      } catch (error) {
        return {
          allowed: false,
          reason: `Rule evaluation error: ${error}`,
          ruleType: 'error',
          evalTimeMs: performance.now() - startTime,
        }
      }
    },

    async setRule(collection: string, rule: SecurityRule): Promise<void> {
      await store.set('securityRules', collection, rule)
      ruleCache.delete(collection) // Invalidate cache
    },

    async getRule(collection: string): Promise<SecurityRule | null> {
      return getCachedRule(collection)
    },

    async deleteRule(collection: string): Promise<void> {
      await store.delete('securityRules', collection)
      ruleCache.delete(collection)
    },

    async loadUserRoles(uid: string): Promise<string[]> {
      if (!uid) return []

      const user = await store.get('users', uid)
      if (!user) return []

      return (user as any).roles || []
    },
  }
}
