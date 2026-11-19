import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Tauri 期望固定端口，且在 dev 时不要把错误遮罩弹到窗口里
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: 'chrome110', outDir: 'dist', emptyOutDir: true },
})
