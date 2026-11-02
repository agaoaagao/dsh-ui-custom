/**
 * The plugin face: `apply` claims exactly one prefix route, and that route works
 * end to end over a real HTTP server — the shape a dsh profile sees.
 */

import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { API_PREFIX, apply, resolveDataRoot } from '../index.js'

/** A context that records the route the plugin claims. */
function fakeContext() {
  const context = {
    routes: [],
    effectLabels: [],
    webServer: {
      register(route) {
        context.routes.push(route)
        return () => {}
      },
    },
    effect(factory, label) {
      context.effectLabels.push(label)
      factory()
    },
    logger: { info() {}, warn() {} },
  }
  return context
}

async function makeRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-ui-custom-plugin-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

/** Run one handler behind a real server and return its JSON answer. */
async function serve(handler) {
  const server = createServer((request, response) => handler(request, response))
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  const address = server.address()
  const base = `http://127.0.0.1:${String(address.port)}${API_PREFIX}`
  return { base, close: () => new Promise(done => server.close(done)) }
}

test('resolveDataRoot prefers the configured directory', () => {
  assert.equal(resolveDataRoot({ dataRoot: '/tmp/ui-custom' }), resolve('/tmp/ui-custom'))
  assert.equal(resolveDataRoot({ dataRoot: '  /tmp/ui-custom  ' }), resolve('/tmp/ui-custom'))
})

test('resolveDataRoot falls back to DSH_HOME, then the home directory', t => {
  const previous = process.env.DSH_HOME
  t.after(() => {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  })

  process.env.DSH_HOME = '/tmp/fake-dsh-home'
  assert.equal(resolveDataRoot(undefined), join('/tmp/fake-dsh-home', 'dsh-ui-custom'))
  assert.equal(resolveDataRoot({ dataRoot: '   ' }), join('/tmp/fake-dsh-home', 'dsh-ui-custom'))

  delete process.env.DSH_HOME
  assert.equal(resolveDataRoot(undefined), join(homedir(), '.dsh', 'dsh-ui-custom'))
})

test('apply claims the prefix route through ctx.effect', async t => {
  const root = await makeRoot(t)
  const context = fakeContext()
  await apply(context, { dataRoot: root })
  assert.equal(context.routes.length, 1)
  const route = context.routes[0]
  assert.equal(route.kind, 'prefix')
  assert.equal(route.path, API_PREFIX)
  assert.equal(typeof route.handler, 'function')
  assert.deepEqual(context.effectLabels, [`dsh-ui-custom: ${API_PREFIX}`])
})

test('apply works without ctx.effect and without a logger', async t => {
  const root = await makeRoot(t)
  const context = { webServer: { register: route => { context.route = route } } }
  await apply(context, { dataRoot: root })
  assert.equal(context.route.path, API_PREFIX)
})

test('the registered route serves config over HTTP', async t => {
  const root = await makeRoot(t)
  const context = fakeContext()
  await apply(context, { dataRoot: root })
  const { base, close } = await serve(context.routes[0].handler)
  t.after(close)

  const health = await fetch(`${base}/health`).then(result => result.json())
  assert.deepEqual(health, { ok: true, plugin: 'dsh-ui-custom' })

  const initial = await fetch(`${base}/config`).then(result => result.json())
  assert.equal(initial.config.name, '')

  const saved = await fetch(`${base}/config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Acme', logoMode: 'text', logoText: 'A', logoTextSize: 21 }),
  }).then(result => result.json())
  assert.equal(saved.config.name, 'Acme')
  assert.equal(saved.config.logoTextSize, 21)

  const reset = await fetch(`${base}/config`, { method: 'DELETE' }).then(result => result.json())
  assert.equal(reset.reset, true)
  assert.equal(reset.config.name, '')
})
