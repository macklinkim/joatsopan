import type { Config } from "tailwindcss";

// DESIGN.md 'Precision Insight' 토큰 — SSOT
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // risk semantics
        "risk-high": "#D8362A",
        "risk-warning": "#FEE500",
        "risk-safe": "#2A8D5C",
        // surfaces
        "surface-paper": "#F7F6F0",
        "surface-white": "#FFFFFF",
        "surface-container": "#efeee8",
        // text / structure
        primary: "#1A1A1A",
        "on-surface-variant": "#444748",
        outline: "#747878",
        "outline-variant": "#c4c7c7",
      },
      fontFamily: {
        head: ["var(--font-hanken)", "sans-serif"],
        body: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
      },
      maxWidth: {
        container: "1280px",
      },
      boxShadow: {
        float: "0px 4px 12px rgba(0,0,0,0.05)",
      },
    },
  },
  plugins: [],
};

export default config;
