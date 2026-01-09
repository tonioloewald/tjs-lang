// Primary exports from new structure
export * from './lang'
export * from './vm/runtime'
export * from './vm/vm'
export * from './vm/atoms'
export * from './builder'
export * from './batteries'

// Legacy re-exports for backwards compatibility
// These will be removed in a future version
export * from './transpiler' // Re-exports from ./lang
export * from './runtime' // Re-exports from ./vm/runtime
export * from './vm' // Re-exports from ./vm/vm (note: this shadows above, but both point to same place)
export * from './atoms' // Re-exports from ./vm/atoms
