import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(() => {
  const isGithubPages = process.env.GITHUB_PAGES === 'true'
  return {
    // GitHub Pages serves under /<repo-name>/, local dev serves under /
    base: isGithubPages ? '/Calendar-Log/' : '/',
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:5175',
          changeOrigin: true,
        },
      },
    },
  }
})
