/**
 * OTP Mobile-First Design System Tokens
 *
 * Extracted and standardized from the homepage mobile cockpit visuals.
 * Used across the web platform, mobile simulator, and native iOS/Android PWA shells.
 */

export const OTP_DESIGN_TOKENS = {
  viewport: {
    targetWidth: '390px',
    maxWidthDesktopSimulator: '430px',
    minTouchTarget: '44px',
    primaryButtonHeight: '48px',
    headerHeight: '48px',
    bottomNavHeight: '56px',
    bottomNavSafePadding: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))',
  },

  radii: {
    none: '0px',
    xs: '4px',
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    '2xl': '20px',
    '3xl': '24px',
    phoneChassis: '42px',
    pill: '9999px',
  },

  typography: {
    fontFamily: {
      sans: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      mono: 'JetBrains Mono, SF Mono, Menlo, Monaco, Consolas, monospace',
    },
    scale: {
      tag: { size: '9px', leading: '12px', weight: '700', tracking: '0.05em' },
      caption: { size: '10px', leading: '14px', weight: '600', tracking: '0.02em' },
      bodySmall: { size: '11px', leading: '16px', weight: '500', tracking: 'normal' },
      body: { size: '12px', leading: '18px', weight: '500', tracking: 'normal' },
      bodyMedium: { size: '13px', leading: '18px', weight: '600', tracking: 'normal' },
      subtitle: { size: '14px', leading: '20px', weight: '700', tracking: '-0.01em' },
      title: { size: '16px', leading: '22px', weight: '800', tracking: '-0.02em' },
      headline: { size: '20px', leading: '26px', weight: '800', tracking: '-0.02em' },
      metricLarge: { size: '22px', leading: '26px', weight: '900', tracking: '-0.03em' },
    },
  },

  colors: {
    primary: {
      brandNavy: '#0f2744',
      brandBlue: '#2563eb',
      brandBlueHover: '#1d4ed8',
      brandBlueSoft: '#eff6ff',
    },
    status: {
      activeGreen: '#059669',
      activeGreenSoft: '#ecfdf5',
      activeGreenBorder: '#a7f3d0',
      actionAmber: '#d97706',
      actionAmberSoft: '#fffbeb',
      actionAmberBorder: '#fde68a',
      settledSlate: '#64748b',
      settledSlateSoft: '#f8fafc',
      settledSlateBorder: '#e2e8f0',
      lockedCyan: '#0891b2',
      lockedCyanSoft: '#ecfeff',
      lockedCyanBorder: '#a5f3fc',
    },
    surfaces: {
      canvas: '#f8fafc',
      cardLight: '#ffffff',
      cardDark: '#090e1a',
      cardBorderLight: '#e2e8f0',
      cardBorderDark: '#1e293b',
      simulatorChassis: '#0f172a',
    },
  },

  fourPillars: {
    price: { label: '₹ Total Cost', icon: '💰', format: '₹#,##,###' },
    tat: { label: 'Delivery TAT', icon: '⚡', format: '# Days' },
    warranty: { label: 'Warranty SLA', icon: '🛡️', format: '# Mo' },
    score: { label: 'Merit Score', icon: '★', format: '★ #.#/10' },
  },
} as const;
