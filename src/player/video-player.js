/**
 * Manages video playback from a local MKV File via blob URL or a remote URL.
 */
export function createPlayer(videoEl) {
  let blobUrl = null

  function load(file) {
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl)
      blobUrl = null
    }
    blobUrl = URL.createObjectURL(file)
    videoEl.src = blobUrl
  }

  function loadUrl(url) {
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl)
      blobUrl = null
    }
    videoEl.src = url
  }

  function destroy() {
    videoEl.pause()
    videoEl.removeAttribute('src')
    videoEl.load()
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl)
      blobUrl = null
    }
  }

  return { load, loadUrl, destroy }
}
