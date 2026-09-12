# 05. UI/UX Design System & Experience Specifications

## 1. Design Philosophy & Tone

The OTP Platform user interface is designed for **institutional authority, transparent decision-making, and zero friction**:
- **Palette**: Slate and zinc neutrals paired with emerald accents (`#059669` / `#10b981`) for verified trust and amber badges for review gates.
- **Typography**: Clear, highly legible system font stack (`Inter`, `-apple-system`, `sans-serif`) with monospace numbers (`font-mono`) for currency, GSTINs, and quotation codes.
- **Density**: High-information density tailored for commercial decision-makers, with collapsible technical spec drawers.
- **Responsive Architecture**: 100% mobile-first PWA. Works seamlessly on smartphones for on-site facility managers and executive committee tablets/desktops.

---

## 2. Key Screen Specifications

### 2.1 The Identity-Protected Quote Comparison Room (`/rfq/:id/comparison`)
- **Sealed Supplier Cards**: Displays pseudonyms (`Supplier 7X4M`, `Supplier 9K2X`) with color-coded initials.
- **Banded Experience Badges**: Shows track record as generalized tiers ("New", "5-19 projects", "50+ verified completions") to prevent boutique fingerprinting.
- **Side-by-Side Spec Diffing**: Highlights variances against Indian Standards (e.g., panel efficiency, pipe gauge, warranty duration).
- **Weighted Score Gauge**: Displays commercial vs technical vs track record breakdown based on the configured ratio (e.g., 60/30/10).

### 2.2 The Committee Voting Room (`/rfq/:id/vote`)
- **Conflict of Interest Gate**: Modal dialog requiring explicit sign-off ("I confirm that I, my family members, and business associates hold no commercial interest in any participating vendor").
- **Weighted Tally Board**: Real-time progress bar displaying voter turnout and quorum thresholds (e.g., "Quorum: 3 of 5 votes recorded").
- **Live Voting Table**: Radio-button selection with mandatory justification notes if voting against the lowest-cost quotation.

### 2.3 The Award Justification & Decision Receipt Modal (`/rfq/:id/award`)
- **Sentence Starter Guidance**: The manager is prompted with required institutional sentence starters:
  - *"The committee has selected this proposal because..."*
  - *"Technical specifications exceed requirements in the following areas..."*
- **Character Minimum Threshold**: Prevents single-word approvals (minimum 50 characters required).
- **Cryptographic Decision Receipt**: Visual sealed certificate showing timestamp, voter signatures, SHA-256 hash of competing quotes, and commercial terms.

### 2.4 The Super Admin Operations Console (`/admin`)
- **Multi-Tab Telemetry Bar**: Live Buyer Orders, Seller Orders, System Health, Support Tickets, Service Actions, Pre-Production Tests (631 tests), Buyer/Seller Debuggers, SQL Query Terminal, Database Backup/Restore, and Audit Logs.
