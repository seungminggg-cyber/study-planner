/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.js'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Pretendard Variable"', 'Pretendard', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      },
      // 예전 플래너의 초록 노트 색감을 그대로 가져왔어요.
      colors: {
        planner: {
          bg: '#fbf9eb',
          card: '#fffef7',
          cream: '#f4f0d8',
          green: '#3b6e22',
          dark: '#2a5216',
          light: '#eef6e8',
          border: '#55823b',
        },
      },
    },
  },
  plugins: [],
};
