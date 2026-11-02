/**
 * The appearance record: tolerant reads, strict writes, and the bounds the
 * gateway admin console used to enforce.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ConfigError,
  DEFAULT_CONFIG,
  LIMITS,
  normalizeConfig,
  validImageSource,
  validateConfig,
} from '../lib/config.js'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

test('a missing record normalizes to the stock appearance', () => {
  assert.deepEqual(normalizeConfig(undefined), { ...DEFAULT_CONFIG })
  assert.deepEqual(normalizeConfig(null), { ...DEFAULT_CONFIG })
  assert.deepEqual(normalizeConfig('nonsense'), { ...DEFAULT_CONFIG })
  assert.deepEqual(normalizeConfig([]), { ...DEFAULT_CONFIG })
})

test('normalize trims text, clamps the badge size and drops broken images', () => {
  const config = normalizeConfig({
    name: '  Acme  ',
    logo: 'http://insecure.example/logo.png',
    logoMode: 'text',
    logoText: ' ABCD ',
    logoTextSize: 99,
    headlineText: '  Hello  ',
    runningText: ' Working ',
    avatar: PNG,
    ignored: 'field',
  })
  assert.equal(config.name, 'Acme')
  assert.equal(config.logo, '')
  assert.equal(config.logoMode, 'text')
  assert.equal(config.logoText, 'ABCD')
  assert.equal(config.logoTextSize, LIMITS.logoTextSizeMax)
  assert.equal(config.headlineText, 'Hello')
  assert.equal(config.runningText, 'Working')
  assert.equal(config.avatar, PNG)
  assert.equal('ignored' in config, false)
})

test('normalize clamps text that exceeds its bound instead of rejecting it', () => {
  const config = normalizeConfig({ name: 'x'.repeat(50), logoText: 'abcdef', runningText: 'y'.repeat(40) })
  assert.equal(config.name.length, LIMITS.name)
  assert.equal(config.logoText.length, LIMITS.logoText)
  assert.equal(config.runningText.length, LIMITS.runningText)
})

test('validImageSource accepts empty, data:image and https, under the encoded limit', () => {
  assert.equal(validImageSource(''), true)
  assert.equal(validImageSource(PNG), true)
  assert.equal(validImageSource('https://cdn.example/logo.svg'), true)
  assert.equal(validImageSource('http://cdn.example/logo.svg'), false)
  assert.equal(validImageSource('javascript:alert(1)'), false)
  assert.equal(validImageSource('a'.repeat(LIMITS.imageChars)), false)
  assert.equal(validImageSource('data:image/png;base64,' + 'a'.repeat(LIMITS.imageChars - 25)), true)
  assert.equal(validImageSource(42), false)
})

test('validate accepts a well-formed body and fills missing keys with defaults', () => {
  const config = validateConfig({ name: ' Acme ', logoMode: 'text', logoText: 'A', logoTextSize: 20 })
  assert.equal(config.name, 'Acme')
  assert.equal(config.logoMode, 'text')
  assert.equal(config.logoText, 'A')
  assert.equal(config.logoTextSize, 20)
  assert.equal(config.logo, '')
  assert.equal(config.avatar, '')
  assert.equal(config.headlineText, '')
  assert.equal(config.runningText, '')
})

test('validate rounds a fractional badge size', () => {
  assert.equal(validateConfig({ logoTextSize: 20.4 }).logoTextSize, 20)
  assert.equal(validateConfig({ logoTextSize: '17' }).logoTextSize, 17)
})

test('validate rejects each out-of-bounds field with its own name', () => {
  const cases = [
    [{ name: 'x'.repeat(41) }, 'name'],
    [{ logoText: 'abcde' }, 'logoText'],
    [{ logoTextSize: 9 }, 'logoTextSize'],
    [{ logoTextSize: 29 }, 'logoTextSize'],
    [{ logoTextSize: 'big' }, 'logoTextSize'],
    [{ headlineText: 'x'.repeat(41) }, 'headlineText'],
    [{ runningText: 'x'.repeat(33) }, 'runningText'],
    [{ logo: 'file:///tmp/logo.png' }, 'logo'],
    [{ avatar: 'data:text/html,boom' }, 'avatar'],
    [{ logo: 'https://' + 'a'.repeat(LIMITS.imageChars) }, 'logo'],
    [{ logoMode: 'emoji' }, 'logoMode'],
    [{ name: 42 }, 'name'],
  ]
  for (const [body, field] of cases) {
    assert.throws(
      () => validateConfig(body),
      error => error instanceof ConfigError && error.field === field && error.code === 'INVALID_CONFIG',
      `${field} should have been rejected`,
    )
  }
})

test('validate rejects a body that is not an object', () => {
  for (const body of [null, undefined, 'text', 7, []]) {
    assert.throws(() => validateConfig(body), ConfigError)
  }
})

test('validate accepts both image forms', () => {
  assert.equal(validateConfig({ logo: PNG, avatar: 'https://cdn.example/a.png' }).logo, PNG)
  assert.equal(validateConfig({ logo: PNG, avatar: 'https://cdn.example/a.png' }).avatar, 'https://cdn.example/a.png')
})
