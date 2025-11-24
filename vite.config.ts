import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 배포를 위한 base 경로
// GitHub Pages는 /repository-name 경로를 사용하므로, 
// 저장소 이름에 맞게 수정하세요 (예: /userythm/)
const base = process.env.NODE_ENV === 'production' ? '/userhythm/' : '/'

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})

