/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0fdf6',
          100: '#dbfbe9',
          200: '#b9f5d5',
          300: '#82eab5',
          400: '#47d78d',
          500: '#20bd6e',
          600: '#149a58',
          700: '#137a49',
          800: '#14613d',
          900: '#124f34',
          950: '#062c1c',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
