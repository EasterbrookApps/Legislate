# Legislate?! (Modular Build)

A browser-based board game that teaches the UK legislative process.

This build is designed for GitHub Pages and modern evergreen browsers.

## Demo & Purpose

Legislate?! helps players learn how a bill becomes law in the UK by playing through the stages of legislation.

## How to run locally

```bash
npm install
npm run dev
```

Open the printed URL (usually http://localhost:5173).

## Build for GitHub Pages

```bash
npm run build
```

Deploy the contents of `dist/` to your GitHub Pages site (or copy the `apps/legislate-modular/` folder into your Pages repo and set Pages to serve from that folder).

> Note: This Vite config uses a relative `base: './'` so it works inside subfolders on GitHub Pages.

## Accessibility

- Keyboard-first gameplay (Roll/Restart operable via keyboard)
- Focus management in modals
- `aria-live` turn announcements
- Respects `prefers-reduced-motion`
- Semantic landmarks (`header`, `main`, `footer`)

Aiming for WCAG 2.2 AA aligned with GOV.UK design principles.

## Attribution & Licence

Contains public sector information licensed under the Open Government Licence v3.0.
