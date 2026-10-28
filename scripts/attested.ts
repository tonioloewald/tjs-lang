/**
 * Does commit <sha> carry a valid release attestation that includes the FULL suite?
 *
 *   bun scripts/attested.ts <sha>    # exit 0 = attested (prints why), 1 = not (prints why)
 *
 * The pre-push hook asks this before re-running the full suite on a tag push (#3445). The
 * release flow (`release:ready`) already ran every lane, `test:full` included, on exactly the
 * tagged tree and committed `release-attestation.json`; re-running ~8 minutes of suite to
 * learn nothing made git's connection to the remote sit idle until GitHub dropped it, so a
 * green hook ended in `exit 141` (SIGPIPE) and a second push.
 *
 * The same checks as the practices tool's `attest.ts --verify`, but for ANY commit (that one
 * checks HEAD), done with git plumbing so it reads the committed files, not the working tree:
 * the commit changes only the attestation; its parent's tree is the tree the lanes ran on;
 * the version matches (and exists); and `test:full` is recorded as passed. Pinned by
 * `scripts/attested.test.ts` against a scratch repo.
 */
import { $ } from 'bun'

const FILE = 'release-attestation.json'

/** `null` when <sha> is attested, else why not. */
export async function attestationProblem(
  sha: string,
  cwd: string
): Promise<string | null> {
  const git = async (...args: string[]) =>
    (await $`git ${args}`.cwd(cwd).quiet().nothrow()).stdout.toString().trim()

  const raw = await git('show', `${sha}:${FILE}`)
  if (!raw) return `${FILE} is not in ${sha.slice(0, 7)}`
  let att: any
  try {
    att = JSON.parse(raw)
  } catch {
    return `${FILE} is not valid JSON`
  }
  let pkg: any
  try {
    pkg = JSON.parse((await git('show', `${sha}:package.json`)) || 'null')
  } catch {
    return 'package.json is not valid JSON'
  }
  // Both must EXIST: `undefined === undefined` would otherwise pass (rc.9 review).
  if (typeof pkg?.version !== 'string' || !pkg.version)
    return 'package.json has no version'
  if (att.version !== pkg.version)
    return `attestation is for ${att.version}, package.json is ${pkg.version}`
  const changed = (await git('diff', '--name-only', `${sha}^`, sha))
    .split('\n')
    .filter(Boolean)
  if (changed.length !== 1 || changed[0] !== FILE)
    return `${sha.slice(0, 7)} must change only ${FILE} (changes: ${
      changed.join(', ') || 'nothing, or it has no parent'
    })`
  // A real tree id, so two empty strings (a root commit, a missing field) cannot match.
  if (typeof att.tree !== 'string' || !/^[0-9a-f]{40}$/.test(att.tree))
    return 'the attestation names no tree'
  const parentTree = await git('rev-parse', `${sha}^^{tree}`)
  if (parentTree !== att.tree)
    return `lanes ran on tree ${att.tree.slice(0, 12)}, parent is ${
      parentTree.slice(0, 12) || 'missing'
    }`
  const full = att.lanes?.['test:full']
  if (!full) return 'test:full is not among the attested lanes'
  if (full.exitCode !== 0)
    return `test:full is recorded as FAILED (exit ${full.exitCode})`
  return null
}

if (import.meta.main) {
  const sha = process.argv[2]
  if (!sha) {
    console.error('usage: bun scripts/attested.ts <sha>')
    process.exit(2)
  }
  const problem = await attestationProblem(sha, process.cwd())
  if (problem) {
    console.log(`not attested: ${problem}`)
    process.exit(1)
  }
  const att = JSON.parse(
    (await $`git show ${sha}:${FILE}`.quiet()).stdout.toString()
  )
  console.log(
    `attested: ${att.version}, test:full passed on tree ${att.tree.slice(
      0,
      12
    )} (commit ${String(att.commit ?? '').slice(0, 7)})`
  )
}
