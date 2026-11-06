<!--{"section": "ajs", "type": "example", "group": "api", "order": 9, "parent": "ajs-api.md"}-->
<!-- TODO review -->

# GitHub Repos

A research agent's first step: find the candidates and keep only what you need from each. This
one searches GitHub for repositories and returns names, stars and descriptions, most-starred
first.

```ajs:inline
function searchRepos({ query = 'tosijs', perPage = 5 }) {
  let url =
    'https://api.github.com/search/repositories?q=' +
    encodeURIComponent(query) +
    '&per_page=' +
    perPage +
    '&sort=stars'
  let response = httpFetch({ url })
  if (response.items == null) {
    return {
      total: 0,
      repos: [],
      error: response.message ?? 'unexpected response',
    }
  }
  let repos = response.items.map((x) => ({
    name: x.full_name,
    stars: x.stargazers_count,
    description: x.description,
  }))
  return { total: response.total_count, repos }
}
```

`httpFetch` is the built-in fetch atom. It returns the response body, parsed as JSON when the
server sends JSON. It does not return the HTTP status or a `Response` object. Besides `url` it
accepts `method`, `headers` and `body`; `httpFetch({ url, headers: { Accept: 'text/plain' } })`
is a valid call.

The agent's parameters are the run's arguments: the host passes an object such as
`{ query: 'language:rust', perPage: 10 }`, and the defaults apply to whatever it leaves out.

## What to notice

- **The query is encoded.** GitHub's search syntax uses spaces, `:` and `>`, so a query like
  `language:typescript stars:>1000` must go through `encodeURIComponent` to arrive intact.
- **The shape is checked before the `map`.** When GitHub refuses a search, it still answers
  with JSON, but with a `message` instead of `items`. For an empty query GitHub answers
  `{ "message": "Validation Failed", … }`, and the agent turns that into
  `{ total: 0, repos: [], error: 'Validation Failed' }`. Without the `if`, the agent would call
  `map` on `undefined` and the run would fail with `map: items is not an array`.
- **Both outcomes have the same shape.** Success and failure each return `total` and `repos`,
  and only a failure has `error`. A caller, or a model reading the result, checks for `error`.
- **The result is small on purpose.** GitHub returns dozens of fields per repository; the agent
  keeps three, plus the total match count. Everything passing between the agent and the host is
  copied as plain JSON data, so a smaller result is a smaller copy, and whatever the agent hands
  a model costs tokens.
- **The domain is allowed by the host.** The live examples on this site run with
  `context: { allowedFetchDomains: ['api.github.com', …] }`. In your own host you pass that
  yourself; the host code at the end of this page shows where.

## A variation

One repository's vital signs:

```ajs:inline
function repoInfo({ owner = 'tonioloewald', repo = 'tjs-lang' }) {
  let r = httpFetch({
    url:
      'https://api.github.com/repos/' +
      encodeURIComponent(owner) +
      '/' +
      encodeURIComponent(repo),
  })
  if (r.full_name == null) {
    return { error: r.message ?? 'not found' }
  }
  return {
    name: r.full_name,
    stars: r.stargazers_count,
    language: r.language,
    openIssues: r.open_issues_count,
  }
}
```

The owner and repository names are encoded too. A real GitHub name never needs it, but the
arguments come from whoever runs the agent, and a `repo` of `'x/../../users/someone'` would
otherwise point the request at a different endpoint.

A missing repository does not make `httpFetch` fail. GitHub answers 404 with a JSON body
(`{ "message": "Not Found", … }`), and, as above, `httpFetch` hands the agent that body, not the
status. With `repo: 'no-such-repo'` this agent returns `{ error: 'Not Found' }`. The `if` is how
you tell.

## The gotchas

- **Rate limits.** Without a token, GitHub allows about 60 requests an hour from one address,
  and search has its own, tighter limit of about 10 requests a minute. Past either limit it
  answers with `{ "message": "API rate limit exceeded for …" }` instead of data, which both
  examples above return as their `error`. If they stop returning results, that is why.
- **`openIssues` is not a bug count.** GitHub's `open_issues_count` counts open pull requests as
  well as open issues, so it is a rough measure of activity.
- **Never put a token in agent source.** Source is data: it is stored, logged, sent to models
  and passed around. A token written into an agent is a token published to everyone who handles
  that agent.

### Where the token goes instead

A host that needs authenticated requests puts the credential in its own `fetch` capability, a
function the host passes to `vm.run`. The agent calls `httpFetch` exactly as above. The VM checks
the request (the scheme, the method, the agent's headers against a fixed list, and the domain
against the allowlist) and then calls the capability with it, including any headers the agent
set. The capability adds the token on the way out, so the agent can use the token without ever
holding it. This sample is Node or Bun code (it reads `process.env`):

```javascript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const token = process.env.GITHUB_TOKEN
if (!token) throw new Error('GITHUB_TOKEN is not set')

// Called with the request after the VM's checks. Returns plain JSON data.
const githubFetch = async (url, { method, headers, body, signal }) => {
  const h = new Headers(headers)
  h.set('Accept', 'application/vnd.github+json')
  // set() replaces an Authorization header the agent sent, in any spelling
  h.set('Authorization', `Bearer ${token}`)
  const res = await fetch(url, {
    method,
    signal,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return res.json()
}

// agentSource: the repoInfo agent above, as a string
const agentSource = `function repoInfo({ owner = 'tonioloewald', repo = 'tjs-lang' }) { … }`

// Transpile on your side: vm-ast runs ASTs only. Passing the VM's atoms lets the
// transpiler check every atom call against the atom's declared inputs.
const vm = new AgentVM()
const { ast } = transpile(agentSource, { atoms: vm.atoms })
const run = await vm.run(
  ast,
  { owner: 'tonioloewald', repo: 'tjs-lang' }, // the agent's arguments
  {
    fuel: 1000, // the run's work budget; this agent uses about 7
    capabilities: { fetch: githubFetch }, // the IO functions the agent may reach
    context: { allowedFetchDomains: ['api.github.com'] }, // policy the VM enforces
  }
)

if (run.error) console.error(run.error.message)
else console.log(run.result) // { name: 'tonioloewald/tjs-lang', stars: …, … }
```

The two option bags do different jobs. `capabilities` holds the functions that do the IO.
`context` holds the run's policy, which the VM applies before any capability is called, so the
allowlist goes there and not inside your function. Fuel is the run's budget for work: each step
costs a little and a fetch costs 5, so 1000 is generous for one request. A 100-result search uses
about 26, because mapping more items is more work. See [Fuel Limits](/fuel-limits/).

What the allowlist does depends on which fetch the run uses:

- **The built-in fetch, no allowlist:** every request is refused with
  `Fetch blocked: no allowedFetchDomains configured`.
- **Your own `fetch`, no allowlist:** the VM does not check the destination. Your capability
  owns it, and this one would attach your token to whatever URL the agent chose.
- **Either fetch, with an allowlist:** a request to any other host fails with
  `Fetch blocked: domain not in allowlist` before your capability runs. Keep it.

If the capability throws, the agent sees an ordinary error: `try`/`catch` in the agent catches
it, and the caught value is the error's message as a string. Do not put anything secret in that
message. Without a `try`, the run ends with that message as its `error`. This sample does not
check `res.ok`, because GitHub's error responses are JSON bodies the agents above already handle;
a capability for an API that answers errors with HTML should check the status and return or
throw something the agent can read.

Return data, not the `Response`. A live host object cannot cross into the agent: a capability
that returns one ends the run. [Capabilities and Custom Atoms](/ajs-capabilities/) covers what
a capability may return and has a fuller safe fetch.
