/**
 * Gaishan extension — background service worker (MV3).
 * Minimal: just logs install and keeps the worker alive for message passing.
 */

// eslint-disable-next-line no-undef
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    console.log('[Gaishan] Extension installed.')
  }
})
