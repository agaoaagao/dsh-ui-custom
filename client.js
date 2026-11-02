/**
 * dsh-ui-custom — 系统外观 (branding) for any DeepSeek Harness.
 *
 * Browser half of a dual-face plugin. It has two jobs:
 *
 *  1. register the Settings section where the appearance is edited (the page
 *     reads and writes `./config` through the host half's JSON route);
 *  2. paint the saved record on dsh's own surfaces: the sidebar mark and name,
 *     the browser tab icon, the document title, the conversation hero mark, the
 *     conversation headline and the running label/avatar.
 *
 * Surfaces are taken through declared seats wherever dsh offers one — the
 * `sidebar.brand.mark` / `sidebar.brand.name` single slots and
 * `conversation.hero.brand.mark` — because a registered occupant shadows the
 * native fallback through the supported path. Headline, running label and the
 * tab icon have no seat, so they are reconciled by a small MutationObserver
 * sweep that survives React re-renders and is a no-op when nothing changes.
 * Builds older than those slots fall back to the same DOM selectors the gateway
 * used (`[data-slot="sidebar.brand.mark"]`, `svg[class*="_fish"]`).
 *
 * The module is a plain bundle served by `dsh-client-modules`; it carries no dsh
 * runtime imports beyond `react` and reaches the host only through `fetch`.
 *
 * @module dsh-ui-custom/client
 */

;(window.__ModuleLoader__).load({
  id: 'dsh-ui-custom',
  factory(require) {
    const React = require('react')

    /** Same-origin config route claimed by the Node half. */
    const API_PATH = '/dsh-ui-custom/api/config'
    /** Settings nav entry id; also the DOM id of the section. */
    const SECTION_ID = 'ui-custom'
    /** Sits after the gateway panel (81) and before the market (100) when both are installed. */
    const SECTION_ORDER = 82
    /** Encoded data-URL ceiling, mirroring the host limit. */
    const MAX_IMAGE_CHARS = 400_000
    /** Raw file ceiling before encoding. */
    const MAX_IMAGE_BYTES = 300 * 1024
    /**
     * Priority that shadows the shipped occupants of the brand slots.
     *
     * A single slot keeps one occupant per priority, the lowest live priority
     * renders, and the default priority 0 is already taken by the shell's own
     * fish logo and generic brand name. Registering one step below 0 replaces
     * them without unregistering anybody, which no plugin can do.
     */
    const SLOT_PRIORITY = -1
    /** Text the native conversation headline renders; only these are replaced. */
    const NATIVE_HEADLINES = ['探索未至之境', 'Into the Unknown']
    /** Native running label prefixes; only these are replaced. */
    const NATIVE_RUNNING = ['深度求索中', 'Deep diving']

    // ---------------------------------------------------------- dictionaries --

    const ZH = {
      section: '系统外观',
      intro: '这些设置只影响本机 dsh 的界面显示，保存后立即生效。留空的项保持 dsh 原生样式。',
      brandGroup: '品牌',
      name: '系统名称',
      nameHint: '显示在侧边栏与浏览器标签页标题；留空则使用 dsh 原生名称。',
      form: 'Logo 形式',
      formImage: '图片',
      formText: '文字',
      logoText: '徽标文字',
      logoTextHint: '最多 4 个字符；留空则取系统名称的第一个字。',
      logoTextSize: '徽标字号',
      logoTextSizeHint: '10–28，默认 17。',
      logo: 'Logo 图片',
      logoHint: 'PNG / SVG，不超过 300KB；替换侧边栏左上角与浏览器标签页图标。',
      avatar: '会话头像',
      avatarHint: 'PNG / SVG，不超过 300KB；留空则用 Logo，再退回原生鲸鱼。',
      clearImage: '清除图片',
      clearAvatar: '清除头像',
      conversationGroup: '会话页',
      headline: '会话页标题',
      headlineHint: '留空则使用原生标题（探索未至之境）。',
      running: '会话运行中文案',
      runningHint: '留空则使用原生文案（深度求索中），已有时长后缀保持不变。',
      previewGroup: '预览',
      previewBadge: '徽标',
      previewName: '侧边栏名称',
      previewHeadline: '会话标题',
      previewRunning: '运行文案',
      nativeValue: '原生',
      save: '保存外观',
      reset: '恢复默认',
      loading: '正在读取外观设置…',
      saving: '正在保存…',
      loadFail: '读取外观设置失败：{err}',
      saveFail: '保存失败：{err}',
      saved: '已保存，外观已更新。',
      resetDone: '已恢复 dsh 默认外观。',
      badImage: '图片无效或超过 300KB。',
      invalidSize: '徽标字号需在 10–28 之间。',
      close: '关闭',
    }

    const EN = {
      section: 'Branding',
      intro: 'These settings only change this machine’s dsh interface. They apply immediately; an empty field keeps the native dsh look.',
      brandGroup: 'Brand',
      name: 'System name',
      nameHint: 'Shown in the sidebar and the browser tab title. Empty keeps the dsh default.',
      form: 'Logo form',
      formImage: 'Image',
      formText: 'Text',
      logoText: 'Badge text',
      logoTextHint: 'Up to 4 characters. Empty uses the first character of the system name.',
      logoTextSize: 'Badge font size',
      logoTextSizeHint: '10–28, default 17.',
      logo: 'Logo image',
      logoHint: 'PNG / SVG, up to 300KB. Replaces the top-left dsh mark and the tab icon.',
      avatar: 'Conversation avatar',
      avatarHint: 'PNG / SVG, up to 300KB. Empty falls back to the logo, then the native whale.',
      clearImage: 'Clear image',
      clearAvatar: 'Clear avatar',
      conversationGroup: 'Conversation',
      headline: 'Conversation headline',
      headlineHint: 'Empty keeps the native headline (Into the Unknown).',
      running: 'Running label',
      runningHint: 'Empty keeps the native label (Deep diving); the duration suffix is preserved.',
      previewGroup: 'Preview',
      previewBadge: 'Mark',
      previewName: 'Sidebar name',
      previewHeadline: 'Headline',
      previewRunning: 'Running label',
      nativeValue: 'Native',
      save: 'Save appearance',
      reset: 'Restore defaults',
      loading: 'Reading appearance settings…',
      saving: 'Saving…',
      loadFail: 'Could not read appearance settings: {err}',
      saveFail: 'Could not save: {err}',
      saved: 'Saved — the appearance is updated.',
      resetDone: 'dsh’s default appearance is restored.',
      badImage: 'The image is invalid or larger than 300KB.',
      invalidSize: 'The badge font size must be between 10 and 28.',
      close: 'Close',
    }

    // ---------------------------------------------------- config (tolerant) --
    // The host is authoritative; this copy only keeps the form and the local
    // preview correct while a request is in flight.

    const DEFAULTS = {
      name: '',
      logo: '',
      logoMode: 'image',
      logoText: '',
      logoTextSize: 17,
      headlineText: '',
      runningText: '',
      avatar: '',
    }

    function validImageSource(value) {
      if (value === '') return true
      if (typeof value !== 'string') return false
      if (value.length > MAX_IMAGE_CHARS) return false
      if (value.startsWith('data:image/')) return true
      return /^https:\/\//i.test(value)
    }

    function normalize(raw) {
      const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
      const text = (key, max) => (typeof source[key] === 'string' ? source[key].trim().slice(0, max) : DEFAULTS[key])
      const image = key => {
        const value = typeof source[key] === 'string' ? source[key] : DEFAULTS[key]
        return validImageSource(value) ? value : ''
      }
      const size = Number(source.logoTextSize)
      return {
        name: text('name', 40),
        logo: image('logo'),
        logoMode: source.logoMode === 'text' ? 'text' : 'image',
        logoText: text('logoText', 4),
        logoTextSize: Number.isFinite(size) ? Math.round(Math.min(28, Math.max(10, size))) : 17,
        headlineText: text('headlineText', 40),
        runningText: text('runningText', 32),
        avatar: image('avatar'),
      }
    }

    function isBlank(config) {
      return config.name === ''
        && config.logo === ''
        && config.logoText === ''
        && config.logoTextSize === DEFAULTS.logoTextSize
        && config.headlineText === ''
        && config.runningText === ''
        && config.avatar === ''
        && config.logoMode === DEFAULTS.logoMode
    }

    function messageOf(error) {
      if (!error) return ''
      if (typeof error === 'string') return error
      if (typeof error.message === 'string' && error.message !== '') return error.message
      return String(error)
    }

    // ----------------------------------------------------------- live state --
    // Slot components read `state.branding`; `applyBranding` replaces it and
    // notifies subscribers, so a save from the Settings page repaints without a
    // reload.

    const state = {
      /** @type {object} */
      branding: normalize(null),
      /** @type {any} */
      ctx: null,
      applied: false,
      listeners: new Set(),
      /** Slot registration disposers, dropped before each repaint. */
      slotDisposers: [],
      /** Slot keys our registration actually occupies this round. */
      slotSeats: new Set(),
      /** MutationObserver / debounce handle for the DOM sweep. */
      observer: null,
      timer: 0,
      /** Captured native favicons, restored by 恢复默认. */
      originalIcons: [],
      /** Set while our tab icon is mounted. */
      faviconApplied: false,
      /** True once the title was replaced and the native title is remembered. */
      titleApplied: false,
      nativeTitle: '',
      /** Legacy-DOM fallback bookkeeping (builds without the brand slots). */
      legacySidebar: null,
      legacyHero: [],
    }

    function setBranding(next) {
      state.branding = next
      for (const listener of state.listeners) {
        try {
          listener()
        } catch {
          // One broken subscriber must not stop the repaint.
        }
      }
    }

    function useBranding() {
      const [, bump] = React.useState(0)
      React.useEffect(() => {
        const listener = () => bump(version => version + 1)
        state.listeners.add(listener)
        return () => state.listeners.delete(listener)
      }, [])
      return state.branding
    }

    // ------------------------------------------------------ shared geometry --

    /** Size of the text badge, clamped like the gateway did. */
    function badgeSize(branding) {
      const size = Number(branding.logoTextSize)
      return Number.isFinite(size) ? Math.min(28, Math.max(10, Math.round(size))) : 17
    }

    /** Badge text: explicit text, else the first character of the name. */
    function badgeText(branding) {
      const explicit = String(branding.logoText || '').trim()
      const first = String(branding.name || '').trim().slice(0, 1)
      return (explicit || first).slice(0, 4)
    }

    /** Sidebar mark image: only in image form. */
    function sidebarImage(branding) {
      return branding.logoMode === 'text' ? '' : branding.logo
    }

    /** Hero mark image: the conversation avatar wins, then the logo. */
    function heroImage(branding) {
      if (branding.avatar) return branding.avatar
      return branding.logoMode === 'text' ? '' : branding.logo
    }

    /** Running-avatar image: the gateway let the logo stand in even in text form. */
    function runningImage(branding) {
      return branding.avatar || branding.logo || ''
    }

    /** The badge box style shared by every mark. */
    function badgeStyle(branding, size, radius) {
      return {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: radius,
        fontWeight: 700,
        lineHeight: 1,
        fontSize: Math.max(9, Math.round((badgeSize(branding) * size) / 30)),
        background: 'var(--dsw-alias-label-primary, #0f1115)',
        color: 'var(--dsw-alias-bg-base, #fff)',
        userSelect: 'none',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
      }
    }

    function imageBoxStyle(size, radius) {
      return {
        display: 'block',
        width: size,
        height: size,
        borderRadius: radius,
        overflow: 'hidden',
        flex: 'none',
      }
    }

    // ------------------------------------------------------------- slot UI --

    /** The conversation hero mark; props.size is 34 in the empty state. */
    function HeroMark(props) {
      const branding = useBranding()
      const size = Number(props && props.size) > 0 ? Number(props.size) : 34
      const src = heroImage(branding)
      if (src) {
        return React.createElement(
          'span',
          { style: imageBoxStyle(size, Math.max(4, Math.round(size * 0.24))) },
          React.createElement('img', {
            src,
            alt: branding.name || 'logo',
            width: size,
            height: size,
            style: { display: 'block', width: '100%', height: '100%', objectFit: 'cover' },
          }),
        )
      }
      const text = badgeText(branding)
      if (!text) return null
      return React.createElement(
        'span',
        { style: badgeStyle(branding, size, Math.round(size * 0.22)), 'aria-hidden': 'true' },
        text,
      )
    }

    /** The sidebar mark; props.size is the native 24px seat. */
    function SidebarMark(props) {
      const branding = useBranding()
      const size = Number(props && props.size) > 0 ? Number(props.size) : 24
      const src = sidebarImage(branding)
      if (src) {
        return React.createElement(
          'span',
          { style: imageBoxStyle(size, Math.round(size * 0.26)) },
          React.createElement('img', {
            src,
            alt: '',
            style: { display: 'block', width: '100%', height: '100%', objectFit: 'contain' },
          }),
        )
      }
      const text = badgeText(branding)
      if (!text) return null
      return React.createElement('span', { style: badgeStyle(branding, size, Math.round(size * 0.26)) }, text)
    }

    /** The sidebar product name; only registered when the name is set. */
    function SidebarName() {
      const branding = useBranding()
      if (!branding.name) return null
      return React.createElement(
        'span',
        {
          style: {
            display: 'block',
            maxWidth: '13em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: '13px',
            fontWeight: 700,
            lineHeight: 1.2,
          },
        },
        branding.name,
      )
    }

    /** Whether the current ctx declares a slot (older builds may not). */
    function slotDeclared(key) {
      const slots = state.ctx && state.ctx.slots
      if (!slots) return false
      try {
        if (typeof slots.spec === 'function' && slots.spec(key) !== undefined) return true
        if (typeof slots.specDynamic === 'function' && slots.specDynamic(key) !== undefined) return true
      } catch {
        return false
      }
      return false
    }

    /** Whether this round's registration actually occupies the slot. */
    function slotSeat(key) {
      return state.slotSeats.has(key)
    }

    /**
     * Register one occupant and remember its disposer.
     *
     * @param {string} key - the slot key.
     * @param {Function} component - the React component.
     * @returns {boolean} whether a seat was found.
     */
    function registerSlot(key, component) {
      const ctx = state.ctx
      if (!ctx || !ctx.slots || !slotDeclared(key)) return false
      try {
        const dispose = ctx.slots.inject(
          key,
          () => ctx.slots.register({ name: key, priority: SLOT_PRIORITY }, component),
        )
        if (typeof dispose === 'function') state.slotDisposers.push(dispose)
        state.slotSeats.add(key)
        return true
      } catch (error) {
        console.warn('[dsh-ui-custom] could not register', key, error)
        return false
      }
    }

    function disposeSlots() {
      state.slotSeats.clear()
      for (const dispose of state.slotDisposers.splice(0)) {
        try {
          dispose()
        } catch {
          // A stale seat disposes with its declaration; nothing to do.
        }
      }
    }

    // --------------------------------------------------------- tab and title --

    function captureOriginals() {
      try {
        state.originalIcons = Array.from(
          document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]'),
        ).map(link => link.outerHTML)
      } catch {
        state.originalIcons = []
      }
    }

    /** Escape text for an SVG string. */
    function escapeXml(value) {
      return String(value).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;')
    }

    function faviconHref(branding) {
      const name = String(branding.name || '').trim()
      const letter = (String(branding.logoText || '').trim() || name.slice(0, 1)).slice(0, 4)
      if (branding.logoMode === 'image' && branding.logo) return { href: branding.logo, type: '' }
      if (letter === '') return null
      // Inline SVG badge: dark tile with the light letter, inverted in dark mode,
      // exactly as the gateway painted it.
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><style>.b{fill:#0f1115}.t{fill:#ffffff}@media(prefers-color-scheme:dark){.b{fill:#f9fafb}.t{fill:#0f1115}}</style><rect class="b" x="1" y="1" width="30" height="30" rx="8"/><text class="t" x="16" y="16" text-anchor="middle" dominant-baseline="central" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="21" font-weight="700">${escapeXml(letter)}</text></svg>`
      return { href: `data:image/svg+xml,${encodeURIComponent(svg)}`, type: 'image/svg+xml' }
    }

    function iconLinks() {
      return Array.from(document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]'))
    }

    function paintFavicon() {
      const wanted = faviconHref(state.branding)
      if (!wanted) {
        for (const link of iconLinks()) {
          if (link.getAttribute('data-uic-favicon') === '1') link.remove()
        }
        if (!state.faviconApplied) return
        state.faviconApplied = false
        if (iconLinks().length === 0) {
          for (const entry of state.originalIcons) {
            try {
              document.head.insertAdjacentHTML('beforeend', entry)
            } catch {
              // A malformed saved entry must not break the sweep.
            }
          }
        }
        return
      }
      // React re-inserts the native favicon after every shell re-render, so every
      // sweep drops anything that is not ours before re-asserting ours.
      for (const link of iconLinks()) {
        if (link.getAttribute('data-uic-favicon') !== '1') link.remove()
      }
      let own = document.querySelector('link[data-uic-favicon="1"]')
      if (!own) {
        own = document.createElement('link')
        own.setAttribute('data-uic-favicon', '1')
        own.setAttribute('rel', 'icon')
      }
      if (own.getAttribute('href') !== wanted.href) own.setAttribute('href', wanted.href)
      if (wanted.type === '') {
        if (own.hasAttribute('type')) own.removeAttribute('type')
      } else if (own.getAttribute('type') !== wanted.type) {
        own.setAttribute('type', wanted.type)
      }
      if (document.head.lastElementChild !== own) document.head.appendChild(own)
      state.faviconApplied = true
    }

    function paintTitle() {
      const wanted = String(state.branding.name || '').trim()
      if (wanted === '') {
        if (state.titleApplied) {
          state.titleApplied = false
          if (state.nativeTitle !== '') document.title = state.nativeTitle
        }
        return
      }
      if (!state.titleApplied) {
        state.nativeTitle = document.title
        state.titleApplied = true
      }
      if (document.title !== wanted) document.title = wanted
    }

    // ------------------------------------------------- conversation headline --

    function paintHeadline() {
      const wanted = String(state.branding.headlineText || '').trim()
      for (const element of document.querySelectorAll('[class*="titleGroup"] > span')) {
        const first = element.firstChild
        if (!first || first.nodeType !== 3) continue
        const original = element.getAttribute('data-uic-headline')
        if (wanted !== '') {
          if (original === null) {
            // Only a native headline is ours to replace; a session title the user
            // renamed is left alone.
            if (!NATIVE_HEADLINES.includes(String(first.data).trim())) continue
            element.setAttribute('data-uic-headline', first.data)
          }
          if (String(first.data).trim() !== wanted) first.data = wanted
        } else if (original !== null) {
          element.removeAttribute('data-uic-headline')
          if (String(first.data).trim() !== original.trim()) first.data = original
        }
      }
    }

    // ---------------------------------------------------- conversation running --

    /** Match a native running label (plus an optional duration suffix). */
    function splitRunning(text) {
      for (const prefix of NATIVE_RUNNING) {
        if (!text.startsWith(prefix)) continue
        const rest = text.slice(prefix.length)
        if (rest === '' || /^[\s，,:：]/u.test(rest)) return { rest }
      }
      return null
    }

    function hideNode(node) {
      if (!node || node.nodeType !== 1) return
      node.setAttribute('data-uic-hidden', '1')
      node.style.display = 'none'
    }

    function showNode(node) {
      if (!node || node.nodeType !== 1) return
      node.removeAttribute('data-uic-hidden')
      node.style.display = ''
    }

    /** The native element currently carrying the running label. */
    function nativeRunningMark(cell) {
      for (const shimmer of cell.querySelectorAll('[data-shimmer-text]')) {
        if (splitRunning(String(shimmer.textContent || '').trim())) return shimmer
      }
      for (const span of cell.querySelectorAll('span')) {
        if (span.closest('[role="status"]')) continue
        if (span.hasAttribute('data-uic-running-text')) continue
        if (span.children.length > 0) continue
        const text = String(span.textContent || '').trim()
        if (splitRunning(text)) return span
      }
      return null
    }

    function paintRunningLabel(cell, label) {
      const own = cell.querySelector('[data-uic-running-text]')
      if (label === '') {
        if (own) own.remove()
        for (const node of cell.querySelectorAll('[data-uic-hidden="1"]')) showNode(node)
        return
      }
      const mark = nativeRunningMark(cell)
      const parsed = mark ? splitRunning(String(mark.textContent || '').trim()) : null
      if (!mark || !parsed) {
        if (own) own.remove()
        return
      }
      for (const shimmer of cell.querySelectorAll('[data-shimmer-text]')) hideNode(shimmer)
      hideNode(mark)
      const shimmerHost = mark.closest('[data-shimmer]')
      if (shimmerHost) hideNode(shimmerHost)
      const root = (shimmerHost && shimmerHost.parentElement) || mark.parentElement
      const parent = (root && root.parentNode) || cell
      let node = own
      if (!node) {
        node = document.createElement('span')
        node.setAttribute('data-uic-running-text', '1')
        node.style.cssText = 'white-space:nowrap;font-variant-numeric:tabular-nums;min-width:0'
      }
      const content = label + parsed.rest
      if (node.textContent !== content) node.textContent = content
      if (node.parentNode !== parent) parent.insertBefore(node, root && root.nextSibling)
      // Screen readers hear the label without the dangling duration suffix.
      const status = cell.querySelector('[role="status"]')
      if (status && status.textContent !== label) status.textContent = label
    }

    function markSignature(branding) {
      const src = runningImage(branding)
      if (src) return `img:${src}`
      const text = String(branding.logoText || '').trim().slice(0, 4)
      if (text) return `text:${text}:${String(badgeSize(branding))}`
      return ''
    }

    function paintRunningAvatar(cell, branding) {
      const signature = markSignature(branding)
      const existing = cell.querySelector('[data-uic-running-avatar]')
      if (signature === '') {
        if (existing) existing.remove()
        for (const node of cell.querySelectorAll('[data-uic-hidden="1"]')) showNode(node)
        return
      }
      if (existing && existing.getAttribute('data-uic-mark') === signature) return
      if (existing) existing.remove()
      const svg = cell.querySelector('svg[viewBox="0 0 16 16"]')
      const icon = svg && svg.parentElement
      if (!icon) return
      const src = runningImage(branding)
      const node = document.createElement('span')
      node.setAttribute('data-uic-running-avatar', '1')
      node.setAttribute('data-uic-mark', signature)
      if (src) {
        node.style.cssText = 'position:absolute;inset:0;display:block'
        const img = document.createElement('img')
        img.src = src
        img.alt = ''
        img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block'
        node.appendChild(img)
      } else {
        const size = Math.max(9, Math.round((badgeSize(branding) * 14) / 30))
        node.textContent = String(branding.logoText || '').trim().slice(0, 4)
        node.style.cssText = [
          'position:absolute',
          'inset:0',
          'width:100%',
          'height:100%',
          'display:flex',
          'align-items:center',
          'justify-content:center',
          'border-radius:4px',
          'font-weight:700',
          'line-height:1',
          `font-size:${String(size)}px`,
          'background:var(--dsw-alias-label-primary, #0f1115)',
          'color:var(--dsw-alias-bg-base, #fff)',
          'user-select:none',
          'overflow:hidden',
          'white-space:nowrap',
        ].join(';')
      }
      if (!icon.style.position) icon.style.position = 'relative'
      for (const child of Array.from(icon.children)) {
        if (child !== node) hideNode(child)
      }
      icon.appendChild(node)
    }

    function paintRunning(branding) {
      const label = String(branding.runningText || '').trim()
      for (const cell of document.querySelectorAll('[data-chat-running]')) {
        paintRunningLabel(cell, label)
        paintRunningAvatar(cell, branding)
      }
    }

    // ------------------------------------------------ legacy DOM fallbacks --

    function makeLegacyHero(branding) {
      const src = heroImage(branding)
      if (src) {
        const img = document.createElement('img')
        img.src = src
        img.alt = branding.name || 'logo'
        img.style.cssText = 'width:34px;height:34px;border-radius:8px;object-fit:cover;display:block'
        return img
      }
      const box = document.createElement('div')
      box.textContent = badgeText(branding)
      const size = Math.round((badgeSize(branding) * 34) / 30)
      box.style.cssText = [
        'width:34px',
        'height:34px',
        'border-radius:8px',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'font-weight:700',
        `font-size:${String(size)}px`,
        'background:var(--dsw-alias-label-primary, #0f1115)',
        'color:var(--dsw-alias-bg-base, #fff)',
        'user-select:none',
      ].join(';')
      return box
    }

    function paintLegacyHero() {
      const branding = state.branding
      if (!heroImage(branding) && badgeText(branding) === '') return
      for (const svg of document.querySelectorAll('svg[class*="_fish"]')) {
        const parent = svg.parentElement
        if (!parent || parent.getAttribute('data-uic-hero') === '1') continue
        parent.setAttribute('data-uic-hero', '1')
        const badge = makeLegacyHero(branding)
        state.legacyHero.push({ parent, original: svg, badge })
        svg.replaceWith(badge)
      }
    }

    function restoreLegacyHero() {
      for (const entry of state.legacyHero.splice(0)) {
        try {
          if (entry.badge && entry.badge.parentNode) entry.badge.replaceWith(entry.original)
          else if (entry.parent.isConnected && !entry.parent.contains(entry.original)) entry.parent.appendChild(entry.original)
          entry.parent.removeAttribute('data-uic-hero')
        } catch {
          // The node went away with its view; nothing left to restore.
        }
      }
    }

    function sidebarMarkElement() {
      return document.querySelector('[data-slot="sidebar.brand.mark"]')
    }

    function sidebarNameElement() {
      return document.querySelector('[data-slot="sidebar.brand.name"]')
    }

    function makeLegacySidebarMark(branding) {
      const src = sidebarImage(branding)
      if (src) {
        const img = document.createElement('img')
        img.src = src
        img.alt = ''
        img.style.cssText = 'height:26px;max-width:180px;object-fit:contain;display:block'
        return img
      }
      const box = document.createElement('div')
      box.textContent = badgeText(branding)
      box.style.cssText = [
        'width:26px',
        'height:26px',
        'border-radius:7px',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'font-weight:700',
        `font-size:${String(Math.max(9, Math.round((Math.min(badgeSize(branding), 17) * 26) / 30)))}px`,
        'background:var(--dsw-alias-label-primary, #0f1115)',
        'color:var(--dsw-alias-bg-base, #fff)',
        'user-select:none',
      ].join(';')
      return box
    }

    function paintLegacySidebar() {
      const branding = state.branding
      const mark = sidebarMarkElement()
      const hasMark = sidebarImage(branding) !== '' || badgeText(branding) !== ''
      if (mark && hasMark && !slotSeat('sidebar.brand.mark')) {
        if (!state.legacySidebar) state.legacySidebar = { mark, html: mark.innerHTML, rows: [] }
        if (mark.getAttribute('data-uic-mark') !== '1') {
          mark.setAttribute('data-uic-mark', '1')
          mark.replaceChildren(makeLegacySidebarMark(branding))
          // The native row crops its 24px mark; lift the crop so the badge fits.
          let row = mark.parentElement
          for (let depth = 0; row && row !== document.body && depth < 4; depth += 1) {
            const height = row.getBoundingClientRect().height
            if (height > 0 && height < 26) {
              state.legacySidebar.rows.push({ row, minHeight: row.style.minHeight })
              row.style.minHeight = '26px'
            }
            if (window.getComputedStyle(row).overflow !== 'visible') break
            row = row.parentElement
          }
        }
      }
      const nameElement = sidebarNameElement()
      if (nameElement && branding.name && !slotSeat('sidebar.brand.name')) {
        if (!state.legacySidebar) state.legacySidebar = { rows: [] }
        if (!state.legacySidebar.name) {
          state.legacySidebar.name = {
            element: nameElement,
            text: nameElement.textContent,
            fontSize: nameElement.style.fontSize,
            fontWeight: nameElement.style.fontWeight,
          }
        }
        if (nameElement.textContent !== branding.name) nameElement.textContent = branding.name
        if (nameElement.style.fontSize !== '13px') nameElement.style.fontSize = '13px'
        if (nameElement.style.fontWeight !== '700') nameElement.style.fontWeight = '700'
      }
    }

    function restoreLegacySidebar() {
      const saved = state.legacySidebar
      state.legacySidebar = null
      if (!saved) return
      if (saved.mark && typeof saved.html === 'string') {
        saved.mark.removeAttribute('data-uic-mark')
        saved.mark.innerHTML = saved.html
      }
      if (saved.name) {
        const { element, text, fontSize, fontWeight } = saved.name
        element.textContent = text
        element.style.fontSize = fontSize
        element.style.fontWeight = fontWeight
      }
      for (const entry of saved.rows || []) entry.row.style.minHeight = entry.minHeight
    }

    // ---------------------------------------------------------------- paint --

    function paint() {
      paintTitle()
      paintFavicon()
      paintHeadline()
      paintRunning(state.branding)
      const painted = !isBlank(state.branding)
      if (state.legacySidebar || (painted && !slotSeat('sidebar.brand.mark') && !slotSeat('sidebar.brand.name'))) {
        paintLegacySidebar()
      }
      if (painted && !slotSeat('conversation.hero.brand.mark')) paintLegacyHero()
    }

    function schedulePaint() {
      if (state.timer) return
      state.timer = window.setTimeout(() => {
        state.timer = 0
        try {
          paint()
        } catch (error) {
          console.warn('[dsh-ui-custom] repaint failed', error)
        }
      }, 60)
    }

    function startSweeper() {
      if (state.observer) {
        schedulePaint()
        return
      }
      state.observer = new MutationObserver(schedulePaint)
      state.observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true })
      schedulePaint()
    }

    function stopSweeper() {
      if (state.timer) {
        window.clearTimeout(state.timer)
        state.timer = 0
      }
      if (state.observer) {
        state.observer.disconnect()
        state.observer = null
      }
    }

    // ---------------------------------------------------------------- apply --

    function applyBranding(ctx, raw) {
      if (ctx) state.ctx = ctx
      disposeSlots()
      restoreLegacyHero()
      restoreLegacySidebar()
      const branding = normalize(raw)
      setBranding(branding)

      if (heroImage(branding) || badgeText(branding)) {
        registerSlot('conversation.hero.brand.mark', props => React.createElement(HeroMark, { size: props && props.size }))
      }
      if (sidebarImage(branding) || badgeText(branding)) {
        registerSlot('sidebar.brand.mark', props => React.createElement(SidebarMark, { size: props && props.size }))
      }
      if (branding.name) {
        registerSlot('sidebar.brand.name', () => React.createElement(SidebarName))
      }

      try {
        paint()
      } catch (error) {
        console.warn('[dsh-ui-custom] first paint failed', error)
      }
      if (isBlank(branding)) stopSweeper()
      else startSweeper()
    }

    // ------------------------------------------------------------- locale/t --

    function bindTranslate(ctx) {
      try {
        const translate = ctx.locale.bind('dsh-ui-custom')
        translate('section')
        return translate
      } catch {
        const fallback = (key, params) => {
          const language = String((document.documentElement && document.documentElement.lang) || 'zh').toLowerCase()
          const dictionary = language.startsWith('zh') ? ZH : EN
          let text = dictionary[key] || ZH[key] || key
          if (params) {
            for (const [name, value] of Object.entries(params)) text = text.split(`{${name}}`).join(String(value))
          }
          return text
        }
        return fallback
      }
    }

    function safeLabel(translate, key, fallback) {
      try {
        return translate(key)
      } catch {
        return fallback
      }
    }

    // ------------------------------------------------------------ config I/O --

    async function readConfig() {
      const response = await fetch(API_PATH, { credentials: 'same-origin', headers: { accept: 'application/json' } })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data || data.ok !== true) {
        throw new Error((data && data.message) || `HTTP ${String(response.status)}`)
      }
      return normalize(data.config)
    }

    async function writeConfig(draft) {
      const response = await fetch(API_PATH, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(draft),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data || data.ok !== true) {
        throw new Error((data && data.message) || `HTTP ${String(response.status)}`)
      }
      return normalize(data.config)
    }

    async function resetConfig() {
      const response = await fetch(API_PATH, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data || data.ok !== true) {
        throw new Error((data && data.message) || `HTTP ${String(response.status)}`)
      }
      return normalize(data.config)
    }

    // ------------------------------------------------------------ page style --

    const CSS = `
.uic-root{display:flex;flex-direction:column;gap:18px;padding:20px 0 8px;max-width:640px;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary,#0f1115)}
.uic-intro{margin:0;color:var(--dsw-alias-label-secondary,#6b7280)}
.uic-card{display:flex;flex-direction:column;gap:14px;padding:16px 18px;border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:12px;background:var(--dsw-alias-bg-layer-1,#fff)}
.uic-card h3{margin:0;font-size:13px;font-weight:600}
.uic-row{display:flex;flex-direction:column;gap:6px}
.uic-label{font-weight:500}
.uic-hint{margin:0;font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280)}
.uic-input{box-sizing:border-box;width:100%;height:32px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1,#d1d5db);border-radius:8px;background:var(--dsw-alias-bg-base,#fff);color:inherit;font:inherit;outline:none}
.uic-input:focus{border-color:var(--dsw-alias-brand-primary,#4d6bfe)}
.uic-input[type=number]{width:96px}
.uic-inline{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.uic-radio{display:inline-flex;gap:6px;align-items:center;cursor:pointer}
.uic-thumb{width:52px;height:52px;border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:10px;background:var(--dsw-alias-bg-layer-2,#f3f4f6);object-fit:contain;flex:none}
.uic-thumb-empty{display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary,#9ca3af);font-size:11px}
.uic-btn{height:32px;padding:0 14px;border:1px solid var(--dsw-alias-border-l2,#d1d5db);border-radius:8px;background:transparent;color:inherit;font:inherit;cursor:pointer}
.uic-btn:hover{background:var(--dsw-alias-bg-layer-2,#f3f4f6)}
.uic-btn:disabled{opacity:.5;cursor:default}
.uic-btn-primary{border-color:transparent;background:var(--dsw-alias-label-primary,#0f1115);color:var(--dsw-alias-bg-base,#fff)}
.uic-btn-primary:hover{opacity:.9;background:var(--dsw-alias-label-primary,#0f1115)}
.uic-actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
.uic-status{margin:0;font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280)}
.uic-status[data-kind=ok]{color:var(--dsw-alias-state-success-primary,#16a34a)}
.uic-status[data-kind=error]{color:var(--dsw-alias-state-error-primary,#dc2626)}
.uic-preview{display:flex;flex-wrap:wrap;gap:22px;align-items:flex-start}
.uic-preview-item{display:flex;flex-direction:column;gap:8px;min-width:120px}
.uic-preview-caption{font-size:11px;color:var(--dsw-alias-label-secondary,#6b7280)}
.uic-preview-badge{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:7px;font-weight:700;line-height:1;background:var(--dsw-alias-label-primary,#0f1115);color:var(--dsw-alias-bg-base,#fff);user-select:none}
.uic-preview-logo{width:30px;height:30px;border-radius:7px;object-fit:contain}
.uic-preview-name{font-size:13px;font-weight:700}
.uic-preview-headline{font-size:19px;font-weight:600}
.uic-preview-running{font-size:13px;color:var(--dsw-alias-label-secondary,#6b7280)}
`

    // ------------------------------------------------------------- the page --

    function Field(props) {
      return React.createElement(
        'div',
        { className: 'uic-row' },
        React.createElement('span', { className: 'uic-label' }, props.label),
        props.control,
        props.hint ? React.createElement('p', { className: 'uic-hint' }, props.hint) : null,
      )
    }

    function readImageFile(file, translate, onData) {
      if (!file) return
      if (file.size > MAX_IMAGE_BYTES) {
        onData('', translate('badImage'))
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        const data = typeof reader.result === 'string' ? reader.result : ''
        if (!/^data:image\//u.test(data) || data.length > MAX_IMAGE_CHARS) {
          onData('', translate('badImage'))
          return
        }
        onData(data, '')
      }
      reader.onerror = () => onData('', translate('badImage'))
      reader.readAsDataURL(file)
    }

    function SettingsPage(props) {
      const translate = props && typeof props.t === 'function' ? props.t : (key => key)
      const [draft, setDraft] = React.useState(null)
      const [status, setStatus] = React.useState({ kind: 'idle', text: '' })
      const [busy, setBusy] = React.useState(false)

      React.useEffect(() => {
        let alive = true
        readConfig()
          .then(config => {
            if (alive) setDraft(config)
          })
          .catch(error => {
            if (alive) setStatus({ kind: 'error', text: translate('loadFail', { err: messageOf(error) }) })
          })
        return () => {
          alive = false
        }
      }, [])

      function patch(partial) {
        setDraft(current => (current ? { ...current, ...partial } : current))
        setStatus({ kind: 'idle', text: '' })
      }

      function pickImage(key, file) {
        readImageFile(file, translate, (data, error) => {
          if (error) {
            setStatus({ kind: 'error', text: error })
            return
          }
          patch({ [key]: data })
          if (key === 'logo' && draft && draft.logoMode !== 'text') patch({ logoMode: 'image' })
        })
      }

      async function save() {
        if (!draft || busy) return
        setBusy(true)
        setStatus({ kind: 'idle', text: translate('saving') })
        try {
          const config = await writeConfig(draft)
          setDraft(config)
          setStatus({ kind: 'ok', text: translate('saved') })
          applyBranding(state.ctx, config)
        } catch (error) {
          setStatus({ kind: 'error', text: translate('saveFail', { err: messageOf(error) }) })
        } finally {
          setBusy(false)
        }
      }

      async function reset() {
        if (busy) return
        setBusy(true)
        try {
          const config = await resetConfig()
          setDraft(config)
          setStatus({ kind: 'ok', text: translate('resetDone') })
          applyBranding(state.ctx, config)
        } catch (error) {
          setStatus({ kind: 'error', text: translate('saveFail', { err: messageOf(error) }) })
        } finally {
          setBusy(false)
        }
      }

      if (!draft) {
        return React.createElement(
          'div',
          { className: 'uic-root' },
          React.createElement('style', null, CSS),
          React.createElement(
            'p',
            { className: 'uic-status', 'data-kind': status.kind === 'error' ? 'error' : 'idle' },
            status.text || translate('loading'),
          ),
        )
      }

      const badge = draft.logoMode === 'image' && draft.logo ? '' : (draft.logoText || draft.name.slice(0, 1) || 'T')
      const badgeFont = Math.max(9, Math.round((Math.min(28, Math.max(10, draft.logoTextSize)) * 30) / 30))
      const previewHeadline = draft.headlineText || NATIVE_HEADLINES[0]
      const previewRunning = draft.runningText || NATIVE_RUNNING[0]

      const nameControl = React.createElement('input', {
        className: 'uic-input',
        type: 'text',
        maxLength: 40,
        value: draft.name,
        placeholder: 'DeepSeek Harness',
        onChange: event => patch({ name: event.target.value }),
      })

      const logoTextControl = React.createElement('input', {
        className: 'uic-input',
        type: 'text',
        maxLength: 4,
        value: draft.logoText,
        onChange: event => patch({ logoText: event.target.value }),
      })

      const logoTextSizeControl = React.createElement('input', {
        className: 'uic-input',
        type: 'number',
        min: 10,
        max: 28,
        value: draft.logoTextSize,
        onChange: event => patch({ logoTextSize: Number(event.target.value) || 17 }),
      })

      const modeControl = React.createElement(
        'div',
        { className: 'uic-inline' },
        React.createElement(
          'label',
          { className: 'uic-radio' },
          React.createElement('input', {
            type: 'radio',
            name: 'uic-logo-mode',
            checked: draft.logoMode === 'image',
            onChange: () => patch({ logoMode: 'image' }),
          }),
          translate('formImage'),
        ),
        React.createElement(
          'label',
          { className: 'uic-radio' },
          React.createElement('input', {
            type: 'radio',
            name: 'uic-logo-mode',
            checked: draft.logoMode === 'text',
            onChange: () => patch({ logoMode: 'text' }),
          }),
          translate('formText'),
        ),
      )

      const logoControl = React.createElement(
        'div',
        { className: 'uic-inline' },
        draft.logo
          ? React.createElement('img', { className: 'uic-thumb', src: draft.logo, alt: '' })
          : React.createElement('div', { className: 'uic-thumb uic-thumb-empty' }, '—'),
        React.createElement('input', {
          type: 'file',
          accept: 'image/png,image/svg+xml,image/jpeg,image/webp',
          onChange: event => pickImage('logo', event.target.files && event.target.files[0]),
        }),
        draft.logo
          ? React.createElement('button', { type: 'button', className: 'uic-btn', onClick: () => patch({ logo: '' }) }, translate('clearImage'))
          : null,
      )

      const avatarControl = React.createElement(
        'div',
        { className: 'uic-inline' },
        draft.avatar
          ? React.createElement('img', { className: 'uic-thumb', src: draft.avatar, alt: '' })
          : React.createElement('div', { className: 'uic-thumb uic-thumb-empty' }, '—'),
        React.createElement('input', {
          type: 'file',
          accept: 'image/png,image/svg+xml,image/jpeg,image/webp',
          onChange: event => pickImage('avatar', event.target.files && event.target.files[0]),
        }),
        draft.avatar
          ? React.createElement('button', { type: 'button', className: 'uic-btn', onClick: () => patch({ avatar: '' }) }, translate('clearAvatar'))
          : null,
      )

      const headlineControl = React.createElement('input', {
        className: 'uic-input',
        type: 'text',
        maxLength: 40,
        value: draft.headlineText,
        placeholder: NATIVE_HEADLINES[0],
        onChange: event => patch({ headlineText: event.target.value }),
      })

      const runningControl = React.createElement('input', {
        className: 'uic-input',
        type: 'text',
        maxLength: 32,
        value: draft.runningText,
        placeholder: NATIVE_RUNNING[0],
        onChange: event => patch({ runningText: event.target.value }),
      })

      const preview = React.createElement(
        'div',
        { className: 'uic-preview' },
        React.createElement(
          'div',
          { className: 'uic-preview-item' },
          React.createElement('span', { className: 'uic-preview-caption' }, translate('previewBadge')),
          draft.logoMode === 'image' && draft.logo
            ? React.createElement('img', { className: 'uic-preview-logo', src: draft.logo, alt: '' })
            : React.createElement('span', { className: 'uic-preview-badge', style: { fontSize: `${String(badgeFont)}px` } }, badge),
        ),
        React.createElement(
          'div',
          { className: 'uic-preview-item' },
          React.createElement('span', { className: 'uic-preview-caption' }, translate('previewName')),
          React.createElement('span', { className: 'uic-preview-name' }, draft.name || 'DeepSeek Harness'),
        ),
        React.createElement(
          'div',
          { className: 'uic-preview-item' },
          React.createElement('span', { className: 'uic-preview-caption' }, translate('previewHeadline')),
          React.createElement('span', { className: 'uic-preview-headline' }, previewHeadline),
        ),
        React.createElement(
          'div',
          { className: 'uic-preview-item' },
          React.createElement('span', { className: 'uic-preview-caption' }, translate('previewRunning')),
          React.createElement('span', { className: 'uic-preview-running' }, `${previewRunning} 12s`),
        ),
      )

      return React.createElement(
        'div',
        { className: 'uic-root' },
        React.createElement('style', null, CSS),
        React.createElement('p', { className: 'uic-intro' }, translate('intro')),
        React.createElement(
          'section',
          { className: 'uic-card' },
          React.createElement('h3', null, translate('brandGroup')),
          React.createElement(Field, { label: translate('name'), hint: translate('nameHint'), control: nameControl }),
          React.createElement(Field, { label: translate('form'), control: modeControl }),
          React.createElement(
            'div',
            { className: 'uic-inline' },
            React.createElement('div', { style: { flex: '1 1 180px' } }, React.createElement(Field, { label: translate('logoText'), hint: translate('logoTextHint'), control: logoTextControl })),
            React.createElement('div', null, React.createElement(Field, { label: translate('logoTextSize'), hint: translate('logoTextSizeHint'), control: logoTextSizeControl })),
          ),
          React.createElement(Field, { label: translate('logo'), hint: translate('logoHint'), control: logoControl }),
          React.createElement(Field, { label: translate('avatar'), hint: translate('avatarHint'), control: avatarControl }),
        ),
        React.createElement(
          'section',
          { className: 'uic-card' },
          React.createElement('h3', null, translate('conversationGroup')),
          React.createElement(Field, { label: translate('headline'), hint: translate('headlineHint'), control: headlineControl }),
          React.createElement(Field, { label: translate('running'), hint: translate('runningHint'), control: runningControl }),
        ),
        React.createElement(
          'section',
          { className: 'uic-card' },
          React.createElement('h3', null, translate('previewGroup')),
          preview,
        ),
        React.createElement(
          'div',
          { className: 'uic-actions' },
          React.createElement(
            'button',
            { type: 'button', className: 'uic-btn uic-btn-primary', disabled: busy, onClick: save },
            translate('save'),
          ),
          React.createElement('button', { type: 'button', className: 'uic-btn', disabled: busy, onClick: reset }, translate('reset')),
          React.createElement('p', { className: 'uic-status', 'data-kind': status.kind }, status.text),
        ),
      )
    }

    // --------------------------------------------------------------- apply --

    function apply(ctx) {
      if (state.applied) return
      state.applied = true
      state.ctx = ctx
      captureOriginals()
      try {
        ctx.locale.register('dsh-ui-custom', 'zh', ZH)
      } catch {
        // The dictionary is also kept inline; a build without locale still works.
      }
      try {
        ctx.locale.register('dsh-ui-custom', 'en', EN)
      } catch {
        // Same as above.
      }
      const translate = bindTranslate(ctx)

      try {
        ctx.slots.inject('settings.section', () => ctx.slots.register(
          {
            name: 'settings.section',
            id: SECTION_ID,
            order: SECTION_ORDER,
            label: () => safeLabel(translate, 'section', ZH.section),
          },
          props => React.createElement(SettingsPage, { t: translate, close: props && props.close }),
        ))
      } catch (error) {
        console.error('[dsh-ui-custom] could not register the Settings section', error)
      }

      readConfig()
        .then(config => applyBranding(ctx, config))
        .catch(error => console.warn('[dsh-ui-custom] could not read the appearance config', error))
    }

    return { inject: ['slots', 'locale'], apply }
  },
})
