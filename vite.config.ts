import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 배포를 위한 base 경로
// 커스텀 도메인 사용 시: '/'
// GitHub Pages 기본 경로 사용 시: '/repository-name/'
// 환경 변수로도 설정 가능: VITE_BASE_PATH
const base = process.env.VITE_BASE_PATH || '/'

// 디버깅: base 경로 확인
if (process.env.NODE_ENV === 'production') {
  console.log('Production build - base path:', base)
}

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: './index.html',
      },
      output: {
        manualChunks: undefined,
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})

