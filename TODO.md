# TJS-Lang TODO

## Playground - Error Navigation
- [ ] Test errors: click should navigate to source location
- [ ] Console errors: click should navigate to source location
- [ ] Error in imported module: click through to source

## Playground - Module Management
- [ ] Import one example from another in playground
- [ ] Save/Load TS examples (consistency with TJS examples)
- [ ] File name should be linked to example name
- [ ] New example button in playground
- [ ] UI for managing stored modules (browse/delete IndexedDB)
- [ ] Auto-discover and build local dependencies in module resolution

## Language Features
- [ ] SafeFunction - AJS Function constructor exposed to TJS
- [ ] Linter: flag eval() and new Function() as errors unless unsafe block
- [ ] Sync (non-async) gas-limited AJS VM for fast predicates
- [ ] Inline WASM for TJS

## Editor
- [ ] Embedded AJS syntax highlighting

## Documentation / Examples
- [ ] Create an endpoint example

## Infrastructure
- [ ] Make playground components reusable for others
- [ ] Web worker for transpiles (freezer - not needed yet)
