import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 배포를 위한 base 경로
// 커스텀 도메인 사용 시: '/'
// GitHub Pages 기본 경로 사용 시: '/repository-name/'
// 환경 변수로도 설정 가능: VITE_BASE_PATH
const base = process.env.VITE_BASE_PATH || '/'
const enableSourceMap = process.env.SOURCEMAP === 'true'
const shouldMinify = process.env.MINIFY === 'false' ? false : 'esbuild'
const esbuildTarget = 'es2020'

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    target: esbuildTarget,
    minify: shouldMinify,
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: enableSourceMap,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: './index.html',
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
    esbuildOptions: {
      target: esbuildTarget,
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})

