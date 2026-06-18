---
name: Precision Insight
colors:
  surface: '#faf9f3'
  surface-dim: '#dbdad4'
  surface-bright: '#faf9f3'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f4ee'
  surface-container: '#efeee8'
  surface-container-high: '#e9e8e2'
  surface-container-highest: '#e3e3dd'
  on-surface: '#1b1c19'
  on-surface-variant: '#444748'
  inverse-surface: '#30312d'
  inverse-on-surface: '#f2f1eb'
  outline: '#747878'
  outline-variant: '#c4c7c7'
  surface-tint: '#5f5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1c1b1b'
  on-primary-container: '#858383'
  inverse-primary: '#c8c6c5'
  secondary: '#b51b15'
  on-secondary: '#ffffff'
  secondary-container: '#d9372b'
  on-secondary-container: '#fffbff'
  tertiary: '#6a5f00'
  on-tertiary: '#ffffff'
  tertiary-container: '#bfac00'
  on-tertiary-container: '#484000'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e5e2e1'
  primary-fixed-dim: '#c8c6c5'
  on-primary-fixed: '#1c1b1b'
  on-primary-fixed-variant: '#474746'
  secondary-fixed: '#ffdad5'
  secondary-fixed-dim: '#ffb4a9'
  on-secondary-fixed: '#410001'
  on-secondary-fixed-variant: '#930004'
  tertiary-fixed: '#fde400'
  tertiary-fixed-dim: '#dec800'
  on-tertiary-fixed: '#201c00'
  on-tertiary-fixed-variant: '#504700'
  background: '#faf9f3'
  on-background: '#1b1c19'
  surface-variant: '#e3e3dd'
  risk-high: '#D8362A'
  risk-safe: '#2A8D5C'
  risk-warning: '#FEE500'
  surface-paper: '#F7F6F0'
  surface-white: '#FFFFFF'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-md:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  data-label:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  data-value:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
  container-max: 1280px
---

## Brand & Style

This design system is built on a foundation of **Corporate Minimalism**, optimized for data-heavy environments where clarity is synonymous with trust. The aesthetic prioritizes a "content-first" architecture, utilizing generous white space and a rigorous grid to make complex information digestible. 

The brand personality is professional, objective, and vigilant. It avoids decorative flourishes in favor of functional elegance. By combining a "paper-white" background with sharp, high-contrast typography and intentional pops of semantic color, the UI evokes the feeling of a high-end financial terminal or a modern research journal—authoritative yet accessible.

## Colors

The palette is anchored by a high-contrast neutral base to ensure maximum readability. 

- **Primary (#1A1A1A):** Used for core text, iconography, and primary structural elements to provide a solid visual anchor.
- **Secondary / Risk High (#D8362A):** Reserved exclusively for critical warnings, high-risk data points, and urgent system alerts.
- **Tertiary / Warning (#FEE500):** A functional accent used for cautionary states and highlighting specific data trends that require attention but not immediate action.
- **Safety (#2A8D5C):** Introduced as a semantic counterpart to the red, used for positive growth, safety ratings, and "low-risk" indicators.
- **Neutral (#F7F6F0):** A warm, off-white "paper" tone used for large background areas to reduce eye strain compared to pure white.

## Typography

The typographic system uses a tri-font strategy to separate intent:

1.  **Hanken Grotesk (Headlines):** A sharp, contemporary grotesque that provides a professional and modern character to the brand's voice.
2.  **Inter (Body):** Selected for its exceptional legibility in UI contexts, used for all descriptive text and standard interface elements.
3.  **JetBrains Mono (Data):** Used for numerical values, IDs, and tabular data. The monospaced nature ensures that columns of numbers align perfectly, aiding in rapid data scanning and comparison.

All headlines should use a tight letter-spacing for a more impactful, editorial feel, while data labels use increased tracking to ensure clarity at small sizes.

## Layout & Spacing

The design system utilizes a **12-column fluid grid** for desktop and a **4-column grid** for mobile. A strict 4px baseline grid governs all internal component spacing to maintain mathematical harmony.

- **Data Density:** Layouts should default to a "Comfortable" density but allow for "Compact" views in data-heavy tables by reducing vertical padding.
- **Hierarchy through Spacing:** Use large margins (`margin-desktop`) to separate major content sections, creating "islands" of information that prevent the user from feeling overwhelmed.
- **Alignment:** All data values in tables should be right-aligned if numerical and left-aligned if text-based.

## Elevation & Depth

To maintain a clean, data-centric look, this design system avoids heavy shadows. Instead, it uses **Tonal Layers** and **Low-Contrast Outlines** to define hierarchy.

- **Primary Surface:** The background uses `#F7F6F0`. 
- **Cards & Containers:** Raised elements use `#FFFFFF` with a subtle 1px border of `#1A1A1A` at 8% opacity. 
- **Elevation:** When an element needs to "float" (like a dropdown or modal), use a crisp, low-blur shadow: `0px 4px 12px rgba(0, 0, 0, 0.05)`. 
- **Dividers:** Use hairline 1px strokes in `#1A1A1A` at 5% opacity for internal table divisions.

## Shapes

The shape language is **Soft (0.25rem)**. This provides just enough curvature to feel approachable and modern without losing the "serious" architectural feel of the professional brand. 

- **Buttons & Inputs:** Use the standard `rounded` (4px).
- **Cards & Large Containers:** Use `rounded-lg` (8px) to softly frame large data sets.
- **Status Pills:** Use a full pill shape (999px) to distinguish status indicators from clickable buttons.

## Components

- **Buttons:** Primary buttons are solid `#1A1A1A` with white text. Secondary buttons use a ghost style with a 1px border. Warning actions use `#D8362A`.
- **Data Tables:** Headers should be in `#1A1A1A` at 60% opacity using the `data-label` type style. Zebra striping is discouraged; use subtle hover states instead.
- **Input Fields:** Minimalist design with a bottom-border only or a very light 4-sided stroke. Focus states use a 2px `#1A1A1A` bottom border.
- **Status Chips:** Use high-saturation backgrounds for status chips (Red, Green, Yellow) but with low-opacity fills (e.g., 10% opacity background with 100% opacity text) to keep the UI from feeling too loud.
- **Risk Gauges:** Custom components that visualize safety vs. risk using the semantic color scale, moving from green through yellow to red.
- **Cards:** White backgrounds, minimal padding, and 1px soft borders. No shadows unless the card is interactive or draggable.