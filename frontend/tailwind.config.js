/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
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
      // PR 3.2 — шкала шрифта кабинета, 6 ступеней:
      // xs 12 · small 13 · sm 14 · base 16 · xl 20 · heading 28 (минимум 12px).
      // Размеры вне шкалы (text-[11px], text-lg, text-2xl…) в кабинете сведены к ним.
      fontSize: {
        small: ['13px', { lineHeight: '18px' }],
        // Linear-подход: заголовкам — слегка уженный трекинг (DESIGN.md §5).
        heading: ['28px', { lineHeight: '36px', letterSpacing: '-0.01em' }],
        // Вид Premium (16.09): крупный заголовок первого экрана раздела («Кому писать первым.»).
        hero: ['clamp(2.25rem, 5vw, 3.5rem)', { lineHeight: '1.06', letterSpacing: '-0.035em' }],
      },
      // Моушен-токены (DESIGN.md §4): длительности/изинги едины для всего кабинета.
      transitionDuration: {
        fast: '120ms',
        base: '200ms',
        slow: '280ms',
      },
      transitionTimingFunction: {
        enter: 'cubic-bezier(0.23, 1, 0.32, 1)',
        move: 'cubic-bezier(0.77, 0, 0.175, 1)',
      },
      colors: {
        // === §1.1 редизайн 2026-06-03 — единая бренд-шкала ===
        brand: {
          50: 'var(--brand-50)',
          100: 'var(--brand-100)',
          200: 'var(--brand-200)',
          300: 'var(--brand-300)',
          400: 'var(--brand-400)',
          500: 'var(--brand-500)',
          600: 'var(--brand-600)',
          700: 'var(--brand-700)',
          800: 'var(--brand-800)',
        },
        // === PR 3.1 — семантический слой (app/globals.css, --color-*) ===
        ui: {
          bg: 'hsl(var(--color-bg) / <alpha-value>)',
          surface: 'hsl(var(--color-surface) / <alpha-value>)',
          'surface-2': 'hsl(var(--color-surface-2) / <alpha-value>)',
          border: 'hsl(var(--color-border) / <alpha-value>)',
          text: 'hsl(var(--color-text) / <alpha-value>)',
          'text-muted': 'hsl(var(--color-text-muted) / <alpha-value>)',
          accent: 'hsl(var(--color-accent) / <alpha-value>)',
          'accent-hover': 'hsl(var(--color-accent-hover) / <alpha-value>)',
          'accent-contrast': 'hsl(var(--color-accent-contrast) / <alpha-value>)',
          danger: 'hsl(var(--color-danger) / <alpha-value>)',
          warning: 'hsl(var(--color-warning) / <alpha-value>)',
          success: 'hsl(var(--color-success) / <alpha-value>)',
          info: 'hsl(var(--color-info) / <alpha-value>)',
        },
        signal: {
          hot: 'var(--signal-hot)',
          warm: 'var(--signal-warm)',
          cool: 'var(--signal-cool)',
          good: 'var(--signal-good)',
          muted: 'var(--signal-muted)',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        'saas-primary': 'hsl(var(--color-primary))',
        'saas-primary-hover': 'hsl(var(--color-primary-hover))',
        'saas-primary-weak': 'hsl(var(--color-primary-weak))',
        'saas-danger': 'hsl(var(--color-danger))',
        'saas-danger-hover': 'hsl(var(--color-danger-hover))',
        'saas-danger-weak': 'hsl(var(--color-danger-weak))',
        surface: {
          DEFAULT: 'hsl(var(--surface))',
          2: 'hsl(var(--surface-2))',
        },
        'nav-bg': 'hsl(var(--nav-bg))',
        'nav-border': 'hsl(var(--nav-border))',
        'nav-text': 'hsl(var(--nav-text))',
        'nav-text-hover': 'hsl(var(--nav-text-hover))',
        'nav-hover-bg': 'hsl(var(--nav-hover-bg))',
        'nav-active-bg': 'hsl(var(--nav-active-bg))',
        'nav-active-text': 'hsl(var(--nav-active-text))',
        'nav-active-indicator': 'hsl(var(--nav-active-indicator))',
        'nav-focus-ring': 'hsl(var(--nav-focus-ring))',
        'control-border': 'hsl(var(--control-border))',
        'control-border-hover': 'hsl(var(--control-border-hover))',
        'control-border-focus': 'hsl(var(--control-border-focus))',
        'focus-ring': 'hsl(var(--focus-ring))',
      },
      // PR 3.1 — 3 ступени скруглений: control 6 / card 10 / panel 16 (app/globals.css).
      // Старые имена сведены к ним, чтобы все экраны сразу перешли на шкалу.
      borderRadius: {
        control: 'var(--radius-control)',
        card: 'var(--radius-card)',
        panel: 'var(--radius-panel)',
        DEFAULT: 'var(--radius-control)',
        sm: 'var(--radius-control)',
        md: 'var(--radius-control)',
        lg: 'var(--radius-card)',
        xl: 'var(--radius-card)',
        '2xl': 'var(--radius-panel)',
        '3xl': 'var(--radius-panel)',
        'v2-sm': 'var(--radius-sm-v2)',
        v2: 'var(--radius-v2)',
        'v2-lg': 'var(--radius-lg-v2)',
        pill: 'var(--radius-pill)',
      },
      // PR 3.1 — 3 ступени теней: raised / floating / overlay. Старые имена сведены к ним.
      boxShadow: {
        raised: 'var(--shadow-raised)',
        floating: 'var(--shadow-floating)',
        overlay: 'var(--shadow-overlay)',
        DEFAULT: 'var(--shadow-raised)',
        sm: 'var(--shadow-raised)',
        md: 'var(--shadow-floating)',
        lg: 'var(--shadow-overlay)',
        xl: 'var(--shadow-overlay)',
        '2xl': 'var(--shadow-overlay)',
        'v2-sm': 'var(--shadow-v2-sm)',
        v2: 'var(--shadow-v2)',
        'v2-hover': 'var(--shadow-v2-hover)',
      },
      backgroundImage: {
        'brand-gradient': 'var(--brand-gradient)',
      },
    },
  },
  plugins: [],
};
