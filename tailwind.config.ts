/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        inter: ["var(--font-industry)", "system-ui", "sans-serif"],
        hanson: ["var(--font-industry)", "system-ui", "sans-serif"],
        azonix: ["var(--font-industry)", "system-ui", "sans-serif"],
        heading: ["var(--font-industry)", "system-ui", "sans-serif"],
        body: ["var(--font-industry)", "system-ui", "sans-serif"],
        industry: ["var(--font-industry)", "system-ui", "sans-serif"],
        "industry-ultra": [
          "var(--font-industry-ultra)",
          "var(--font-industry)",
          "system-ui",
          "sans-serif",
        ],
        /** Hitmarker Condensed — standalone numbers (see `.pickem-numeric` in globals.css). */
        hitmarker: [
          "var(--font-hitmarker-condensed)",
          "var(--font-industry)",
          "system-ui",
          "sans-serif",
        ],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        pickem: {
          /** Brand navy — exact #021e42 (also see `--pickem-navy` in globals.css for hsl() contexts). */
          navy: "#021e42",
          /** Brand green — exact #00f976 (also see `--pickem-green` in globals.css). */
          green: "#00f976",
          blue: "hsl(var(--pickem-blue))",
          "navy-light": "hsl(var(--pickem-navy-light))",
          "navy-dark": "hsl(var(--pickem-navy-dark))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
