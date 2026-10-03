/**
 * The input CONTRACT of every core atom, as data: the input names it declares and which are required.
 * GENERATED from `coreAtoms` (`UPDATE_CORE_ATOM_INPUTS=1 bun test src/vm/core-atom-inputs.test.ts`),
 * which fails when the two disagree.
 *
 * A separate, dependency-free module so the AJS TRANSPILER can check an atom call's parameters
 * without importing the VM (Tonio, 2026-10-03: it is the transpiler's job to prevent code with bad
 * parameters; the VM runs an AST as written). Every core atom's schema is closed
 * (`additionalProperties: false`), so an input not listed here is an error.
 */
export interface AtomInputs {
  readonly keys: readonly string[] | null
  readonly required: readonly string[]
}

export const CORE_ATOM_INPUTS: Readonly<Record<string, AtomInputs>> = {
  Error: { keys: ['args'], required: [] },
  agentRun: { keys: ['agentId', 'input'], required: ['agentId', 'input'] },
  cache: { keys: ['key', 'steps', 'ttlMs'], required: ['key', 'steps'] },
  callLocal: { keys: ['name', 'args'], required: ['name', 'args'] },
  clearExpiredProcedures: { keys: [], required: [] },
  consoleError: { keys: ['message'], required: ['message'] },
  consoleLog: { keys: ['message'], required: ['message'] },
  consoleWarn: { keys: ['message'], required: ['message'] },
  constSet: { keys: ['key', 'value'], required: ['key', 'value'] },
  evaluate: { keys: ['value'], required: ['value'] },
  filter: {
    keys: ['items', 'as', 'condition'],
    required: ['items', 'as', 'condition'],
  },
  find: {
    keys: ['items', 'as', 'condition'],
    required: ['items', 'as', 'condition'],
  },
  hash: { keys: ['value', 'algorithm'], required: ['value'] },
  httpFetch: {
    keys: ['url', 'method', 'headers', 'body', 'responseType'],
    required: ['url'],
  },
  if: { keys: ['condition', 'then', 'else'], required: ['condition', 'then'] },
  join: { keys: ['list', 'sep'], required: ['list', 'sep'] },
  jsonParse: { keys: ['str'], required: ['str'] },
  jsonStringify: { keys: ['value'], required: ['value'] },
  keys: { keys: ['obj'], required: ['obj'] },
  len: { keys: ['list'], required: ['list'] },
  llmPredict: { keys: ['prompt', 'options'], required: ['prompt'] },
  map: {
    keys: ['items', 'as', 'steps', 'loop'],
    required: ['items', 'as', 'steps'],
  },
  memoize: { keys: ['key', 'steps'], required: ['key', 'steps'] },
  merge: { keys: ['a', 'b'], required: ['a', 'b'] },
  omit: { keys: ['obj', 'keys'], required: ['obj', 'keys'] },
  pick: { keys: ['obj', 'keys'], required: ['obj', 'keys'] },
  push: { keys: ['list', 'item'], required: ['list', 'item'] },
  random: { keys: ['min', 'max', 'format', 'length'], required: [] },
  reduce: {
    keys: ['items', 'as', 'accumulator', 'initial', 'steps'],
    required: ['items', 'as', 'accumulator', 'initial', 'steps'],
  },
  regexMatch: { keys: ['pattern', 'value'], required: ['pattern', 'value'] },
  releaseProcedure: { keys: ['token'], required: ['token'] },
  runCode: { keys: ['code', 'args'], required: ['code'] },
  scope: { keys: ['steps'], required: ['steps'] },
  seq: { keys: ['steps'], required: ['steps'] },
  split: { keys: ['str', 'sep'], required: ['str', 'sep'] },
  storeGet: { keys: ['key'], required: ['key'] },
  storeProcedure: { keys: ['ast', 'ttl', 'maxSize'], required: ['ast'] },
  storeQuery: { keys: ['query'], required: ['query'] },
  storeQueryWhere: {
    keys: ['predicate', 'collection', 'limit'],
    required: ['predicate'],
  },
  storeSet: { keys: ['key', 'value'], required: ['key', 'value'] },
  storeVectorSearch: {
    keys: ['collection', 'vector', 'k'],
    required: ['vector'],
  },
  template: { keys: ['tmpl', 'vars'], required: ['tmpl', 'vars'] },
  transpileCode: { keys: ['code'], required: ['code'] },
  try: { keys: ['try', 'catch', 'catchParam'], required: ['try'] },
  uuid: { keys: [], required: [] },
  varAssign: { keys: ['key', 'value'], required: ['key', 'value'] },
  varGet: { keys: ['key'], required: ['key'] },
  varSet: { keys: ['key', 'value'], required: ['key', 'value'] },
  varsExport: { keys: ['keys'], required: ['keys'] },
  varsImport: { keys: ['keys'], required: ['keys'] },
  while: { keys: ['condition', 'body'], required: ['condition', 'body'] },
  xmlParse: { keys: ['str'], required: ['str'] },
}
