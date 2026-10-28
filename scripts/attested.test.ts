/**
 * `attestationProblem` decides whether a tag push may skip the full suite (#3445), so every
 * way an attestation can stop describing the tagged code is a case here, against a real
 * scratch repo, plus the one case where it does (rc.9 review).
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { attestationProblem } from './attested'

let root = ''
// Isolated from the contributor's git config (signing, hooks), and setup commands CHECKED,
// as in release-stamp.test.ts: a silently failed commit would make every refusal pass for the
// wrong reason.
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
}
const git = (...args: string[]) => {
  const p = Bun.spawnSync(['git', '-C', root, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: GIT_ENV,
  })
  if (
    p.exitCode !== 0 &&
    ['init', 'config', 'add', 'commit', 'tag'].includes(args[0])
  )
    throw new Error(`setup failed: git ${args.join(' ')}\n${p.stderr}`)
  return new TextDecoder().decode(p.stdout).trim()
}
const write = (file: string, text: string) =>
  writeFileSync(join(root, file), text)
const commit = (msg: string) => {
  git('add', '-A')
  git('commit', '-qm', msg)
  return git('rev-parse', 'HEAD')
}
/** The release commit, then the attestation commit on top, as `release:ready` makes them. */
const attest = (over: Record<string, unknown> = {}) => {
  const tree = git('rev-parse', 'HEAD^{tree}')
  write(
    'release-attestation.json',
    JSON.stringify({
      version: '1.2.3',
      tree,
      lanes: { 'test:full': { exitCode: 0 } },
      ...over,
    })
  )
  return commit('attest')
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'attested-'))
  git('init', '-q')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 't')
  write('package.json', JSON.stringify({ version: '1.2.3' }))
  write('a.ts', 'export const a = 1\n')
  commit('release')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('attestationProblem', () => {
  it('passes a valid attestation commit', async () => {
    expect(await attestationProblem(attest(), root)).toBeNull()
  })

  it('passes it through an annotated tag', async () => {
    attest()
    git('tag', '-a', 'v1', '-m', 'v1')
    const tagSha = git('rev-parse', 'v1')
    expect(await attestationProblem(`${tagSha}^{commit}`, root)).toBeNull()
  })

  it('refuses a commit that changes anything besides the attestation', async () => {
    const tree = git('rev-parse', 'HEAD^{tree}')
    write('a.ts', 'export const a = 2\n')
    write(
      'release-attestation.json',
      JSON.stringify({
        version: '1.2.3',
        tree,
        lanes: { 'test:full': { exitCode: 0 } },
      })
    )
    expect(await attestationProblem(commit('both'), root)).toMatch(
      /must change only/
    )
  })

  it('refuses when the parent tree is not the tested tree', async () => {
    const sha = attest({ tree: 'f'.repeat(40) })
    expect(await attestationProblem(sha, root)).toMatch(/lanes ran on tree/)
  })

  it('refuses a missing or malformed tree (two empty strings must not match)', async () => {
    expect(await attestationProblem(attest({ tree: '' }), root)).toMatch(
      /names no tree/
    )
  })

  it('refuses a version mismatch, and a package.json with no version', async () => {
    expect(
      await attestationProblem(attest({ version: '9.9.9' }), root)
    ).toMatch(/attestation is for 9\.9\.9/)
    write('package.json', JSON.stringify({ name: 'x' }))
    commit('no version')
    expect(
      await attestationProblem(attest({ version: undefined }), root)
    ).toMatch(/no version/)
  })

  it('refuses test:full missing or failed', async () => {
    expect(await attestationProblem(attest({ lanes: {} }), root)).toMatch(
      /not among/
    )
    expect(
      await attestationProblem(
        attest({ lanes: { 'test:full': { exitCode: 1 } } }),
        root
      )
    ).toMatch(/FAILED/)
  })

  it('refuses invalid JSON, a commit without one, and a root commit', async () => {
    write('release-attestation.json', '{not json')
    expect(await attestationProblem(commit('bad'), root)).toMatch(
      /not valid JSON/
    )
    write('b.ts', '1')
    expect(await attestationProblem(commit('plain'), root)).not.toBeNull()
    const rootSha = git('rev-list', '--max-parents=0', 'HEAD')
    expect(await attestationProblem(rootSha, root)).not.toBeNull()
  })
})
