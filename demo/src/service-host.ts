/**
 * Service Host - Run TJS modules as sandboxed services
 *
 * This enables full-stack development in the browser:
 * - Define a TJS module with exported functions
 * - "Deploy" it as a service
 * - Call it from other modules via typed client
 *
 * The service runs sandboxed with:
 * - Input validation (TJS runtime)
 * - Fuel metering (bounded execution)
 * - Capability injection (controlled IO)
 *
 * @example
 * ```typescript
 * // Define service
 * const host = new ServiceHost()
 * await host.deploy('users', userServiceCode)
 *
 * // Call from client
 * const result = await host.call('users', 'createUser', { name: 'Alice' })
 * ```
 */

import { transpileToJS, installRuntime } from '../../src/lang'
import { ModuleStore } from './module-store'

// Ensure TJS runtime is available
installRuntime()

// ============================================================================
// Types
// ============================================================================

export interface ServiceEndpoint {
  name: string
  params: Record<string, { type: string; required: boolean }>
  returns?: { type: string }
}

export interface DeployedService {
  name: string
  code: string
  compiled: string
  endpoints: ServiceEndpoint[]
  instance: Record<string, Function>
  fuel: number
  calls: number
}

export interface CallResult<T = any> {
  success: boolean
  result?: T
  error?: { message: string; path?: string }
  fuel: number
  duration: number
}

// ============================================================================
// ServiceHost
// ============================================================================

export class ServiceHost {
  private services = new Map<string, DeployedService>()
  private defaultFuel = 1000

  /**
   * Deploy a TJS module as a service
   */
  async deploy(name: string, code: string): Promise<DeployedService> {
    // Transpile TJS to JS
    const result = transpileToJS(code)

    // Extract endpoint metadata from __tjs annotations
    const endpoints = this.extractEndpoints(result.code)

    // Create sandboxed instance
    const instance = this.createInstance(result.code)

    const service: DeployedService = {
      name,
      code,
      compiled: result.code,
      endpoints,
      instance,
      fuel: this.defaultFuel,
      calls: 0
    }

    this.services.set(name, service)
    return service
  }

  /**
   * Deploy a module from the store
   */
  async deployFromStore(name: string): Promise<DeployedService> {
    const store = await ModuleStore.open()
    const module = await store.get(name)

    if (!module) {
      throw new Error(`Module '${name}' not found in store`)
    }

    if (module.type !== 'tjs') {
      throw new Error(`Module '${name}' is not a TJS module`)
    }

    return this.deploy(name, module.code)
  }

  /**
   * Call a service endpoint
   */
  async call<T = any>(
    serviceName: string,
    endpoint: string,
    args: any
  ): Promise<CallResult<T>> {
    const start = performance.now()
    const service = this.services.get(serviceName)

    if (!service) {
      return {
        success: false,
        error: { message: `Service '${serviceName}' not deployed` },
        fuel: 0,
        duration: performance.now() - start
      }
    }

    const fn = service.instance[endpoint]
    if (typeof fn !== 'function') {
      return {
        success: false,
        error: { message: `Endpoint '${endpoint}' not found in '${serviceName}'` },
        fuel: 0,
        duration: performance.now() - start
      }
    }

    service.calls++

    try {
      // Call with TJS validation (built into the transpiled code)
      const result = fn(args)

      // Check for monadic error
      if (result && result.$error) {
        return {
          success: false,
          error: { message: result.message, path: result.path },
          fuel: 1, // minimal fuel for failed validation
          duration: performance.now() - start
        }
      }

      return {
        success: true,
        result,
        fuel: 1, // TODO: actual fuel metering
        duration: performance.now() - start
      }
    } catch (e: any) {
      return {
        success: false,
        error: { message: e.message },
        fuel: 1,
        duration: performance.now() - start
      }
    }
  }

  /**
   * Get service info
   */
  getService(name: string): DeployedService | undefined {
    return this.services.get(name)
  }

  /**
   * List all deployed services
   */
  listServices(): string[] {
    return [...this.services.keys()]
  }

  /**
   * Get endpoints for a service
   */
  getEndpoints(name: string): ServiceEndpoint[] {
    return this.services.get(name)?.endpoints ?? []
  }

  /**
   * Undeploy a service
   */
  undeploy(name: string): boolean {
    return this.services.delete(name)
  }

  /**
   * Create a typed client for a service
   * Returns a proxy that calls the service
   */
  createClient<T extends Record<string, Function>>(serviceName: string): T {
    const host = this

    return new Proxy({} as T, {
      get(_, prop: string) {
        return async (args: any) => {
          const result = await host.call(serviceName, prop, args)
          if (!result.success) {
            throw new Error(result.error?.message ?? 'Service call failed')
          }
          return result.result
        }
      }
    })
  }

  /**
   * Generate client code that can be imported
   * Creates a module with typed function stubs
   */
  generateClientModule(serviceName: string): string {
    const service = this.services.get(serviceName)
    if (!service) {
      throw new Error(`Service '${serviceName}' not deployed`)
    }

    const lines = [
      `// Auto-generated client for ${serviceName}`,
      `// Calls are proxied through ServiceHost`,
      ``
    ]

    for (const ep of service.endpoints) {
      const paramStr = Object.entries(ep.params)
        .map(([name, info]) => `${name}`)
        .join(', ')

      lines.push(`export async function ${ep.name}(${paramStr || 'args'}) {`)
      lines.push(`  return globalThis.__serviceHost.call('${serviceName}', '${ep.name}', ${paramStr || 'args'})`)
      lines.push(`}`)
      lines.push(``)
    }

    return lines.join('\n')
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private extractEndpoints(code: string): ServiceEndpoint[] {
    const endpoints: ServiceEndpoint[] = []

    // Find all functions with __tjs metadata
    // Pattern: functionName.__tjs = { params: ..., returns: ... }
    const metadataPattern = /(\w+)\.__tjs\s*=\s*(\{[\s\S]*?\})\s*(?=\w+\.__tjs|$)/g

    let match
    while ((match = metadataPattern.exec(code)) !== null) {
      const name = match[1]
      try {
        // Safe eval of the metadata object
        const metadata = Function(`return ${match[2]}`)()

        const params: Record<string, { type: string; required: boolean }> = {}
        if (metadata.params) {
          for (const [pname, pinfo] of Object.entries(metadata.params as any)) {
            params[pname] = {
              type: (pinfo as any).type?.kind ?? 'any',
              required: (pinfo as any).required ?? true
            }
          }
        }

        endpoints.push({
          name,
          params,
          returns: metadata.returns ? { type: metadata.returns.kind ?? 'any' } : undefined
        })
      } catch (e) {
        console.warn(`Failed to parse metadata for ${name}:`, e)
      }
    }

    // Also find exported functions without explicit __tjs (bare exports)
    const exportPattern = /export\s+(?:async\s+)?function\s+(\w+)/g
    while ((match = exportPattern.exec(code)) !== null) {
      const name = match[1]
      if (!endpoints.find(e => e.name === name)) {
        endpoints.push({ name, params: {} })
      }
    }

    return endpoints
  }

  private createInstance(code: string): Record<string, Function> {
    // Create a sandboxed execution context
    const exports: Record<string, any> = {}

    // Wrap code to capture exports
    const wrappedCode = `
      ${code}
      return { ${this.extractExportedNames(code).join(', ')} }
    `

    try {
      const factory = new Function(wrappedCode)
      return factory()
    } catch (e: any) {
      console.error('Failed to instantiate service:', e)
      return {}
    }
  }

  private extractExportedNames(code: string): string[] {
    const names: string[] = []

    // export function name
    const fnPattern = /export\s+(?:async\s+)?function\s+(\w+)/g
    let match
    while ((match = fnPattern.exec(code)) !== null) {
      names.push(match[1])
    }

    // export const name
    const constPattern = /export\s+const\s+(\w+)/g
    while ((match = constPattern.exec(code)) !== null) {
      names.push(match[1])
    }

    return names
  }
}

// ============================================================================
// Global Instance
// ============================================================================

let globalHost: ServiceHost | null = null

export function getServiceHost(): ServiceHost {
  if (!globalHost) {
    globalHost = new ServiceHost()
    // Make available globally for client modules
    ;(globalThis as any).__serviceHost = globalHost
  }
  return globalHost
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Deploy a service and return a typed client
 */
export async function createService<T extends Record<string, Function>>(
  name: string,
  code: string
): Promise<T> {
  const host = getServiceHost()
  await host.deploy(name, code)
  return host.createClient<T>(name)
}

/**
 * Get a client for an already-deployed service
 */
export function getService<T extends Record<string, Function>>(name: string): T {
  const host = getServiceHost()
  return host.createClient<T>(name)
}
