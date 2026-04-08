/**
 * Gaishan — injected.js
 *
 * Runs in the PAGE's main world (not the extension isolated world) so it can
 * intercept fetch() and XMLHttpRequest calls made by the streaming player.
 *
 * Dispatches a CustomEvent on window whenever a subtitle file is fetched.
 * The extension content script listens for that event.
 *
 * No imports — this file is copied verbatim into the extension package.
 */
;(function () {
  if (window.__gaishanInjected) return
  window.__gaishanInjected = true

  // ── URL filter ─────────────────────────────────────────────────────────────
  function isSubtitleUrl(url) {
    if (!url || typeof url !== 'string') return false
    // Netflix TTML / DFXP / VTT subtitle patterns
    return /\.(ttml|dfxp|vtt|xml)(\?|#|$)/i.test(url) ||
           /[?&]([^&]*[=_-])?(timedtext|subtitle|caption)/i.test(url) ||
           /\/timedtext\//i.test(url)
  }

  function emit(url, content) {
    window.dispatchEvent(new CustomEvent('gaishan-subtitle', {
      detail: { url, content }
    }))
  }

  // ── Hook fetch ─────────────────────────────────────────────────────────────
  const _fetch = window.fetch
  window.fetch = function (input, init) {
    const url =
      typeof input === 'string' ? input :
      input instanceof URL     ? input.href :
                                 (input?.url || '')
    const promise = _fetch.apply(this, arguments)
    if (isSubtitleUrl(url)) {
      promise
        .then(r => r.clone().text().then(t => emit(url, t)))
        .catch(() => {})
    }
    return promise
  }

  // ── Hook XMLHttpRequest ────────────────────────────────────────────────────
  const _open = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (method, url) {
    if (isSubtitleUrl(url)) {
      this.addEventListener('load', function () {
        emit(url, this.responseText)
      })
    }
    return _open.apply(this, arguments)
  }
})()
