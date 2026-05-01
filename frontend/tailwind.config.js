/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'es-navy': '#0A1628',
        'es-teal': '#00D4AA',
        'es-deep': '#1A2B4A',
        'es-white': '#F7F8FC',
        'es-green': '#00C896',
        'es-amber': '#F5A623',
        'es-red': '#E8445A',
      },
      animation: {
        'wave-left': 'waveLeft 1s ease-in-out infinite',
        'wave-right': 'waveRight 1s ease-in-out infinite',
      },
      keyframes: {
        waveLeft: {
          '0%': { transform: 'rotate(-44deg) translateY(-3px)' },
          '50%': { transform: 'rotate(-22deg) translateY(-7px)' },
          '100%': { transform: 'rotate(-44deg) translateY(-3px)' },
        },
        waveRight: {
          '0%': { transform: 'rotate(44deg) translateY(-3px)' },
          '50%': { transform: 'rotate(22deg) translateY(-7px)' },
          '100%': { transform: 'rotate(44deg) translateY(-3px)' },
        },
      },
    },
  },
  plugins: [],
};
