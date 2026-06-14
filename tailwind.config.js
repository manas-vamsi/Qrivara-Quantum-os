/** @type {import('tailwindcss').Config} */
const withAlpha = (variable) => `rgb(var(${variable}) / <alpha-value>)`;

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: withAlpha("--bg"),
        "bg-deep": withAlpha("--bg-deep"),
        surface: {
          DEFAULT: withAlpha("--surface"),
          2: withAlpha("--surface-2"),
          3: withAlpha("--surface-3"),
        },
        line: {
          DEFAULT: withAlpha("--border"),
          strong: withAlpha("--border-strong"),
        },
        fg: {
          DEFAULT: withAlpha("--fg"),
          muted: withAlpha("--fg-muted"),
          subtle: withAlpha("--fg-subtle"),
        },
        primary: {
          DEFAULT: withAlpha("--primary"),
          fg: withAlpha("--primary-fg"),
          soft: withAlpha("--primary-soft"),
        },
        cyan: {
          DEFAULT: withAlpha("--cyan"),
        },
        violet: {
          DEFAULT: withAlpha("--violet"),
        },
        success: withAlpha("--success"),
        warning: withAlpha("--warning"),
        error: withAlpha("--error"),
      },
      fontFamily: {
        sans: [
          "Inter var",
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
        display: [
          "Space Grotesk",
          "Inter var",
          "Inter",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
        "3xl": "1.375rem",
      },
      boxShadow: {
        soft: "0 1px 2px rgb(0 0 0 / 0.18)",
        card: "0 1px 0 0 rgb(255 255 255 / 0.03) inset, 0 1px 2px 0 rgb(0 0 0 / 0.28)",
        glow: "0 0 0 1px rgb(var(--primary) / 0.32), 0 0 28px -6px rgb(var(--primary) / 0.40)",
        "glow-cyan": "0 0 24px -6px rgb(var(--cyan) / 0.50)",
        pop: "0 16px 48px -16px rgb(0 0 0 / 0.7), 0 1px 0 0 rgb(255 255 255 / 0.04) inset",
      },
      backgroundImage: {
        "grid-dark":
          "linear-gradient(rgb(255 255 255 / 0.025) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.025) 1px, transparent 1px)",
        "radial-fade":
          "radial-gradient(120% 120% at 50% 0%, rgb(var(--primary) / 0.10) 0%, transparent 55%)",
        "brand-gradient":
          "linear-gradient(120deg, rgb(var(--primary)) 0%, rgb(var(--cyan)) 55%, rgb(var(--violet)) 110%)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.9)", opacity: "0.7" },
          "70%, 100%": { transform: "scale(1.6)", opacity: "0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "spin-slow": {
          to: { transform: "rotate(360deg)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.4s cubic-bezier(0.16,1,0.3,1) both",
        "scale-in": "scale-in 0.25s cubic-bezier(0.16,1,0.3,1) both",
        shimmer: "shimmer 1.8s infinite",
        "pulse-ring": "pulse-ring 2.4s cubic-bezier(0.4,0,0.6,1) infinite",
        float: "float 6s ease-in-out infinite",
        "spin-slow": "spin-slow 18s linear infinite",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};
