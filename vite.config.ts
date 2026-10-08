import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/quickreader/',
  plugins: [react()],
  resolve: {
    dedupe: [
      '@tiptap/core',
      '@tiptap/pm',
      'prosemirror-state',
      'prosemirror-model',
      'prosemirror-view',
    ],
  },
})
