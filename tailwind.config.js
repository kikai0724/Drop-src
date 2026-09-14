/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        discord: '#5865F2',
        discordHover: '#4752C4',
      },
      zIndex: {
        '60': '60',
        '70': '70',
        '100': '100',
      },
    },
  },
  plugins: [],
}



