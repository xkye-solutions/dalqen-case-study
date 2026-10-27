# Dalqen — Case Study & Interactive Prototype

> **Read-only Mirror.** This is maintained in Xkye Solutions' private monorepo and split here with its history. Changes made here are overwritten, so please don't open issues or pull requests. Live at <https://dalqen.xkye.app>. Built on [`case-study-kit`](https://github.com/xkye-solutions/case-study-kit) and [`brand`](https://github.com/xkye-solutions/brand), which are Mirrors too.

A portfolio case study by **Xkye Solutions** for Dalqen, production management software for custom printing and apparel shops. Dalqen carries a customer's job from request to physical handover, and it's in development with **Monesco**, its founding customer. The page tells the product story and embeds a live, clickable prototype that follows along as you scroll.

Built with Astro on the shared case-study kit (`@xkye/case-study-kit`); see the kit's README for how the pieces fit.

## Running locally

From the monorepo root:

```sh
pnpm install
pnpm --filter @xkye/dalqen-case-study dev
```

Then open the URL Astro prints: `/` is the case study and `/prototype.html` is the prototype on its own. `pnpm build` writes the site to `dist/`.

## Project structure

```
.
├── astro.config.mjs
├── src/
│   ├── pages/index.astro       The case study: nav, hero and chapters
│   ├── content/flows/          One MDX file per key-flow chapter
│   ├── content.config.ts       The flows collection, on the kit's flowSchema
│   └── styles/dalqen.css       All page styles
└── public/
    ├── prototype.html          Interactive prototype: markup and styles, served as-is
    └── assets/
        ├── js/prototype-data.js  Sample data: people, Routes, Job Orders, the lineup, scenes
        ├── js/prototype.js       State, screens, actions and the case study contract
        ├── dalqen-order.png      Hero screenshot
        └── brand/                Interim logos, favicons and social card
```

## Prototype

The prototype is hand-written HTML, CSS and JavaScript with in-memory state, a hash router (`#/work/JO-0241`) and an action map wired to `data-act` attributes. Everything resets on reload.

**Screens:** Today, Work (List and Board, with saved views), New Job Order, the Job Order page (stage stepper; Details, Artwork, Sizing & Lineup, Discussion, Activity and Files), Inbox, Customers, Routes and the Route builder, and an Administration hub.

Opened on its own it starts at a sign-in screen and shows a **Back to case study** link. Embedded in the case study it skips sign-in. It works standalone from 1024px wide, in light and dark.

### Driving it from the case study

The case study sends `dalqen:goto` messages to the embedded prototype as each chapter scrolls into view, following the kit's Prototype contract:

```js
{
  type: 'dalqen:goto',
  path: '/work/JO-0241',  // any workspace path: /today, /work, /work/new, /routes/full-apparel…
  view: 'artwork',        // Work: list | board. Job Order: details | artwork | sizing | discussion | activity | files
  scene: 'artwork',       // rebuild the sample data at a point in JO-0241's story (below)
  as: 'layout',           // who is acting: admin, layout, printlead, printcrew, desk…
  action: 'rejectArtwork',// optional action to run after navigating
  data: { reason: '…' },
  theme: 'dark',          // light | dark
}
```

It answers with `dalqen:ready` once it can take a `goto`, and `dalqen:status` with `url`, `theme` and `href` for the title bar.

**Scenes** rebuild every order from seed, then bring JO-0241 to a point in its story, so chapters can be visited in any order and Try buttons replay cleanly:

| Scene | JO-0241 is… |
| --- | --- |
| `intake` | not created yet |
| `artwork` | waiting on the client's decision about v1 |
| `handoff` | waiting for Printing to accept Layout's handoff |
| `discussion` | in Printing, with comments on the order |
| `qc` | in Overall QC with 19 of 20 items passed |
| `release` | Ready for Pickup |

## Brand

**The mark is interim: Dalqen has no established brand yet.** The symbol, wordmark, favicons and social card in `assets/brand/` stand in until one exists.

Colours follow the Dalqen screen design's tokens, in light and dark:

| Token | Light | Dark |
| --- | --- | --- |
| Primary | `#176B57` | `#3FD6A8` |
| Accent mark | `#D7F05E` | `#D7F05E` |
| App background | `#F3F6F1` | `#101614` |
| Surface | `#FFFFFF` | `#1A211E` |
| Text | `#17211F` | `#F2F4F3` |
| Muted text | `#66706D` | `#A3ABA7` |
| Border | `#DDE4E0` | `#2A322E` |

The accent mark is for marks and active states only, never for text on light or for a status.

- **Typefaces:** [Inter](https://fonts.google.com/specimen/Inter) for the interface and [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) with tabular figures for references and sizes, loaded from Google Fonts.
- **Icons:** [Tabler Icons](https://tabler.io/icons) webfont 3.31.0, loaded from jsDelivr.

The design system section of the case study is marked **in progress**.

## Deployment

This Case Study lives in the `xkye-solutions` monorepo. It's deployed to Cloudflare by the root `alchemy.run.ts`, and its source is split, with history, to the read-only `xkye-solutions/dalqen-case-study` Mirror.

The social preview tags (`og:image`, `og:url`, canonical) are built from `site="https://dalqen.xkye.app/"` in `src/pages/index.astro`; update it, and `site` in `astro.config.mjs`, if the domain changes.

## Content notes

- Dalqen is **in development**. Nothing on the page says it has launched.
- The **outcomes** in section 07 are design targets, not measured results.
- Monesco is named with its permission. People, customers, orders and every other piece of data in the prototype are synthetic sample content.
