/**
 * dsh-ui-custom — 系统外观 (branding) for any DeepSeek Harness.
 *
 * This is the Node half of a dual-face plugin. It owns the one thing the browser
 * half cannot: a place to persist the appearance record. It claims a single
 * same-origin JSON route prefix and nothing else — no gateway, no account, no
 * relay — so the package drops into any profile that has a web server. The
 * browser half (`./client`) reads that route, renders the Settings section and
 * repaints dsh's own surfaces.
 *
 * Everything the browser half paints is a dsh-declared seat (the sidebar brand
 * slots, `conversation.hero.brand.mark`) with a DOM fallback for builds that
 * predate those slots. Nothing here reaches into a gateway, and the package has
 * no dependency on one.
 *
 * @module dsh-ui-custom
 */

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { API_PREFIX, createApiHandler } from './lib/http.js'
import { BrandingStore } from './lib/store.js'

/** Stable Cordis plugin name; also the Loader entry id the patch inserts. */
export const name = 'dsh-ui-custom'

/** The only service this plugin needs before it can claim its route. */
export const inject = ['webServer']

/** Where the record lives when the Loader config names no `dataRoot`. */
const FALLBACK_DIRECTORY = 'dsh-ui-custom'

/** Whether a value is a plain record. */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Resolve the appearance data root.
 *
 * The bundle patch passes `dataRoot: !!js dshHomePath('dsh-ui-custom')`, so a
 * profile install always lands inside DSH_HOME. A profile that strips the config
 * block, or a test harness with no Loader at all, still gets a sensible path:
 * `$DSH_HOME/dsh-ui-custom`, else `~/.dsh/dsh-ui-custom`.
 *
 * @param {unknown} rawConfig - the Loader-supplied configuration block.
 * @returns {string} an absolute directory.
 */
export function resolveDataRoot(rawConfig) {
  const configured = isRecord(rawConfig) && typeof rawConfig.dataRoot === 'string' ? rawConfig.dataRoot.trim() : ''
  if (configured !== '') return resolve(configured)
  const home = typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME.trim() !== ''
    ? process.env.DSH_HOME.trim()
    : join(homedir(), '.dsh')
  return join(home, FALLBACK_DIRECTORY)
}

/**
 * Open the store and claim the config route.
 *
 * The handler owns its whole response, so it is registered directly rather than
 * wrapped. Registration goes through `ctx.effect` so a plugin reload drops the
 * route instead of leaking it.
 *
 * @param {{webServer: {register: (route: {kind: 'prefix', path: string, handler: Function}) => () => void}, effect?: (factory: () => () => void, label?: string) => void, logger?: {info?: (line: string) => void}}} ctx - plugin context carrying the web server.
 * @param {unknown} rawConfig - the Loader-supplied configuration block.
 * @returns {Promise<void>} settles once the route is registered.
 */
export async function apply(ctx, rawConfig) {
  const store = new BrandingStore(resolveDataRoot(rawConfig), { logger: ctx.logger })
  await store.init()

  const handler = createApiHandler({ store, logger: ctx.logger })
  const claim = () => ctx.webServer.register({ kind: 'prefix', path: API_PREFIX, handler })
  if (typeof ctx.effect === 'function') ctx.effect(claim, `dsh-ui-custom: ${API_PREFIX}`)
  else claim()

  ctx.logger?.info?.(`dsh-ui-custom: appearance record in ${store.file}`)
}

export { API_PREFIX } from './lib/http.js'
export { BrandingStore } from './lib/store.js'
export { DEFAULT_CONFIG, LIMITS, validateConfig, normalizeConfig } from './lib/config.js'
