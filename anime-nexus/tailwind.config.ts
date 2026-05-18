import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Base surfaces
        "nt-bg":        "#0a0a0a",
        "nt-surface":   "#111118",
        "nt-panel":     "#16161f",
        "nt-border":    "#1e1e2e",
        "nt-border-hi": "#2a2a3e",

        // Accent — KNN
        "knn":          "#00f2ff",
        "knn-dim":      "#00f2ff33",
        "knn-glow":     "#00f2ff66",

        // Accent — PMF
        "pmf":          "#fff000",
        "pmf-dim":      "#fff00033",
        "pmf-glow":     "#fff00066",

        // Accent — BMF
        "bmf":          "#ff6b00",
        "bmf-dim":      "#ff6b0033",
        "bmf-glow":     "#ff6b0066",

        // Accent — NCF
        "ncf":          "#ff00ff",
        "ncf-dim":      "#ff00ff33",
        "ncf-glow":     "#ff00ff66",

        // Text
        "nt-text":      "#e2e8f0",
        "nt-muted":     "#64748b",
        "nt-faint":     "#334155",
      },
      fontFamily: {
        mono:    ["var(--font-mono)", "JetBrains Mono", "Fira Code", "monospace"],
        display: ["var(--font-display)", "Orbitron", "sans-serif"],
        body:    ["var(--font-body)", "Syne", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "1rem" }],
      },
      boxShadow: {
        "knn-glow":  "0 0 12px 2px #00f2ff55, 0 0 40px 4px #00f2ff22",
        "pmf-glow":  "0 0 12px 2px #fff00055, 0 0 40px 4px #fff00022",
        "bmf-glow":  "0 0 12px 2px #ff6b0055, 0 0 40px 4px #ff6b0022",
        "ncf-glow":  "0 0 12px 2px #ff00ff55, 0 0 40px 4px #ff00ff22",
        "glass":     "inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 24px rgba(0,0,0,0.5)",
        "panel":     "0 0 0 1px rgba(255,255,255,0.06), 0 8px 32px rgba(0,0,0,0.6)",
      },
      backgroundImage: {
        "grid-subtle":  "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)",
        "scan-lines":   "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.07) 2px, rgba(0,0,0,0.07) 4px)",
        "knn-gradient": "linear-gradient(135deg, #00f2ff22, #0a0a0a)",
        "pmf-gradient": "linear-gradient(135deg, #fff00022, #0a0a0a)",
        "bmf-gradient": "linear-gradient(135deg, #ff6b0022, #0a0a0a)",
        "ncf-gradient": "linear-gradient(135deg, #ff00ff22, #0a0a0a)",
      },
      backgroundSize: {
        "grid": "40px 40px",
      },
      animation: {
        "pulse-knn":   "pulse-knn 2s cubic-bezier(0.4,0,0.6,1) infinite",
        "pulse-pmf":   "pulse-pmf 2s cubic-bezier(0.4,0,0.6,1) infinite",
        "pulse-bmf":   "pulse-bmf 2s cubic-bezier(0.4,0,0.6,1) infinite",
        "pulse-ncf":   "pulse-ncf 2s cubic-bezier(0.4,0,0.6,1) infinite",
        "scan":        "scan 8s linear infinite",
        "flicker":     "flicker 0.15s infinite",
        "type-cursor": "type-cursor 1s step-end infinite",
        "slide-in-up": "slide-in-up 0.5s cubic-bezier(0.16,1,0.3,1) both",
        "fade-in":     "fade-in 0.4s ease both",
        "grid-flow":   "grid-flow 20s linear infinite",
      },
      keyframes: {
        "pulse-knn": {
          "0%,100%": { boxShadow: "0 0 8px 1px #00f2ff44" },
          "50%":     { boxShadow: "0 0 20px 4px #00f2ff88" },
        },
        "pulse-pmf": {
          "0%,100%": { boxShadow: "0 0 8px 1px #fff00044" },
          "50%":     { boxShadow: "0 0 20px 4px #fff00088" },
        },
        "pulse-bmf": {
          "0%,100%": { boxShadow: "0 0 8px 1px #ff6b0044" },
          "50%":     { boxShadow: "0 0 20px 4px #ff6b0088" },
        },
        "pulse-ncf": {
          "0%,100%": { boxShadow: "0 0 8px 1px #ff00ff44" },
          "50%":     { boxShadow: "0 0 20px 4px #ff00ff88" },
        },
        "scan": {
          "0%":   { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        "flicker": {
          "0%,100%": { opacity: "1" },
          "50%":     { opacity: "0.92" },
        },
        "type-cursor": {
          "0%,100%": { opacity: "1" },
          "50%":     { opacity: "0" },
        },
        "slide-in-up": {
          "from": { opacity: "0", transform: "translateY(20px)" },
          "to":   { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "from": { opacity: "0" },
          "to":   { opacity: "1" },
        },
        "grid-flow": {
          "0%":   { backgroundPosition: "0 0" },
          "100%": { backgroundPosition: "40px 40px" },
        },
      },
      transitionTimingFunction: {
        "spring": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
