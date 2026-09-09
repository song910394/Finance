/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './App.tsx', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontSize: {
        xs: ['0.875rem', { lineHeight: '1.35rem' }],
        sm: ['1rem', { lineHeight: '1.5rem' }],
        base: ['1.0625rem', { lineHeight: '1.6rem' }],
        lg: ['1.25rem', { lineHeight: '1.75rem' }],
        xl: ['1.375rem', { lineHeight: '1.875rem' }],
        '2xl': ['1.75rem', { lineHeight: '2.125rem' }]
      },
      fontFamily: { sans: ['"Noto Sans TC"', '"Microsoft JhengHei"', 'system-ui', 'sans-serif'] }
    }
  },
  plugins: []
};
