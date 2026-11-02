/**
 * dsh-ui-custom — the on-disk appearance record.
 *
 * One JSON file under the plugin's data root holds the single record the
 * Settings section edits. Writes go through a temp file and a rename so a crash
 * mid-save can never leave a half-written record that the panel would then read
 * back as a broken brand.
 *
 * @module dsh-ui-custom/lib/store
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createDefaultConfig, normalizeConfig } from './config.js'

/** File name inside the plugin's data root. */
export const CONFIG_FILE_NAME = 'config.json'

/** The appearance store for one data root. */
export class BrandingStore {
  /**
   * @param {string} dataRoot - directory holding {@link CONFIG_FILE_NAME}.
   * @param {{logger?: {info?: (line: string) => void, warn?: (line: string) => void}}} [options] - optional scoped logger.
   */
  constructor(dataRoot, options = {}) {
    if (typeof dataRoot !== 'string' || dataRoot.trim() === '') {
      throw new TypeError('dsh-ui-custom: dataRoot must be a non-empty string')
    }
    this.dataRoot = dataRoot
    /** Absolute path of the record. */
    this.file = join(dataRoot, CONFIG_FILE_NAME)
    this.logger = options.logger
  }

  /** Create the data root; safe to call more than once. */
  async init() {
    await mkdir(this.dataRoot, { recursive: true })
  }

  /**
   * Read the stored record, degrading to defaults when the file is absent or
   * unreadable. A corrupt file is reported once through the logger and then
   * treated as empty: the panel must still open.
   *
   * @returns {Promise<object>} the usable record.
   */
  async read() {
    let text
    try {
      text = await readFile(this.file, 'utf8')
    } catch (error) {
      if (error && error.code === 'ENOENT') return createDefaultConfig()
      throw error
    }
    try {
      return normalizeConfig(JSON.parse(text))
    } catch (error) {
      this.logger?.warn?.(`dsh-ui-custom: ignoring unreadable ${this.file}: ${error instanceof Error ? error.message : String(error)}`)
      return createDefaultConfig()
    }
  }

  /**
   * Replace the stored record atomically.
   *
   * @param {object} config - the already-validated record.
   * @returns {Promise<object>} the record that was written.
   */
  async write(config) {
    await this.init()
    const body = `${JSON.stringify(config, null, 2)}\n`
    const temporary = `${this.file}.${String(process.pid)}.${String(Date.now())}.tmp`
    await writeFile(temporary, body, { mode: 0o600 })
    await rename(temporary, this.file)
    return config
  }

  /**
   * Restore the stock appearance.
   *
   * @returns {Promise<object>} the default record.
   */
  async reset() {
    return this.write(createDefaultConfig())
  }
}
