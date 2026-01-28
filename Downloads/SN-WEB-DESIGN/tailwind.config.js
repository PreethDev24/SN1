/** Minimal Tailwind config for Next.js app with class-based dark mode */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx,js,jsx}",
    "./pages/**/*.{ts,tsx,js,jsx}",
    "./components/**/*.{ts,tsx,js,jsx}",
  ],
  darkMode: 'class', // enable class-based dark mode as used by html className="dark"
  theme: {
    extend: {},
  },
  plugins: [],
};
