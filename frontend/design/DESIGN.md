
## Directivas de diseño del frontend

name-design: Cinematic Precision
colors:
  surface: '#031427'
  surface-dim: '#031427'
  surface-bright: '#2a3a4f'
  surface-container-lowest: '#000f21'
  surface-container-low: '#0b1c30'
  surface-container: '#102034'
  surface-container-high: '#1b2b3f'
  surface-container-highest: '#26364a'
  on-surface: '#d3e4fe'
  on-surface-variant: '#c4c5d9'
  inverse-surface: '#d3e4fe'
  inverse-on-surface: '#213145'
  outline: '#8e90a2'
  outline-variant: '#434656'
  surface-tint: '#b8c3ff'
  primary: '#b8c3ff'
  on-primary: '#002388'
  primary-container: '#2e5bff'
  on-primary-container: '#efefff'
  inverse-primary: '#124af0'
  secondary: '#c8c6c7'
  on-secondary: '#313031'
  secondary-container: '#4a494a'
  on-secondary-container: '#bab8b9'
  tertiary: '#c6c6c7'
  on-tertiary: '#2f3131'
  tertiary-container: '#6c6d6d'
  on-tertiary-container: '#f0f0f0'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#dde1ff'
  primary-fixed-dim: '#b8c3ff'
  on-primary-fixed: '#001356'
  on-primary-fixed-variant: '#0035be'
  secondary-fixed: '#e5e2e3'
  secondary-fixed-dim: '#c8c6c7'
  on-secondary-fixed: '#1c1b1c'
  on-secondary-fixed-variant: '#474647'
  tertiary-fixed: '#e2e2e2'
  tertiary-fixed-dim: '#c6c6c7'
  on-tertiary-fixed: '#1a1c1c'
  on-tertiary-fixed-variant: '#454747'
  background: '#031427'
  on-background: '#d3e4fe'
  surface-variant: '#26364a'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  title-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  container-max: 1440px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
---

## Brand & Style

The design system is engineered for the high-stakes environment of casting management. It centers on a **Professional Minimalism** aesthetic, drawing inspiration from high-end editorial layouts and cinematic production slates. The goal is to provide a distraction-free environment where the talent's imagery and data remain the focal point.

The emotional response is one of **authority, focus, and exclusivity**. By utilizing heavy whitespace, structured grids, and a restricted color palette, the UI feels like a premium tool for industry insiders. Interactive elements are sparse but high-impact, ensuring that the user’s cognitive load is reserved for talent evaluation rather than navigating the interface.

## Colors

The palette is rooted in a "Studio Noir" philosophy. While it supports both modes, the **Dark Mode** is the primary experience to mimic a screening room environment.

- **Primary (Electric Blue):** Used exclusively for high-priority actions, active states, and progress indicators. It provides a sharp, digital contrast against the analog feel of the neutrals.
- **Surface Palette:** In Dark Mode, surfaces use deep charcoal (`#0F0F10`) to provide depth without the harshness of pure black. In Light Mode, surfaces are crisp white with soft gray (`#F8FAFC`) fills for secondary containers.
- **Accents:** Use Neutral Grays for metadata, borders, and secondary text to maintain a sophisticated hierarchy.

## Typography

The design system utilizes **Inter** for its systematic, utilitarian precision. The typographic scale is designed for high legibility and information density.

- **Headlines:** Use tight letter spacing and bold weights to create a sense of cinematic impact.
- **Labels:** The `label-caps` style is used for table headers, metadata descriptors (e.g., "EYE COLOR", "HEIGHT"), and status tags to differentiate data from content.
- **Body:** Standard body text maintains a generous line height to ensure readability during long casting sessions.

## Layout & Spacing

The layout follows a **Fixed-Fluid Hybrid Grid**. Content is housed within a maximum width of 1440px to ensure line lengths remain readable on ultra-wide monitors used in production studios.

- **Desktop (12 columns):** 24px gutters. Sidebars for navigation are fixed at 280px, while the main content area scales.
- **Tablet (8 columns):** 16px gutters. Secondary sidebars collapse into drawers.
- **Mobile (4 columns):** 16px margins. Content stacks vertically, with horizontal scrolling reserved for talent headshot galleries.

A 4px baseline grid governs all internal padding, ensuring that components like input fields and buttons align perfectly with text baselines.

## Elevation & Depth

To maintain a minimalist profile, this design system avoids heavy drop shadows. Depth is communicated through **Tonal Layering** and **Low-Contrast Outlines**.

- **Level 0 (Base):** The primary background color.
- **Level 1 (Cards/Containers):** A slightly lighter (dark mode) or darker (light mode) shade than the base, defined by a 1px solid border (`rgba(255,255,255,0.1)` in dark mode).
- **Level 2 (Overlays/Modals):** High-contrast surfaces with a subtle 16px blur backdrop and a sharp 1px border. 

Shadows, when used, are "Ambient Glows" — very low opacity, large radius, and no offset, used only to lift primary action modals or dropdown menus.

## Shapes

The shape language is **Soft (Level 1)**. This subtle rounding (4px - 12px) provides a contemporary feel without appearing too "bubbly" or consumer-grade. It strikes a balance between the architectural sharpness of professional software and the approachability of modern web apps.

- **Small elements (Buttons, Inputs):** 4px radius.
- **Medium elements (Cards, Modals):** 8px radius.
- **Large elements (Featured Talbot banners):** 12px radius.

## Components

### Buttons
- **Primary:** Solid Electric Blue fill, white text, no border.
- **Secondary:** Transparent fill, 1px neutral border, white/black text.
- **Ghost:** No fill or border, used for utility actions like "Cancel" or "Clear Filters".

### Talent Cards
The core of the application. Cards should have a fixed aspect ratio for headshots (4:5). Name and agency should appear on a semi-transparent gradient overlay at the bottom or immediately below the image in a dedicated container. Use a subtle 1px border that brightens on hover.

### Inputs & Forms
Forms use "Architectural Styling": labels are always top-aligned in `label-caps`. Input fields have a subtle dark background and a bottom-border-only focus state in Electric Blue to keep the UI clean.

### Navigation
Vertical sidebar navigation on desktop. Use high-contrast icons (20px) with labels in `body-sm`. Active states are marked by a vertical 2px Electric Blue "indicator bar" on the left edge of the menu item.

### Status Chips
Status indicators (e.g., "Booked", "Pending", "Rejected") use small, pill-shaped chips with a low-opacity background of the status color (Green, Amber, Red) and high-saturation text for clarity.