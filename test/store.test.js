/**
 * The appearance record on disk: absence, round-trip, atomic replacement and
 * the degrade-to-defaults path a hand-edited file must survive.
 */

import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createDefaultConfig, LIMITS } from '../lib/config.js'
import { BrandingStore, CONFIG_FILE_NAME } from '../lib/store.js'

/** A throwaway data root, removed with the test. */
async function makeRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-ui-custom-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

test('a missing record reads as the stock appearance', async t => {
  const root = await makeRoot(t)
  const store = new BrandingStore(root)
  assert.deepEqual(await store.read(), createDefaultConfig())
})

test('write then read round-trips and leaves no temp file behind', async t => {
  const root = await makeRoot(t)
  const store = new BrandingStore(root)
  const record = {
    ...createDefaultConfig(),
    name: 'Acme',
    logoMode: 'text',
    logoText: 'AC',
    logoTextSize: 22,
    headlineText: 'Hello',
    runningText: 'Working',
  }
  assert.deepEqual(await store.write(record), record)
  assert.deepEqual(await store.read(), record)
  assert.deepEqual(await readdir(root), [CONFIG_FILE_NAME])
  const text = await readFile(store.file, 'utf8')
  assert.match(text, /"name": "Acme"/u)
})

test('init creates the data root on demand', async t => {
  const root = await makeRoot(t)
  const store = new BrandingStore(join(root, 'nested', 'deeper'))
  await store.init()
  assert.equal(await store.read().then(config => config.name), '')
})

test('reset rewrites the stock appearance', async t => {
  const root = await makeRoot(t)
  const store = new BrandingStore(root)
  await store.write({ ...createDefaultConfig(), name: 'Acme' })
  assert.deepEqual(await store.reset(), createDefaultConfig())
  assert.deepEqual(await store.read(), createDefaultConfig())
})

test('a corrupt record degrades to defaults and reports once', async t => {
  const root = await makeRoot(t)
  const warnings = []
  const store = new BrandingStore(root, { logger: { warn: line => warnings.push(line) } })
  await writeFile(store.file, '{ not json', 'utf8')
  assert.deepEqual(await store.read(), createDefaultConfig())
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /unreadable/u)
})

test('a stored record with out-of-range values is repaired on read', async t => {
  const root = await makeRoot(t)
  const store = new BrandingStore(root)
  await writeFile(
    store.file,
    JSON.stringify({ name: '  Acme  ', logo: 'http://x/y.png', logoTextSize: 999, logoText: 'abcdef', extra: 1 }),
    'utf8',
  )
  const record = await store.read()
  assert.equal(record.name, 'Acme')
  assert.equal(record.logo, '')
  assert.equal(record.logoTextSize, LIMITS.logoTextSizeMax)
  assert.equal(record.logoText, 'abcd')
  assert.equal('extra' in record, false)
})

test('the store rejects an empty data root', () => {
  assert.throws(() => new BrandingStore(''), TypeError)
  assert.throws(() => new BrandingStore('   '), TypeError)
})
