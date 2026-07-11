import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f7f5f1",
        ink: "#2b2622",
        "ink-muted": "#6b6259",
        accent: {
          DEFAULT: "#3d6b66",
          soft: "#e4eeec",
        },
      },
    },
  },
  plugins: [],
};

export default config;
