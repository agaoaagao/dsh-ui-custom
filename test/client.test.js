import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const source = readFileSync(join(root, 'client.js'), 'utf8')

/** A tiny element stand-in: enough surface for the plugin's painting code. */
class FakeNode {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toUpperCase()
    this.ownerDocument = ownerDocument
    this.nodeType = 1
    this.attributes = new Map()
    this.style = {}
    this.children = []
    this.parentNode = null
    this.textContent = ''
    this.isConnected = true
  }

  get parentElement() {
    return this.parentNode
  }

  get firstChild() {
    return null
  }

  get lastElementChild() {
    const last = this.children[this.children.length - 1]
    return last || null
  }

  get nextSibling() {
    if (!this.parentNode) return null
    const siblings = this.parentNode.children
    const index = siblings.indexOf(this)
    return siblings[index + 1] || null
  }

  get outerHTML() {
    const attributes = [...this.attributes].map(([name, value]) => `${name}="${value}"`).join(' ')
    return `<${this.tagName.toLowerCase()}${attributes ? ` ${attributes}` : ''}></${this.tagName.toLowerCase()}>`
  }

  setAttribute(name, value) {
    this.attributes.set(String(name), String(value))
  }

  getAttribute(name) {
    return this.attributes.has(String(name)) ? this.attributes.get(String(name)) : null
  }

  hasAttribute(name) {
    return this.attributes.has(String(name))
  }

  removeAttribute(name) {
    this.attributes.delete(String(name))
  }

  appendChild(child) {
    if (child.parentNode) child.remove()
    child.parentNode = this
    this.children.push(child)
    return child
  }

  insertBefore(child, reference) {
    if (child.parentNode) child.remove()
    child.parentNode = this
    const index = reference ? this.children.indexOf(reference) : -1
    if (index === -1) this.children.push(child)
    else this.children.splice(index, 0, child)
    return child
  }

  removeChild(child) {
    const index = this.children.indexOf(child)
    if (index !== -1) this.children.splice(index, 1)
    child.parentNode = null
    return child
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this)
  }

  replaceWith(node) {
    if (!this.parentNode) return
    this.parentNode.insertBefore(node, this)
    this.parentNode.removeChild(this)
  }

  contains(node) {
    if (node === this) return true
    return this.children.some(child => child.contains && child.contains(node))
  }

  closest(selector) {
    const wanted = String(selector)
    let node = this
    while (node) {
      if (matchesAttributeSelector(node, wanted)) return node
      node = node.parentNode
    }
    return null
  }

  matches() {
    return false
  }

  getBoundingClientRect() {
    return { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }
  }

  querySelector() {
    return null
  }

  querySelectorAll() {
    return []
  }

  addEventListener() {}

  removeEventListener() {}

  insertAdjacentHTML(_position, html) {
    this.insertedHtml = (this.insertedHtml || '') + String(html)
  }
}

function matchesAttributeSelector(node, selector) {
  const match = /^\[([^=\]]+)="([^"]*)"\]$/u.exec(selector)
  if (!match) return false
  return node.getAttribute(match[1]) === match[2]
}

function createDocument() {
  const document = {
    title: 'DeepSeek Harness',
    documentElement: new FakeNode('html', null),
    createElement(tagName) {
      return new FakeNode(tagName, document)
    },
    querySelector() {
      return null
    },
    querySelectorAll() {
      return []
    },
    addEventListener() {},
    visibilityState: 'visible',
    readyState: 'complete',
  }
  document.documentElement.lang = 'zh'
  document.documentElement.style = {}
  document.head = new FakeNode('head', document)
  document.body = new FakeNode('body', document)
  document.defaultView = null
  return document
}

function createReact() {
  const createElement = (type, props, ...children) => ({ type, props: props || {}, children })
  return {
    createElement,
    useState(initial) {
      return [typeof initial === 'function' ? initial() : initial, () => {}]
    },
    useEffect() {},
    useMemo(factory) {
      return factory()
    },
    useRef(value) {
      return { current: value }
    },
    Fragment: 'Fragment',
  }
}

function createContext({ spec } = {}) {
  const record = { injections: [], registrations: [], locale: [], labels: [] }
  const declared = spec || (() => ({ kind: 'single', scope: 'root' }))
  const ctx = {
    slots: {
      spec(key) {
        const slot = declared(key)
        return slot === undefined ? undefined : slot
      },
      specDynamic(key) {
        const slot = declared(key)
        return slot === undefined ? undefined : slot
      },
      inject(key, factory) {
        record.injections.push(key)
        const disposers = []
        const previous = ctx.slots.register
        ctx.slots.register = (options, component) => {
          record.registrations.push({ key, options, component })
          const dispose = () => {}
          disposers.push(dispose)
          return dispose
        }
        try {
          factory()
        } finally {
          ctx.slots.register = previous
        }
        return () => disposers.forEach(dispose => dispose())
      },
      register(options, component) {
        record.registrations.push({ key: options && options.name, options, component })
        return () => {}
      },
    },
    locale: {
      register(namespace, locale, dictionary) {
        record.locale.push({ namespace, locale, dictionary })
      },
      subscribe() {
        return () => {}
      },
      bind(namespace) {
        return (key, params) => {
          let text = key
          if (params) {
            for (const [name, value] of Object.entries(params)) text = text.split(`{${name}}`).join(String(value))
          }
          return text
        }
      },
    },
    logger: { info() {}, warn() {}, error() {} },
    webServer: { register() { return () => {} } },
  }
  return { ctx, record }
}

function loadClient({ config, fetchImpl, react } = {}) {
  const document = createDocument()
  const timers = []
  const warnings = []
  const errors = []
  const listeners = []
  let captured = null

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback
      this.observed = false
      listeners.push(this)
    }

    observe() {
      this.observed = true
    }

    disconnect() {
      this.observed = false
    }

    takeRecords() {
      return []
    }
  }

  class FakeFileReader {
    readAsDataURL() {}
  }

  const fetchCalls = []
  const fetchImplFinal = fetchImpl || (async (_url, init) => {
    fetchCalls.push(init || {})
    return {
      ok: true,
      status: 200,
      async json() {
        return { ok: true, config: config || null }
      },
    }
  })

  const window = {
    __ModuleLoader__: {
      load(spec) {
        captured = spec
      },
    },
    setTimeout(callback) {
      timers.push(callback)
      return timers.length
    },
    clearTimeout(handle) {
      if (handle) timers[handle - 1] = null
    },
    location: { href: 'http://127.0.0.1:58520/' },
  }

  const reactFinal = react || createReact()
  const run = new Function(
    'window',
    'document',
    'require',
    'fetch',
    'MutationObserver',
    'FileReader',
    'console',
    source,
  )
  run(
    window,
    document,
    () => reactFinal,
    (...args) => fetchImplFinal(...args),
    FakeMutationObserver,
    FakeFileReader,
    { info() {}, warn: (...args) => warnings.push(args), error: (...args) => errors.push(args), log() {} },
  )

  assert.ok(captured, 'client.js must register itself with window.__ModuleLoader__')
  const module = captured.factory(() => reactFinal)
  return { module, captured, document, timers, warnings, errors, listeners, fetchCalls }
}

const flush = async () => {
  for (let index = 0; index < 5; index += 1) {
    await new Promise(resolve => setImmediate(resolve))
  }
}

test('module envelope declares the slots and locale injections', () => {
  const { module, captured } = loadClient()
  assert.equal(captured.id, 'dsh-ui-custom')
  assert.deepEqual(module.inject, ['slots', 'locale'])
  assert.equal(typeof module.apply, 'function')
})

test('apply registers the settings section and the locale dictionaries', async () => {
  const { module, document } = loadClient({ config: null })
  const { ctx, record } = createContext()
  module.apply(ctx)
  await flush()

  assert.ok(record.injections.includes('settings.section'))
  const section = record.registrations.find(entry => entry.options && entry.options.id === 'ui-custom')
  assert.ok(section, 'the Settings section must be registered')
  assert.equal(section.options.name, 'settings.section')
  assert.equal(section.options.order, 82)
  assert.equal(section.options.label(), 'section')

  const locales = record.locale.filter(entry => entry.namespace === 'dsh-ui-custom')
  assert.deepEqual(locales.map(entry => entry.locale), ['zh', 'en'])
  assert.equal(locales[0].dictionary.section, '系统外观')

  assert.equal(document.title, 'DeepSeek Harness')
  assert.ok(record.injections.includes('conversation.hero.brand.mark') === false)
})

test('apply treats a missing config as blank and keeps the native look', async () => {
  const { module, document, listeners } = loadClient({ config: {} })
  const { ctx } = createContext()
  module.apply(ctx)
  await flush()
  assert.equal(document.title, 'DeepSeek Harness')
  assert.equal(document.head.children.length, 0)
  assert.equal(listeners.filter(observer => observer.observed).length, 0)
})

test('a saved appearance paints the title, favicon and brand slots', async () => {
  const config = {
    name: 'Acme Console',
    logo: '',
    logoMode: 'text',
    logoText: 'AC',
    logoTextSize: 22,
    headlineText: '探索新境',
    runningText: '思考中',
    avatar: '',
  }
  const { module, document, listeners } = loadClient({ config })
  const { ctx, record } = createContext()
  module.apply(ctx)
  await flush()

  assert.equal(document.title, 'Acme Console')
  const favicon = document.head.children.find(child => child.tagName === 'LINK')
  assert.ok(favicon, 'the favicon link must be installed')
  assert.equal(favicon.getAttribute('data-uic-favicon'), '1')
  assert.match(favicon.getAttribute('href'), /^data:image\/svg\+xml,/u)
  assert.equal(favicon.getAttribute('type'), 'image/svg+xml')

  for (const key of ['conversation.hero.brand.mark', 'sidebar.brand.mark', 'sidebar.brand.name']) {
    assert.ok(record.injections.includes(key), `${key} must be injected when the slot is declared`)
  }

  const components = record.registrations
    .filter(entry => entry.component && ['sidebar.brand.mark', 'sidebar.brand.name'].includes(entry.key))
  for (const entry of components) {
    const element = entry.component({ size: 24 })
    assert.ok(element, 'the slot component must render an element')
    if (element && typeof element.type === 'function') {
      const rendered = element.type(element.props)
      assert.ok(rendered, 'the slot component body must render')
    }
  }

  assert.ok(listeners.some(observer => observer.observed), 'a configured appearance starts the sweeper')
})

test('the settings page renders its form for the current appearance', async () => {
  const config = {
    name: 'Acme Console',
    logo: '',
    logoMode: 'text',
    logoText: 'AC',
    logoTextSize: 22,
    headlineText: '探索新境',
    runningText: '思考中',
    avatar: '',
  }
  const base = createReact()
  let hookCalls = 0
  const react = {
    ...base,
    useState(initial) {
      hookCalls += 1
      if (hookCalls === 1) return [config, () => {}]
      return base.useState(initial)
    },
  }
  const { module } = loadClient({ config, react })
  const { ctx, record } = createContext()
  module.apply(ctx)
  await flush()

  const section = record.registrations.find(entry => entry.options && entry.options.id === 'ui-custom')
  const translate = key => `t:${key}`
  const wrapper = section.component({ t: translate, close() {} })
  const page = wrapper.type(wrapper.props)
  assert.equal(page.type, 'div')
  assert.equal(page.props.className, 'uic-root')
  assert.ok(Array.isArray(page.children))
  assert.ok(page.children.length >= 4)
  assert.equal(page.children[0].type, 'style')
  assert.equal(page.children[page.children.length - 1].type, 'div')
  assert.equal(page.children[page.children.length - 1].props.className, 'uic-actions')
})

test('falls back to the DOM path when the sidebar slots are not declared', async () => {
  const config = {
    name: 'Acme Console',
    logo: '',
    logoMode: 'text',
    logoText: 'AC',
    logoTextSize: 22,
    headlineText: '',
    runningText: '',
    avatar: '',
  }
  const { module, document } = loadClient({ config })
  const { ctx, record } = createContext({ spec: () => undefined })
  module.apply(ctx)
  await flush()

  assert.equal(document.title, 'Acme Console')
  assert.equal(record.injections.length, 1)
  assert.equal(record.injections[0], 'settings.section')
})
