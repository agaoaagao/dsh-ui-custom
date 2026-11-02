/**
 * dsh-ui-custom — the same-origin JSON routes the browser half reads.
 *
 * The browser plugin cannot import this module (it is served as a client
 * bundle), so this is the whole host face: read, replace and reset one appearance
 * record. Everything is same-origin, which is why there is no CORS handling and
 * no authentication layer of its own — dsh's own session gate already fronts the
 * route.
 *
 *   GET    /dsh-ui-custom/api/config   -> { ok, config }
 *   PUT    /dsh-ui-custom/api/config   -> { ok, config }   (POST is accepted too)
 *   DELETE /dsh-ui-custom/api/config   -> { ok, config, reset: true }
 *   GET    /dsh-ui-custom/api/health   -> { ok, plugin }
 *
 * @module dsh-ui-custom/lib/http
 */

import { ConfigError, validateConfig } from './config.js'

/** Route prefix claimed by this plugin. */
export const API_PREFIX = '/dsh-ui-custom/api'

/**
 * Largest request body accepted. Two 300 KB images arrive as data URLs of about
 * 410 000 characters each, so 2 MB leaves ample room for the rest of the record.
 */
export const MAX_BODY_BYTES = 2 * 1024 * 1024

/** A request-level failure that maps straight onto a status code. */
class HttpError extends Error {
  /**
   * @param {number} status - the status to answer with.
   * @param {string} code - a stable machine-readable code.
   * @param {string} message - what to tell the caller.
   */
  constructor(status, code, message) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
  }
}

/** Write one JSON response and end it. */
function sendJson(response, status, body) {
  const data = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(data),
  })
  response.end(data)
}

/**
 * Read a JSON request body.
 *
 * @param {import('node:http').IncomingMessage} request - the request.
 * @param {number} [limit] - largest accepted body in bytes.
 * @returns {Promise<unknown>} the decoded body; `{}` when empty.
 * @throws {HttpError} when the body is too large or not JSON.
 */
async function readJson(request, limit = MAX_BODY_BYTES) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    size += buffer.length
    if (size > limit) throw new HttpError(413, 'BODY_TOO_LARGE', `request body exceeds ${String(limit)} bytes`)
    chunks.push(buffer)
  }
  if (size === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'request body is not valid JSON')
  }
}

/**
 * Build the route handler for one store.
 *
 * The returned function owns the whole response lifecycle, including failures,
 * so it can be registered as a bare prefix handler.
 *
 * @param {{store: import('./store.js').BrandingStore, logger?: {warn?: (error: Error) => void}}} deps - the store and an optional logger.
 * @returns {(request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse) => Promise<void>} the handler.
 */
export function createApiHandler({ store, logger } = {}) {
  if (!store) throw new TypeError('dsh-ui-custom: createApiHandler needs a store')
  return async function handle(request, response) {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost')
      const route = url.pathname.slice(API_PREFIX.length).replace(/\/+$/u, '') || '/'
      const method = request.method ?? 'GET'

      if (route === '/health' && (method === 'GET' || method === 'HEAD')) {
        sendJson(response, 200, { ok: true, plugin: 'dsh-ui-custom' })
        return
      }
      if (route !== '/config') {
        throw new HttpError(404, 'NOT_FOUND', `unknown route ${route}`)
      }
      if (method === 'GET' || method === 'HEAD') {
        sendJson(response, 200, { ok: true, config: await store.read() })
        return
      }
      if (method === 'PUT' || method === 'POST') {
        const body = await readJson(request)
        const config = validateConfig(body)
        sendJson(response, 200, { ok: true, config: await store.write(config) })
        return
      }
      if (method === 'DELETE') {
        sendJson(response, 200, { ok: true, config: await store.reset(), reset: true })
        return
      }
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', `${method} is not supported on ${route}`)
    } catch (error) {
      if (error instanceof ConfigError) {
        sendJson(response, 400, { ok: false, code: error.code, field: error.field, message: error.message })
        return
      }
      if (error instanceof HttpError) {
        sendJson(response, error.status, { ok: false, code: error.code, message: error.message })
        return
      }
      logger?.warn?.(error instanceof Error ? error : new Error(String(error)))
      sendJson(response, 500, { ok: false, code: 'INTERNAL', message: 'internal error' })
    }
  }
}
