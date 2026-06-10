/** @type {import('tailwindcss').Config} */
export default {
  // Class-based dark mode toggled by the `dark` class on <html>.
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        // Brand: map-green primary with red/yellow companion accents.
        brand: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15,23,42,.05), 0 14px 30px -20px rgba(15,23,42,.32)',
        lift: '0 16px 36px -18px rgba(22,163,74,.48)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg,#16a34a 0%,#facc15 46%,#ef4444 100%)',
        'aurora':
          'linear-gradient(135deg, rgba(34,197,94,.13) 0 18%, transparent 18% 100%), linear-gradient(45deg, transparent 0 82%, rgba(239,68,68,.12) 82% 100%), radial-gradient(circle at 16px 16px, rgba(250,204,21,.28) 1.3px, transparent 1.4px)',
        'aurora-dark':
          'linear-gradient(135deg, rgba(34,197,94,.16) 0 18%, transparent 18% 100%), linear-gradient(45deg, transparent 0 82%, rgba(248,113,113,.14) 82% 100%), radial-gradient(circle at 16px 16px, rgba(250,204,21,.18) 1.3px, transparent 1.4px)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out',
        'scale-in': 'scale-in 0.18s cubic-bezier(.16,1,.3,1)',
        'slide-up': 'slide-up 0.3s cubic-bezier(.16,1,.3,1)',
      },
    },
  },
  plugins: [],
};
