import { AgentVM, ajs } from './src/index'
import { procedureStore } from './src/vm/runtime'

const vm = new AgentVM()
procedureStore.clear()

const subAgent = ajs`
  function greet({ name }) {
    return { greeting: 'Hello, ' + name + '!' }
  }
`

console.log('subAgent AST:', JSON.stringify(subAgent, null, 2))

const storeAgent = ajs`
  function store({ ast }) {
    let token = storeProcedure({ ast })
    return { token }
  }
`

const run = async () => {
  const { result: storeResult } = await vm.run(storeAgent, { ast: subAgent })
  console.log('Token:', storeResult.token)

  // Try calling the token directly
  const directResult = await vm.run(storeResult.token, { name: 'Direct' })
  console.log('Direct call result:', directResult.result)
  console.log('Direct call state:', directResult)

  // Try via agentRun with trace
  const callerAgent = ajs`
    function callIt({ token, name }) {
      let result = agentRun({ agentId: token, input: { name } })
      return result
    }
  `
  console.log('callerAgent AST:', JSON.stringify(callerAgent, null, 2))

  const { result, error, trace } = await vm.run(callerAgent, { token: storeResult.token, name: 'World' }, { trace: true })
  console.log('agentRun result:', result)
  console.log('agentRun error:', error)
  console.log('Last few trace events:', trace?.slice(-3))
}
run()
