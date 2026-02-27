/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx,mdx}',
    './components/**/*.{js,jsx,ts,tsx,mdx}',
    './content/**/*.{md,mdx}',
    './mdx-components.js'
  ],
  corePlugins: {
    preflight: false
  },
  theme: {
    extend: {}
  },
  plugins: [require('@tailwindcss/typography')]
}
