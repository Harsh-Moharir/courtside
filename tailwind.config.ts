import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    screens: { xs: '480px', sm: '640px', md: '768px', lg: '1024px', xl: '1440px' },
    extend: {
      // Literal hex values (same as the CSS variables in globals.css) so opacity modifiers like bg-danger/15 work.
      colors: {
        bg: '#0A0A0A',
        surface: '#141414',
        'surface-2': '#1C1C1C',
        border: '#2A2A2A',
        fg: '#FFFFFF',
        muted: '#A3A3A3',
        accent: '#F97316',
        'accent-contrast': '#0A0A0A',
        success: '#22C55E',
        danger: '#EF4444',
        warning: '#EAB308',
        gold: '#FACC15',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Barlow Condensed', 'Impact', 'sans-serif'],
        sans: ['var(--font-body)', 'Inter', 'Noto Sans Devanagari', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '16px', btn: '12px' },
      keyframes: {
        pulseDot: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
        scoreFlash: { '0%': { color: 'var(--accent)', transform: 'scale(1.08)' }, '100%': { color: 'inherit', transform: 'scale(1)' } },
        stamp: { '0%': { transform: 'scale(2.2) rotate(-12deg)', opacity: '0' }, '60%': { transform: 'scale(0.95) rotate(-8deg)', opacity: '1' }, '100%': { transform: 'scale(1) rotate(-8deg)', opacity: '1' } },
      },
      animation: {
        'pulse-dot': 'pulseDot 1.4s ease-in-out infinite',
        'score-flash': 'scoreFlash 600ms ease-out',
        stamp: 'stamp 500ms cubic-bezier(.2,.9,.3,1.2) both',
      },
    },
  },
  plugins: [],
};
export default config;
