/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        gts: {
          50: '#f3f1fd',
          100: '#e9e6fb',
          200: '#d5cff7',
          300: '#b8acf1',
          400: '#9780e9',
          500: '#7a5edd',
          600: '#6C5BC0',
          700: '#5c44a8',
          800: '#4d3a8c',
          900: '#3B2A7A',
          950: '#251a5a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
