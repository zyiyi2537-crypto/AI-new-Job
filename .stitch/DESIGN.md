# JobPilot CN Design System

## Product Character

JobPilot CN is a focused recruitment operations console for repeated daily use. It should feel trustworthy, fast, and evidence-led rather than promotional. The interface favors scanability, compact controls, and explicit system state.

## Design Prompt

Clean, professional desktop-first job-search operations workspace with restrained density, high-contrast typography, crisp separators, and compact interactive controls.

**DESIGN SYSTEM (REQUIRED):**
- Platform: Responsive web, desktop-first with a complete 390px mobile layout
- Palette: Carbon navigation (`#17211C`), paper workspace (`#F4F6F3`), white surfaces (`#FFFFFF`), evidence green (`#087A55`), warning amber (`#B66A12`), error red (`#B33A3A`), informational blue (`#35669A`)
- Typography: Segoe UI / Microsoft YaHei system stack; 24px page titles, 15-16px panel titles, 12-14px operational text
- Geometry: 6px primary controls, 8px maximum panel radius, square data tables and rails
- Depth: Flat sections with fine gray-green borders; shadows only for dialogs and the resume paper preview

**PAGE STRUCTURE:**
1. **Navigation rail:** Compact icon-label navigation, product identity, live AI connection signal, local-data status.
2. **Utility header:** Current workspace title, global AI status, refresh and context actions.
3. **Primary content:** Full-width operational bands and split panes. Avoid decorative card grids and nested cards.
4. **Job discovery:** Search command bar, source status table, browser collector installation, direct URL import, recent results.
5. **Job analysis:** Dense job list next to an evidence panel with score dimensions, AI/rules provenance and explicit actions.
6. **Resume workbench:** Version rail, generation rationale and printable single-column document.

## Interaction Rules

- Icons accompany tool actions; icon-only controls always have tooltips and accessible labels.
- Status uses concise badges with text, never color alone.
- AI actions clearly distinguish local rules from paid/provider-backed analysis.
- Platform collection never claims success until imported records are returned by the API.
- Mobile navigation is an overlay. Wide tables and boards scroll inside their own region without causing page-level horizontal overflow.
- Loading, empty, disconnected, partial-success, and validation states must be visible in context.
