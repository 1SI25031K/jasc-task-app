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
        primary: {
          DEFAULT: "var(--md-sys-color-primary)",
          container: "var(--md-sys-color-primary-container)",
        },
        "on-primary": {
          DEFAULT: "var(--md-sys-color-on-primary)",
          container: "var(--md-sys-color-on-primary-container)",
        },
        secondary: {
          DEFAULT: "var(--md-sys-color-secondary)",
          container: "var(--md-sys-color-secondary-container)",
        },
        "on-secondary": {
          DEFAULT: "var(--md-sys-color-on-secondary)",
          container: "var(--md-sys-color-on-secondary-container)",
        },
        surface: {
          DEFAULT: "var(--md-sys-color-surface)",
          dim: "var(--md-sys-color-surface-dim)",
          bright: "var(--md-sys-color-surface-bright)",
          container: {
            lowest: "var(--md-sys-color-surface-container-lowest)",
            low: "var(--md-sys-color-surface-container-low)",
            DEFAULT: "var(--md-sys-color-surface-container)",
            high: "var(--md-sys-color-surface-container-high)",
            highest: "var(--md-sys-color-surface-container-highest)",
          },
        },
        "on-surface": {
          DEFAULT: "var(--md-sys-color-on-surface)",
          variant: "var(--md-sys-color-on-surface-variant)",
        },
        outline: {
          DEFAULT: "var(--md-sys-color-outline)",
          variant: "var(--md-sys-color-outline-variant)",
        },
        error: {
          DEFAULT: "var(--md-sys-color-error)",
          container: "var(--md-sys-color-error-container)",
        },
        "on-error": {
          DEFAULT: "var(--md-sys-color-on-error)",
          container: "var(--md-sys-color-on-error-container)",
        },
      },
      fontFamily: {
        sans: ["'Google Sans Flex'", "'Noto Sans JP'", "sans-serif"],
      },
      borderRadius: {
        "m3-xs": "4px",
        "m3-sm": "8px",
        "m3-md": "12px",
        "m3-lg": "16px",
        "m3-xl": "28px",
        "m3-full": "9999px",
      },
    },
  },
  plugins: [],
};

export default config;
