/** @type {import('tailwindcss').Config} */
module.exports = {
  // Inclui todos os arquivos sob src/ (app, components, features, stores, etc.)
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {},
  },
  plugins: [],
}