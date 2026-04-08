import { defineConfig } from 'vite'
import { resolve } from 'path'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { viteSingleFile } from 'vite-plugin-singlefile'

// ── Player build (default) ────────────────────────────────────────────────────
const playerConfig = {
  plugins: [
    nodePolyfills({
      include: ['buffer', 'stream', 'util', 'events', 'process', 'zlib'],
    }),
    viteSingleFile(),
  ],
  build: {
    target: 'esnext',
    outDir: 'dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'player.html'),
    },
  },
}

// ── Extension: content-script build (IIFE, single file) ──────────────────────
const extensionContentConfig = {
  plugins: [
    nodePolyfills({ include: ['process', 'buffer'] }),
  ],
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/extension/content.js'),
      name: 'GaishanContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
    outDir: 'dist/extension',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
}

// ── Extension: popup + background build (ES modules) ─────────────────────────
// root is set to src/extension so popup.html is output at the top level of outDir
const extensionPopupConfig = {
  root: resolve(__dirname, 'src/extension'),
  plugins: [
    nodePolyfills({ include: ['process', 'buffer'] }),
  ],
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  build: {
    outDir: resolve(__dirname, 'dist/extension'),
    emptyOutDir: false, // content.js already placed by the previous build
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/extension/popup.html'),
        background: resolve(__dirname, 'src/extension/background.js'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
}

// ── Export ────────────────────────────────────────────────────────────────────
export default defineConfig(({ mode }) => {
  if (mode === 'extension-content') return extensionContentConfig
  if (mode === 'extension-popup')   return extensionPopupConfig
  return playerConfig
})
