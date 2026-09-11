# Apéro Design System

## Visual Direction

Apéro uses a cinematic, nocturnal visual language: a near-black foundation, deep crimson accents, high-contrast typography, restrained surfaces, and technical metadata styling.

## Colors

### Core palette

| Token | Hex / value | Usage |
| --- | --- | --- |
| `--black` | `#050505` | Page background, hero sections, preloader |
| `--black-soft` | `#0c0c0e` | Soft section and footer backgrounds |
| `--black-surface` | `#121216` | Cards, panels, and secondary surfaces |
| `--black-elevated` | `#18181e` | Elevated controls and interactive surfaces |
| `--black-card` | `rgba(14, 14, 18, 0.75)` | Translucent card backgrounds |
| `--red` | `#e50914` | Primary accent, calls to action, labels, highlights |
| `--red-vivid` | `#ff1a25` | Bright hover and active states |
| `--red-dark` | `#8b0000` | Deep red contrast accents |
| `--white` | `#f5f5f5` | Primary text |
| `--white-pure` | `#ffffff` | High-emphasis text and contrast details |
| `--white-muted` | `#c8c8cf` | Supporting text |
| `--gray` | `#8a8a93` | Metadata and secondary copy |
| `--gray-dark` | `#202026` | Dark borders and low-contrast surfaces |

### Transparent effects

| Token | Value | Usage |
| --- | --- | --- |
| `--red-glow` | `rgba(229, 9, 20, 0.45)` | Red glows and atmospheric lighting |
| `--red-subtle` | `rgba(229, 9, 20, 0.12)` | Subtle red fills |
| `--red-border` | `rgba(229, 9, 20, 0.3)` | Accent borders |
| `--border-dim` | `rgba(255, 255, 255, 0.08)` | Quiet dividers and outlines |
| `--border-subtle` | `rgba(255, 255, 255, 0.15)` | Visible but restrained borders |

## Fonts

Fonts are loaded from Google Fonts in `css/style.css`.

| Role | Family | Usage |
| --- | --- | --- |
| Display | `Syne` | Main titles, section headlines, logos, ticket headings |
| Body | `Inter` | Paragraphs, interface copy, general text |
| Technical / metadata | `Space Grotesk` | Navigation metadata, labels, dates, counters, buttons |

Fallbacks:

- Body: `-apple-system`, `BlinkMacSystemFont`, `sans-serif`
- Technical: `monospace`
- Display: `sans-serif`

## Letter Spacing

The design uses tracking as a hierarchy signal, especially for uppercase technical copy.

| Context | Letter spacing |
| --- | --- |
| Large display titles | `-0.03em` to `-0.01em` |
| Display logo / wordmark | `0.05em` to `0.15em` |
| Body copy | `0` by default; supporting copy may use `0.05em` |
| Navigation and metadata | `0.15em` to `0.22em` |
| Section labels | `0.28em` |
| Hero tagline | `0.38em` |
| Preloader tagline | `0.4em` |
| Compact technical labels | `0.1em` to `0.2em` |

## Line Spacing

| Context | Line height |
| --- | --- |
| Hero display title | `0.86` |
| General display title | `0.88` |
| Display headlines | `0.95` to `1.02` |
| Counters and compact numeric text | `1` |
| Body and descriptive copy | `1.6` to `1.8` |
| Default text | Browser default unless a component sets a specific value |

## Type Treatment

- Display titles are uppercase, bold `Syne`, and use tight leading for a compressed editorial silhouette.
- Technical copy is uppercase `Space Grotesk` with generous tracking for a terminal-like feel.
- Body copy uses `Inter` in muted white or gray to preserve hierarchy against the dark background.
- Crimson is reserved for actions, active states, labels, and selected words rather than long passages of text.

## Atmosphere

- A subtle film-grain SVG overlay uses `0.035` opacity.
- Red radial glows add depth without changing the base black palette.
- Motion uses cinematic easing: `cubic-bezier(0.16, 1, 0.3, 1)` and smooth easing: `cubic-bezier(0.25, 1, 0.5, 1)`.