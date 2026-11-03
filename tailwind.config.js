/** @type {import('tailwindcss').Config} */
import plugin from 'tailwindcss/plugin';
import colors from 'tailwindcss/colors';

// 다크 모드: 앱에서 쓰는 색을 모두 'CSS 변수'로 바꿔 두고,
// <html class="dark">일 때 같은 이름의 색이 어두운 화면에 맞는 색으로 바뀌게 해요.
// (화면 코드는 그대로 두고 색만 바뀜)

const hex = (h) => {
  const v = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)).join(' ');
};

// 플래너 고유 색 [밝은 화면, 어두운 화면]
const PLANNER = {
  bg: ['#fbf9eb', '#0e140e'],
  card: ['#fffef7', '#171f16'],
  cream: ['#f4f0d8', '#252e21'],
  surface: ['#ffffff', '#1e271d'], // 입력칸·작은 카드 바탕
  light: ['#eef6e8', '#21311b'],
  green: ['#3b6e22', '#4f8a33'],
  deep: ['#2a5216', '#3d6e27'], // 버튼을 눌렀을 때 (두 화면 모두 진한 초록)
  dark: ['#2a5216', '#b6dca0'], // 제목 글자 (어두운 화면에서는 밝은 초록)
  border: ['#55823b', '#68964e'],
};

// 기본 색 이름은 그대로 쓰고, 어두운 화면에서 밝기를 뒤집음 (옅은 바탕 ↔ 진한 글자)
const HUES = ['amber', 'emerald', 'rose', 'sky', 'green', 'orange', 'teal', 'purple', 'pink', 'lime', 'indigo', 'cyan', 'blue', 'red', 'yellow'];
const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
const FLIP = { 50: '950', 100: '900', 200: '800', 300: '700', 400: '400', 500: '500', 600: '600', 700: '300', 800: '200', 900: '100', 950: '50' };
// 회색(slate)은 글자 대비를 위해 따로 정함
const SLATE_DARK = {
  50: '#1a2129', 100: '#232b35', 200: '#313a45', 300: '#475261', 400: '#8391a3', 500: '#9aa7b8',
  600: '#b1bccb', 700: '#cbd5e1', 800: '#e2e8f0', 900: '#f1f5f9', 950: '#f8fafc',
};

const varColor = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const scale = (hue) => Object.fromEntries(SHADES.map((s) => [s, varColor(`c-${hue}-${s}`)]));

const lightVars = {};
const darkVars = {};
Object.entries(PLANNER).forEach(([k, [l, d]]) => {
  lightVars[`--p-${k}`] = hex(l);
  darkVars[`--p-${k}`] = hex(d);
});
SHADES.forEach((s) => {
  lightVars[`--c-slate-${s}`] = hex(colors.slate[s]);
  darkVars[`--c-slate-${s}`] = hex(SLATE_DARK[s]);
});
HUES.forEach((h) => SHADES.forEach((s) => {
  lightVars[`--c-${h}-${s}`] = hex(colors[h][s]);
  darkVars[`--c-${h}-${s}`] = hex(colors[h][FLIP[s]]);
}));
// 그래프 막대 색 (밝은·어두운 화면 각각 색 대비 검사 통과)
Object.assign(lightVars, { '--chart-accent': '#3b6e22', '--chart-base': '#6f9a56' });
Object.assign(darkVars, { '--chart-accent': '#6ea64e', '--chart-base': '#48742f' });

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.js'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Pretendard Variable"', 'Pretendard', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      },
      colors: {
        planner: Object.fromEntries(Object.keys(PLANNER).map((k) => [k, varColor(`p-${k}`)])),
        slate: scale('slate'),
        ...Object.fromEntries(HUES.map((h) => [h, scale(h)])),
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({
        ':root': lightVars,
        'html.dark': { ...darkVars, colorScheme: 'dark' },
      });
    }),
  ],
};
