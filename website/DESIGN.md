# GoCut Release Website: Design Decisions

## 1. Visual Identity & Energy Read
- **Visual Direction**: *Darkroom Precision Editorial Studio*. Reflects GoCut's desktop video editing roots (Go/Wails + 60 FPS Canvas compositor + Film Grain LUT) while maintaining clarity on bright daylight screens via warm stone surfaces (`#F7F7F5`).
- **Energy / Rhythm / Motion**:
  - `ENERGY: 2` (Measured studio restraint; no flashy gradients, no blur clouds, no glow badges).
  - `RHYTHM: 3` (Asymmetric 1.2fr / 1fr hero + bordered 2-column capability plates + full-width comparison ledger + tabbed changelog + wide editorial fork-credit tribute).
  - `MOTION: 1` (Functional state transitions only: tab highlight, accordion/dialog fade, button hover, zero scroll-jacking or continuous bounce).

## 2. Color Palette & Contrast Proof
Verified via `antislop-human/contrast-check.py` (all normal text `>= 4.5:1`, large text & UI control borders `>= 3.0:1`):
- **Dark Theme (Studio Darkroom, default)**:
  - Canvas: `#0C0E14`
  - Surface / Cards: `#141721` (subtle inset `#191D29`)
  - Primary Ink: `#F3F4F8` (17.55:1 on `#0C0E14`, 16.27:1 on `#141721`)
  - Secondary Ink: `#B7BECC` (10.34:1)
  - Muted Metadata: `#959EB2` (7.18:1 on `#0C0E14`, 6.25:1 on `#191D29`)
  - Single Brand Accent: `#633BFB` / `#5933EB` with `#FFFFFF` button ink (5.92:1 / 6.78:1), `#B4A1FF` link ink (8.71:1)
  - Control Borders: `#5E687D` / `#6A758C` (`3.45:1` / `3.86:1`)
- **Light Theme (Studio Daylight)**:
  - Canvas: `#F7F7F5`
  - Surface / Cards: `#FFFFFF` (subtle inset `#ECECE9`)
  - Primary Ink: `#12141C` (17.14:1 on `#F7F7F5`, 18.38:1 on `#FFFFFF`)
  - Secondary Ink: `#3F4452` (9.06:1)
  - Muted Metadata: `#525766` (6.09:1 on `#ECECE9`, 6.72:1 on `#F7F7F5`)
  - Single Brand Accent: `#5029E0` button fill (`#FFFFFF` ink, 7.68:1), `#4621C9` link ink (8.43:1)
  - Control Borders: `#727885` (`4.13:1` on `#F7F7F5`, `4.43:1` on `#FFFFFF`)

## 3. Typography
- **Display & Body**: `'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif` (clean geometric grotesk matching GoCut's desktop brand, clear Indonesian & English legibility, non-blocking swap load).
- **Technical / SHA-256 / Shortcuts**: `'IBM Plex Mono', ui-monospace, 'Cascadia Code', Consolas, monospace` with `tabular-nums`.
- **Line Measure & Wrap**: Body prose constrained `<= 65ch` with `text-wrap: pretty`; headings constrained with `text-wrap: balance`.

## 4. Antislop & Architecture Rationale
- **One Sentence Rationals**:
  - Hero uses asymmetric 48%/52% split placing direct Windows download CTA on the left and genuine live-captured GoCut v0.9.0-beta Editor screenshot on the right without any eyebrow pill badge above `<h1>` (prevents SaaS boilerplate framing).
  - Live GitHub Releases API card handles explicit loading, loaded (live API or offline fallback), and actionable error states with copyable SHA-256 checksums so downloaders can independently verify installer integrity.
  - Dedicated Original Fork Credit section honors ReaCut (`Xiangyu-CAS/rea-capcut`) and REA (`morluto/rea`) transparently alongside the Go + Wails migration ledger so attribution is impossible to miss.
  - macOS and Linux support is stated honestly as "build from source (Go + Wails)" rather than offering nonexistent fake binaries.
  - Native `<dialog closedby="any">` + `showModal()` handles full-resolution screenshot inspection with keyboard Escape, backdrop click, and strict `overscroll-behavior: contain`.
  - Dual-theme support uses `<meta name="color-scheme" content="light dark">` + CSS `light-dark()` + `:root:has(> head > meta[name="color-scheme"][content="dark"])` + non-intrusive 2-state toggle rather than hardcoded single-theme overrides.
