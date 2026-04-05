const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getInitialPath: () => ipcRenderer.invoke('get-initial-path'),
  getInitialUrl: () => ipcRenderer.invoke('get-initial-url'),
  readDir: (dirPath) => ipcRenderer.invoke('read-dir', dirPath),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  fetchUrlBytes: async (url) => {
    const data = await ipcRenderer.invoke('fetch-url-bytes', url)
    return new Uint8Array(data)
  },
  fetchUrlStream: (url) => ipcRenderer.invoke('fetch-url-stream', url),
  onUrlStreamChunk: (callback) => {
    const listener = (_, chunk, bytesRead, total) => callback(new Uint8Array(chunk), bytesRead, total)
    ipcRenderer.on('url-stream-chunk', listener)
    return () => ipcRenderer.removeListener('url-stream-chunk', listener)
  },
  onUrlStreamDone: (callback) => {
    ipcRenderer.once('url-stream-done', () => callback())
  },
})
