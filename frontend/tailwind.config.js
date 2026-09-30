/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./public/**/*.{html,js}",
    "./src/**/*.{html,js,ejs}"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        vermilion: {
          DEFAULT: '#9E1B1E',
          dark: '#7A1215',
          light: '#BF262A',
          crimson: '#C81D25',
          glow: '#FF2E38'
        },
        washi: {
          base: '#FAF7F2',
          surface: '#F3EFE7',
          border: '#E3D7C5',
          muted: '#7F786B'
        },
        sumi: {
          black: '#111116',
          deep: '#1A181C',
          surface: '#242127',
          border: '#3D3642',
          ink: '#0B0A0D'
        },
        gold: {
          crest: '#C5A059',
          light: '#DFBD76',
          antique: '#9C7A3C'
        }
      },
      fontFamily: {
        cinzel: ['"Cinzel"', 'serif'],
        serif: ['"Cormorant Garamond"', 'serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        sans: ['"Space Grotesk"', 'sans-serif']
      },
      boxShadow: {
        'vermilion-glow': '0 0 30px -4px rgba(158, 27, 30, 0.55)',
        'gold-glow': '0 0 25px -4px rgba(197, 160, 89, 0.45)',
        'paper-card': '0 10px 35px rgba(35, 25, 20, 0.06)',
        'hanko': 'inset 0 0 0 2px #9E1B1E, inset 0 0 10px rgba(158, 27, 30, 0.25)'
      }
    }
  },
  plugins: []
};
