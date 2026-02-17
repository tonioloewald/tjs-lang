<!--{"section":"ajs","type":"example","group":"api","order":9}-->

# GitHub Repos

Search GitHub repositories

```ajs
function searchRepos({ query = 'tosijs', perPage = 5 }) {
  let url =
    'https://api.github.com/search/repositories?q=' +
    query +
    '&per_page=' +
    perPage +
    '&sort=stars'
  let response = httpFetch({ url, cache: 300 })
  let repos = response.items.map((x) => ({
    name: x.full_name,
    stars: x.stargazers_count,
    description: x.description,
  }))
  return { repos }
}
```
