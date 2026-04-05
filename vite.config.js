import { defineConfig } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [
    nodePolyfills({
      include: ['buffer', 'stream', 'util', 'events', 'process', 'zlib'],
    }),
    viteSingleFile(),
  ],
  build: {
    target: 'esnext',
  },
})
