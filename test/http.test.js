/**
 * The host HTTP face: read, replace and reset the appearance record. These call
 * the handler directly with stream-shaped requests, no server required.
 */

import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'
import { LIMITS } from '../lib/config.js'
import { API_PREFIX, MAX_BODY_BYTES, createApiHandler } from '../lib/http.js'
import { BrandingStore } from '../lib/store.js'

/** A minimal request whose body the handler can iterate. */
function request(method, path, body) {
  const payload = body === undefined
    ? []
    : [Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]
  const stream = Readable.from(payload)
  stream.method = method
  stream.url = path
  return stream
}

/** A minimal response that records what the handler wrote. */
function response() {
  const out = { status: 0, headers: {}, body: '' }
  return {
    out,
    writeHead(status, headers) {
      out.status = status
      out.headers = { ...headers }
    },
    end(chunk) {
      if (chunk !== undefined && chunk !== null) out.body += String(chunk)
    },
  }
}

async function call(handler, method, path, body) {
  const res = response()
  await handler(request(method, path, body), res)
  return {
    status: res.out.status,
    headers: res.out.headers,
    body: res.out.body === '' ? undefined : JSON.parse(res.out.body),
  }
}

/** A handler backed by a throwaway data root. */
async function makeHandler(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-ui-custom-http-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const store = options.store ?? new BrandingStore(root)
  return { handler: createApiHandler({ store, logger: options.logger }), store, root }
}

test('health answers with the plugin name', async t => {
  const { handler } = await makeHandler(t)
  const result = await call(handler, 'GET', `${API_PREFIX}/health`)
  assert.equal(result.status, 200)
  assert.deepEqual(result.body, { ok: true, plugin: 'dsh-ui-custom' })
  assert.equal(result.headers['content-type'], 'application/json; charset=utf-8')
})

test('GET /config returns the stock record on a fresh install', async t => {
  const { handler } = await makeHandler(t)
  const result = await call(handler, 'GET', `${API_PREFIX}/config`)
  assert.equal(result.status, 200)
  assert.equal(result.body.ok, true)
  assert.equal(result.body.config.name, '')
  assert.equal(result.body.config.logoTextSize, 17)
})

test('PUT /config stores a valid record that GET then returns', async t => {
  const { handler } = await makeHandler(t)
  const record = { name: ' Acme ', logoMode: 'text', logoText: 'AC', logoTextSize: 20, headlineText: 'Hi' }
  const saved = await call(handler, 'PUT', `${API_PREFIX}/config`, record)
  assert.equal(saved.status, 200)
  assert.equal(saved.body.ok, true)
  assert.equal(saved.body.config.name, 'Acme')
  assert.equal(saved.body.config.logoTextSize, 20)

  const read = await call(handler, 'GET', `${API_PREFIX}/config`)
  assert.deepEqual(read.body.config, saved.body.config)
})

test('POST /config is accepted as a synonym for PUT', async t => {
  const { handler } = await makeHandler(t)
  const result = await call(handler, 'POST', `${API_PREFIX}/config`, { name: 'Acme' })
  assert.equal(result.status, 200)
  assert.equal(result.body.config.name, 'Acme')
})

test('a trailing slash routes to the same endpoint', async t => {
  const { handler } = await makeHandler(t)
  const result = await call(handler, 'GET', `${API_PREFIX}/config/`)
  assert.equal(result.status, 200)
})

test('an out-of-range field is rejected with its field name', async t => {
  const { handler } = await makeHandler(t)
  const result = await call(handler, 'PUT', `${API_PREFIX}/config`, { name: 'x'.repeat(LIMITS.name + 1) })
  assert.equal(result.status, 400)
  assert.equal(result.body.ok, false)
  assert.equal(result.body.code, 'INVALID_CONFIG')
  assert.equal(result.body.field, 'name')
})

test('a malformed JSON body is rejected as INVALID_JSON', async t => {
  const { handler } = await makeHandler(t)
  const result = await call(handler, 'PUT', `${API_PREFIX}/config`, '{ this is not json')
  assert.equal(result.status, 400)
  assert.equal(result.body.code, 'INVALID_JSON')
})

test('an oversized body is rejected before parsing', async t => {
  const { handler } = await makeHandler(t)
  const result = await call(handler, 'PUT', `${API_PREFIX}/config`, Buffer.alloc(MAX_BODY_BYTES + 1, 0x61))
  assert.equal(result.status, 413)
  assert.equal(result.body.code, 'BODY_TOO_LARGE')
})

test('DELETE /config restores the stock record', async t => {
  const { handler } = await makeHandler(t)
  await call(handler, 'PUT', `${API_PREFIX}/config`, { name: 'Acme' })
  const result = await call(handler, 'DELETE', `${API_PREFIX}/config`)
  assert.equal(result.status, 200)
  assert.equal(result.body.reset, true)
  assert.equal(result.body.config.name, '')

  const read = await call(handler, 'GET', `${API_PREFIX}/config`)
  assert.equal(read.body.config.name, '')
})

test('an unknown route is a 404', async t => {
  const { handler } = await makeHandler(t)
  const result = await call(handler, 'GET', `${API_PREFIX}/nope`)
  assert.equal(result.status, 404)
  assert.equal(result.body.code, 'NOT_FOUND')
})

test('an unsupported method is a 405', async t => {
  const { handler } = await makeHandler(t)
  const result = await call(handler, 'PATCH', `${API_PREFIX}/config`, {})
  assert.equal(result.status, 405)
  assert.equal(result.body.code, 'METHOD_NOT_ALLOWED')
})

test('a store failure becomes a logged 500 without leaking the cause', async t => {
  const warnings = []
  const failing = {
    read: async () => {
      throw new Error('disk on fire')
    },
  }
  const { handler } = await makeHandler(t, { store: failing, logger: { warn: error => warnings.push(error.message) } })
  const result = await call(handler, 'GET', `${API_PREFIX}/config`)
  assert.equal(result.status, 500)
  assert.equal(result.body.code, 'INTERNAL')
  assert.equal(result.body.message, 'internal error')
  assert.deepEqual(warnings, ['disk on fire'])
})

test('createApiHandler requires a store', () => {
  assert.throws(() => createApiHandler({}), TypeError)
})
