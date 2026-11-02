/**
 * dsh-ui-custom — the appearance configuration model.
 *
 * One record describes every surface this plugin can repaint: the sidebar
 * mark/name, the tab icon, the document title, the conversation hero mark, the
 * conversation headline and the running label/avatar. Empty string means "leave
 * that surface alone", so the default record is a no-op and a brand-new install
 * looks exactly like stock dsh.
 *
 * The rules are deliberately the same ones the ai-tcms gateway admin console
 * enforced (`setBranding` in `gateway/lib/accounts.mjs`), minus the login-page
 * particle text: dsh has no sign-in page, so that field has no surface here and
 * is not carried over.
 *
 * @module dsh-ui-custom/lib/config
 */

/** Default badge font size, matching dsh's own sidebar badge. */
export const DEFAULT_LOGO_TEXT_SIZE = 17

/**
 * Accepted bounds. `imageChars` is the encoded data-URL length, not the file
 * size; a 300 KB PNG encodes to roughly 410 000 characters, so 400 000 is the
 * gateway-compatible ceiling for an uploaded image.
 */
export const LIMITS = Object.freeze({
  name: 40,
  logoText: 4,
  logoTextSizeMin: 10,
  logoTextSizeMax: 28,
  headlineText: 40,
  runningText: 32,
  imageChars: 400_000,
})

/** The record a fresh install starts from: every surface left untouched. */
export const DEFAULT_CONFIG = Object.freeze({
  name: '',
  logo: '',
  logoMode: 'image',
  logoText: '',
  logoTextSize: DEFAULT_LOGO_TEXT_SIZE,
  headlineText: '',
  runningText: '',
  avatar: '',
})

/** The keys a stored record may carry; anything else is dropped on read/write. */
export const CONFIG_KEYS = Object.freeze(Object.keys(DEFAULT_CONFIG))

/** A fresh, caller-owned copy of the stock record. */
export function createDefaultConfig() {
  return { ...DEFAULT_CONFIG }
}

/** A rejected configuration, carrying the offending field. */
export class ConfigError extends Error {
  /**
   * @param {string} field - the config key that failed.
   * @param {string} message - what a caller should fix.
   */
  constructor(field, message) {
    super(message)
    this.name = 'ConfigError'
    this.code = 'INVALID_CONFIG'
    this.field = field
  }
}

/** Whether a value is a plain record. */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Whether a value is an acceptable image source: empty, an inline image data
 * URL, or an https URL, all under {@link LIMITS.imageChars}.
 *
 * @param {unknown} value - the candidate.
 * @returns {boolean} true when the value can be handed to `img.src`.
 */
export function validImageSource(value) {
  if (value === '') return true
  if (typeof value !== 'string') return false
  if (value.length > LIMITS.imageChars) return false
  if (value.startsWith('data:image/')) return true
  return /^https:\/\//i.test(value)
}

/** Read a string field, tolerantly (wrong type becomes the default). */
function readString(raw, key) {
  const value = raw[key]
  return typeof value === 'string' ? value : DEFAULT_CONFIG[key]
}

/** Read and filter one image field, tolerantly. */
function readImage(raw, key) {
  const value = readString(raw, key)
  return validImageSource(value) ? value : ''
}

/** Read the badge size, clamped into range, tolerantly. */
function readLogoTextSize(raw) {
  const value = Number(raw.logoTextSize)
  if (!Number.isFinite(value)) return DEFAULT_LOGO_TEXT_SIZE
  return Math.round(Math.min(LIMITS.logoTextSizeMax, Math.max(LIMITS.logoTextSizeMin, value)))
}

/** Read the logo form, tolerantly. */
function readLogoMode(raw) {
  return raw.logoMode === 'text' ? 'text' : 'image'
}

/**
 * Coerce any stored value into a usable record.
 *
 * Used on the read path, where a hand-edited or truncated `config.json` must
 * degrade to defaults instead of breaking the panel: every field is repaired
 * independently and nothing throws.
 *
 * @param {unknown} raw - whatever was on disk or in a request body.
 * @returns {{name: string, logo: string, logoMode: 'image'|'text', logoText: string, logoTextSize: number, headlineText: string, runningText: string, avatar: string}} the usable record.
 */
export function normalizeConfig(raw) {
  const source = isRecord(raw) ? raw : {}
  return {
    name: readString(source, 'name').trim().slice(0, LIMITS.name),
    logo: readImage(source, 'logo'),
    logoMode: readLogoMode(source),
    logoText: readString(source, 'logoText').trim().slice(0, LIMITS.logoText),
    logoTextSize: readLogoTextSize(source),
    headlineText: readString(source, 'headlineText').trim().slice(0, LIMITS.headlineText),
    runningText: readString(source, 'runningText').trim().slice(0, LIMITS.runningText),
    avatar: readImage(source, 'avatar'),
  }
}

/**
 * Validate one request body and return the record to store.
 *
 * Strict where {@link normalizeConfig} is tolerant: a caller-supplied value
 * that is the wrong type or out of range is rejected with the field name, so a
 * typo never silently becomes "empty, therefore default". Missing keys fall
 * back to their defaults, which makes a partial PUT well defined.
 *
 * @param {unknown} raw - the decoded JSON request body.
 * @returns {object} the validated record.
 * @throws {ConfigError} when the body is not a record or a field is invalid.
 */
export function validateConfig(raw) {
  if (!isRecord(raw)) throw new ConfigError('', 'config must be a JSON object')
  return {
    name: requireText(raw, 'name', LIMITS.name),
    logo: requireImage(raw, 'logo'),
    logoMode: requireLogoMode(raw),
    logoText: requireText(raw, 'logoText', LIMITS.logoText),
    logoTextSize: requireLogoTextSize(raw),
    headlineText: requireText(raw, 'headlineText', LIMITS.headlineText),
    runningText: requireText(raw, 'runningText', LIMITS.runningText),
    avatar: requireImage(raw, 'avatar'),
  }
}

/** Validate one free-text field, trimming before the length check. */
function requireText(raw, key, max) {
  const value = raw[key]
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new ConfigError(key, `${key} must be a string`)
  const text = value.trim()
  if (text.length > max) throw new ConfigError(key, `${key} must be at most ${String(max)} characters`)
  return text
}

/** Validate one image field. */
function requireImage(raw, key) {
  const value = raw[key]
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new ConfigError(key, `${key} must be a string`)
  if (!validImageSource(value)) {
    throw new ConfigError(
      key,
      `${key} must be empty, an image data URL, or an https URL under ${String(LIMITS.imageChars)} characters`,
    )
  }
  return value
}

/** Validate the logo form. */
function requireLogoMode(raw) {
  const value = raw.logoMode
  if (value === undefined || value === null) return DEFAULT_CONFIG.logoMode
  if (value !== 'image' && value !== 'text') throw new ConfigError('logoMode', "logoMode must be 'image' or 'text'")
  return value
}

/** Validate the badge font size. */
function requireLogoTextSize(raw) {
  const value = raw.logoTextSize
  if (value === undefined || value === null || value === '') return DEFAULT_LOGO_TEXT_SIZE
  const size = Number(value)
  if (!Number.isFinite(size)) throw new ConfigError('logoTextSize', 'logoTextSize must be a number')
  if (size < LIMITS.logoTextSizeMin || size > LIMITS.logoTextSizeMax) {
    throw new ConfigError(
      'logoTextSize',
      `logoTextSize must be between ${String(LIMITS.logoTextSizeMin)} and ${String(LIMITS.logoTextSizeMax)}`,
    )
  }
  return Math.round(size)
}
