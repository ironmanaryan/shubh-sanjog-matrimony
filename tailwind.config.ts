import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',

  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        display: ['var(--font-amaranth)', 'Georgia', 'Times New Roman', 'serif'],
      },
      colors: {
        royal: {
          DEFAULT: '#800020',
          deep: '#65001a',
          soft: '#9c1a38',
        },
        luxe: {
          gold: '#D4AF37',
          'gold-soft': '#E8CE7A',
          'gold-deep': '#B8962B',
          cream: '#FFF9F0',
          ivory: '#FFFCF5',
        },
        maroon: {
          50: '#fff5f5',
          100: '#ffe5e5',
          200: '#ffc6c6',
          300: '#ff9d9d',
          400: '#f76a6a',
          500: '#d92d4d',
          600: '#a91336',
          700: '#8a0e2d',
          800: '#6a0d25',
          900: '#4b0d1d',
        },
        gold: {
          50: '#fffaf0',
          100: '#fef1d6',
          200: '#f9d891',
          300: '#f3c663',
          400: '#dca732',
          500: '#c38e18',
          600: '#a67812',
          700: '#845c0e',
          800: '#66430f',
          900: '#4d330e',
        },
      },
      boxShadow: {
        soft: '0 16px 40px rgba(91, 18, 35, 0.08)',
        luxe: '0 24px 60px -12px rgba(128, 0, 32, 0.18), 0 4px 14px rgba(212, 175, 55, 0.12)',
        'luxe-sm': '0 10px 30px -10px rgba(128, 0, 32, 0.16)',
        glow: '0 0 0 1px rgba(212, 175, 55, 0.45), 0 8px 28px rgba(212, 175, 55, 0.22)',
      },
      backgroundImage: {
        'hero-glow': 'radial-gradient(circle at top, rgba(201, 166, 74, 0.18), transparent 40%), radial-gradient(circle at bottom right, rgba(120, 13, 35, 0.14), transparent 35%)',
        'royal-silk': 'linear-gradient(135deg, #800020 0%, #65001a 42%, #3f0010 100%)',
        'gold-thread': 'linear-gradient(90deg, transparent, #D4AF37 18%, #F3E3AC 50%, #D4AF37 82%, transparent)',
      },
      keyframes: {
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(24px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.85)', opacity: '0.7' },
          '70%': { transform: 'scale(1.25)', opacity: '0' },
          '100%': { transform: 'scale(1.25)', opacity: '0' },
        },
      },
      animation: {
        'spin-slow': 'spin-slow 1.1s linear infinite',
        'fade-up': 'fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 2.6s linear infinite',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};

export default config;
