import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    screens: { xs: '480px', sm: '640px', md: '768px', lg: '1024px', xl: '1440px' },
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        border: 'var(--border)',
        fg: 'var(--text)',
        muted: 'var(--muted)',
        accent: 'var(--accent)',
        'accent-contrast': 'var(--accent-contrast)',
        success: 'var(--success)',
        danger: 'var(--danger)',
        warning: 'var(--warning)',
        gold: 'var(--icon-gold)',
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
