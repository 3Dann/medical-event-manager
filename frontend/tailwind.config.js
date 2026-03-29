/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: { 50:'#eff6ff', 100:'#dbeafe', 500:'#3b82f6', 600:'#2563eb', 700:'#1d4ed8', 800:'#1e40af' },
        medical: { 50:'#f0fdf4', 500:'#22c55e', 600:'#16a34a', 700:'#15803d' },
      }
    },
  },
  plugins: [],
}
