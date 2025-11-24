import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 배포를 위한 base 경로
// GitHub Pages는 /repository-name 경로를 사용하므로, 
// 저장소 이름에 맞게 수정하세요 (예: /userythm/)
// 환경 변수로도 설정 가능: VITE_BASE_PATH
const base = process.env.VITE_BASE_PATH || (process.env.NODE_ENV === 'production' ? '/userhythm/' : '/')

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
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

