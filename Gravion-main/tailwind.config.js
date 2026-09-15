/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background:        '#F7F4EE',
        surface:           '#FFFFFF',
        'surface-hover':   '#F5F1EB',
        'surface-subtle':  '#FBF9F5',
        border:            '#E7E0D5',
        'border-subtle':   '#EDE9E1',

        'text-primary':    '#172B4D',
        'text-secondary':  '#68758A',
        'text-tertiary':   '#8290A3',

        accent:            '#F97316',
        'accent-hover':    '#EA6C0A',
        'accent-light':    '#FFF0E6',
        'accent-muted':    '#FDEBD8',

        navy:              '#172B4D',

        success:           '#22C55E',
        'success-light':   '#F0FDF4',
        warning:           '#F59E0B',
        'warning-light':   '#FFFBEB',
        danger:            '#EF4444',
        'danger-light':    '#FEF2F2',
        info:              '#3B82F6',
        'info-light':      '#EFF6FF',
        purple:            '#8B5CF6',
        'purple-light':    '#F5F3FF',
      },
      fontFamily: {
        sans: ['Space Grotesk', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        soft:          '0 1px 3px rgba(30,40,55,0.05), 0 1px 2px rgba(30,40,55,0.04)',
        card:          '0 4px 14px rgba(30,40,55,0.05)',
        elevated:      '0 4px 20px rgba(30,40,55,0.08)',
        'card-hover':  '0 8px 22px rgba(30,40,55,0.08)',
        'accent-glow': '0 0 0 3px rgba(249,115,22,0.15)',
      },
      animation: {
        'fade-in':  'fadeIn 0.25s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
      },
      keyframes: {
        fadeIn:  { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
};
