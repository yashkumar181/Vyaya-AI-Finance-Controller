import type { Config } from "tailwindcss"

const config = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-plex-sans)'],
        mono: ['var(--font-plex-mono)'],
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        border: "hsl(var(--border))",
        brand: "hsl(var(--primary))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        exception: {
          timing: "hsl(var(--cat-timing))",
          split: "hsl(var(--cat-split))",
          gst: "hsl(var(--cat-gst))",
          mdr: "hsl(var(--cat-mdr))",
          tds: "hsl(var(--cat-tds))",
          unlinked: "hsl(var(--cat-unlinked))",
          negative: "hsl(var(--cat-negative))",
          duplicate: "hsl(var(--cat-duplicate))",
        }
      },
      boxShadow: {
        // Override default shadows to prevent them from rendering on pure black
        sm: 'none',
        DEFAULT: 'none',
        md: 'none',
        lg: 'none',
        xl: 'none',
        '2xl': 'none',
      }
    },
  },
  plugins: [require("tailwindcss-animate")],
}
export default config