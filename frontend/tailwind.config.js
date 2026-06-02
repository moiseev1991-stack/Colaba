/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // §1.2 редизайн 2026-06-03 — display и body через next/font.
        // var(--font-display) = Unbounded, var(--font-body) = Manrope.
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      colors: {
        // === §1.1 редизайн 2026-06-03 — единая бренд-шкала ===
        brand: {
          50: 'var(--brand-50)',
          100: 'var(--brand-100)',
          200: 'var(--brand-200)',
          400: 'var(--brand-400)',
          500: 'var(--brand-500)',
          600: 'var(--brand-600)',
          700: 'var(--brand-700)',
        },
        signal: {
          hot:   'var(--signal-hot)',
          warm:  'var(--signal-warm)',
          cool:  'var(--signal-cool)',
          good:  'var(--signal-good)',
          muted: 'var(--signal-muted)',
        },
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
        "saas-primary": "hsl(var(--color-primary))",
        "saas-primary-hover": "hsl(var(--color-primary-hover))",
        "saas-primary-weak": "hsl(var(--color-primary-weak))",
        "saas-danger": "hsl(var(--color-danger))",
        "saas-danger-hover": "hsl(var(--color-danger-hover))",
        "saas-danger-weak": "hsl(var(--color-danger-weak))",
        surface: {
          DEFAULT: "hsl(var(--surface))",
          2: "hsl(var(--surface-2))",
        },
        "nav-bg": "hsl(var(--nav-bg))",
        "nav-border": "hsl(var(--nav-border))",
        "nav-text": "hsl(var(--nav-text))",
        "nav-text-hover": "hsl(var(--nav-text-hover))",
        "nav-hover-bg": "hsl(var(--nav-hover-bg))",
        "nav-active-bg": "hsl(var(--nav-active-bg))",
        "nav-active-text": "hsl(var(--nav-active-text))",
        "nav-active-indicator": "hsl(var(--nav-active-indicator))",
        "nav-focus-ring": "hsl(var(--nav-focus-ring))",
        "control-border": "hsl(var(--control-border))",
        "control-border-hover": "hsl(var(--control-border-hover))",
        "control-border-focus": "hsl(var(--control-border-focus))",
        "focus-ring": "hsl(var(--focus-ring))",
      },
      borderRadius: {
        lg: "var(--radius-lg)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)",
        // §1.3 редизайн 2026-06-03 — премиальные радиусы для нового языка
        'v2-sm': 'var(--radius-sm-v2)',
        'v2':    'var(--radius-v2)',
        'v2-lg': 'var(--radius-lg-v2)',
        pill:    'var(--radius-pill)',
      },
      boxShadow: {
        'v2-sm':    'var(--shadow-v2-sm)',
        'v2':       'var(--shadow-v2)',
        'v2-hover': 'var(--shadow-v2-hover)',
      },
      backgroundImage: {
        'brand-gradient':  'var(--brand-gradient)',
        'accent-gradient': 'var(--accent-gradient)',
      },
    },
  },
  plugins: [],
};
