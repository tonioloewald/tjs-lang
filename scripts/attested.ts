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
 * the version matches; and `test:full` is recorded as passed.
 */
import { $ } from 'bun'

const FILE = 'release-attestation.json'
const sha = process.argv[2]
if (!sha) {
  console.error('usage: bun scripts/attested.ts <sha>')
  process.exit(2)
}

const git = async (...args: string[]) =>
  (await $`git ${args}`.quiet().nothrow()).stdout.toString().trim()

function no(why: string): never {
  console.log(`not attested: ${why}`)
  process.exit(1)
}

const raw = await git('show', `${sha}:${FILE}`)
if (!raw) no(`${FILE} is not in ${sha.slice(0, 7)}`)
let att: any
try {
  att = JSON.parse(raw)
} catch {
  no(`${FILE} is not valid JSON`)
}
const pkg = JSON.parse((await git('show', `${sha}:package.json`)) || '{}')
if (att.version !== pkg.version)
  no(`attestation is for ${att.version}, package.json is ${pkg.version}`)
const changed = (await git('diff', '--name-only', `${sha}^`, sha))
  .split('\n')
  .filter(Boolean)
if (changed.length !== 1 || changed[0] !== FILE)
  no(
    `${sha.slice(0, 7)} must change only ${FILE} (changes: ${changed.join(
      ', '
    )})`
  )
const parentTree = await git('rev-parse', `${sha}^^{tree}`)
if (parentTree !== att.tree)
  no(
    `lanes ran on tree ${String(att.tree).slice(
      0,
      12
    )}, parent is ${parentTree.slice(0, 12)}`
  )
const full = att.lanes?.['test:full']
if (!full) no('test:full is not among the attested lanes')
if (full.exitCode !== 0)
  no(`test:full is recorded as FAILED (exit ${full.exitCode})`)
console.log(
  `attested: ${att.version}, test:full passed on tree ${String(att.tree).slice(
    0,
    12
  )} (commit ${String(att.commit ?? '').slice(0, 7)})`
)
