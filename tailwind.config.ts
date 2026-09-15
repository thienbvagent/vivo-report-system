import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        vivo: {
          blue: "#415fff",
          dark: "#0a192f",
          accent: "#2563eb",
          light: "#f0f4ff"
        }
      }
    },
  },
  plugins: [],
};
export default config;
