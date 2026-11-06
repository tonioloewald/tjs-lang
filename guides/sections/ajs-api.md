<!--{"parent": "ajs-examples.md", "order": 2}-->
<!-- TODO review -->

# Agents that call APIs

These example agents reach out to the world. Each one calls a public API (weather, music, code
repositories), reshapes the answer, and returns only what matters. The example pages below run
live: the doc site acts as the host and passes each `vm.run` an allowlist of three domains,
`api.open-meteo.com`, `itunes.apple.com` and `api.github.com`. Any other URL is refused.

## The network is something the host grants

AJS code cannot open a connection. An agent calls `httpFetch`, an atom (a built-in operation),
and `httpFetch` has no network access of its own: every request goes through what the host
grants for that run (one `vm.run` call). That grant is a capability, an I/O function or
permission the host passes in; an agent has none by default. The host can grant the network in
two ways, and both are options to `vm.run`:

```javascript
// The built-in client, limited to the domains you name
await vm.run(ast, args, {
  context: { allowedFetchDomains: ['api.open-meteo.com'] },
})

// Your own fetch function, which replaces the built-in client
await vm.run(ast, args, {
  capabilities: { fetch: myFetch },
})
```

When both are given, the allowlist still applies: the VM checks every URL against it before
your `fetch` sees the request. Given a `fetch` capability and no allowlist, your function
decides where requests may go.

With neither, nothing is allowed. A public URL is refused with an error beginning
`Fetch blocked: no allowedFetchDomains configured`. A private or internal address (`localhost`,
`10.x` and so on) is refused with `Blocked URL: private/internal addresses not allowed in
default fetch`, and a scheme other than `http:` or `https:` is always refused.

Allowlist entries are exact. `example.com` admits `example.com` on the scheme's default port
and nothing else: write `*.example.com` to admit its subdomains (and `example.com` itself), and
`api.example.com:8443` to admit another port.

## The three examples

Read [Weather API](/weather-api/) first. It shows the call, the host code that grants the
domain, and why an HTTP error status is not an AJS error. A 404 or 500 does not stop the agent
or become an error it can [catch](/ajs-error-handling/): `httpFetch` returns the body the server
sent as ordinary data, so the agent has to check that body before using it. Redirects are not
followed either; one comes back as data, `{ redirect: true, status, location }`.

[iTunes Search](/itunes-search/) adds encoded queries and a server that labels its JSON
`text/javascript`. `httpFetch` parses a body on its own only when it is labeled
`application/json`, so this agent asks for `responseType: 'json'`. The agent also
trims a large response down to the few fields a caller needs. Size matters for the host, not
only for tidiness: every value crossing between host and agent is capped by `membraneMaxBytes`
(4 MB by default, and a response body over it is refused, not truncated), copying data costs
fuel, and a result passed to a model costs context.

[GitHub Repos](/github-repos/) adds rate limits and shows where an API token belongs: in the
host's `fetch` capability, never in agent source.

After these you can write an agent that calls an API safely, handles the answers that are not
the data you asked for, and returns a result small enough to hand to a model. The
[fetch policy](/ajs-host/#fetch-policy) section of the host chapter has the full rules for
domains, methods, headers and redirects.

<!-- prettier-ignore-start -->

<!-- toc -->
- [Weather API](/weather-api/)
- [iTunes Search](/itunes-search/)
- [GitHub Repos](/github-repos/)
<!-- /toc -->

<!-- prettier-ignore-end -->
