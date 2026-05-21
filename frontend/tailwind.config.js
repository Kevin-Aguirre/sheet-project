/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        dark: {
          50: "#e6e6eb",
          100: "#c0c0cc",
          200: "#9696ab",
          300: "#6c6c8a",
          400: "#4d4d72",
          500: "#2e2e5a",
          600: "#292952",
          700: "#232348",
          800: "#1d1d3e",
          900: "#12122e",
          950: "#0a0a1a",
        },
        accent: {
          DEFAULT: "#6366f1",
          light: "#818cf8",
          dark: "#4f46e5",
        },
      },
    },
  },
  plugins: [],
};
