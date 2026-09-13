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
        background: "#000000",
        "background-elevated": "#0a0a0b",
        "oled-black": "#000000",
        "oled-50": "#050505",
        "oled-100": "#080808",
        "oled-200": "#0B0B0B",
        "surface-dark": "#0F0F10",
        "surface-base": "#121212",
        "surface-raised": "#151515",
        surface: "#121212",
        "surface-hover": "rgba(255, 255, 255, 0.06)",
        "surface-active": "rgba(30, 215, 96, 0.10)",
        "surface-card": "rgba(255, 255, 255, 0.035)",
        primary: "#FFFFFF",
        secondary: "rgba(255, 255, 255, 0.62)",
        muted: "rgba(255, 255, 255, 0.40)",
        subdued: "rgba(255, 255, 255, 0.40)",
        accent: "#1ED760",
        "accent-secondary": "#1DB954",
        "accent-highlight": "#35F27A",
        "accent-hover": "#1ED760",
        "accent-dim": "#15843c",
        border: "rgba(255, 255, 255, 0.08)",
        "border-light": "rgba(255, 255, 255, 0.12)",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Display",
          "SF Pro Text",
          "Inter",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "sans-serif",
        ],
      },
      boxShadow: {
        glass: "0 8px 32px rgba(0, 0, 0, 0.35)",
        player: "0 10px 50px rgba(0, 0, 0, 0.55)",
        glow: "0 0 30px rgba(29, 185, 84, 0.12)",
        "glow-btn": "0 0 25px rgba(30, 215, 96, 0.35)",
        "glow-subtle": "0 0 20px rgba(255, 255, 255, 0.05)",
      },
      keyframes: {
        equalizer1: {
          "0%, 100%": { height: "4px" },
          "50%": { height: "14px" },
        },
        equalizer2: {
          "0%, 100%": { height: "14px" },
          "50%": { height: "6px" },
        },
        equalizer3: {
          "0%, 100%": { height: "8px" },
          "50%": { height: "16px" },
        },
        equalizer4: {
          "0%, 100%": { height: "12px" },
          "50%": { height: "4px" },
        },
      },
      animation: {
        "eq-1": "equalizer1 0.7s ease-in-out infinite",
        "eq-2": "equalizer2 0.6s ease-in-out infinite 0.15s",
        "eq-3": "equalizer3 0.8s ease-in-out infinite 0.3s",
        "eq-4": "equalizer4 0.65s ease-in-out infinite 0.2s",
      },
    },
  },
  plugins: [],
};

export default config;
