import { defineConfig } from 'vite';

// GitHub Pages 주소가 /study-planner/ 아래에 있어서 base를 맞춰줍니다.
export default defineConfig({
  base: '/study-planner/',
  build: { chunkSizeWarningLimit: 1000 },
});
