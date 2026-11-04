<!--{"section": "ajs", "type": "example", "group": "api", "order": 9, "parent": "ajs-api.md"}-->

# GitHub Repos

Search GitHub repositories

<!-- TODO review -->
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
  let repos = response.items.map((x) => ({
    name: x.full_name,
    stars: x.stargazers_count,
    description: x.description,
  }))
  return { repos }
}
```

<!-- TODO review -->
## What to notice

- **The query is encoded.** `encodeURIComponent` keeps a search like `language:ajs stars:>10`
  intact.
- **The result is small on purpose.** GitHub returns dozens of fields per repository; the agent
  returns three. Whatever an agent returns crosses back to the host as a copy, and whatever it
  will hand a model costs tokens.

<!-- TODO review -->
## A variation

One repository's vital signs:

```ajs:inline
function repoInfo({ owner = 'tonioloewald', repo = 'tjs-lang' }) {
  let r = httpFetch({ url: `https://api.github.com/repos/${owner}/${repo}` })
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

A missing repository does not make `httpFetch` fail: GitHub answers 404 with a JSON body
(`{ "message": "Not Found", … }`), and the agent receives that body. The `if` is how you tell.

<!-- TODO review -->
## The gotchas

- **Rate limits.** Without a token, GitHub allows about 60 requests an hour from one address, and
  then returns an error body instead of `items`. If the example stops working, that is why.
- **Never put a token in agent source.** Source is data: it is stored, logged and sent around. A
  host that needs authenticated requests puts the credential in its own `fetch` capability, where
  the agent can use it without being able to read it.
