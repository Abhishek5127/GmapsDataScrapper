# MapHarvest

A production-ready **Chrome Extension (Manifest V3)** that scrapes business &
contact information from **Google Maps listings** and **regular websites**,
stores everything **locally** (IndexedDB), and lets you **search, filter, edit,
import and export** leads (Excel / PDF) from a modern dashboard.

Built with **React + TypeScript + TailwindCSS + Vite**, bundled for MV3 with
[`@crxjs/vite-plugin`](https://crxjs.dev/).

---

## ✨ Features

| Area | What it does |
| --- | --- |
| **Google Maps scraper** | Detects open business listings; extracts name, phone, website, address, rating, review count, category, opening hours, Maps URL and lat/long. Floating **Save Lead** button + optional **Auto Save**. |
| **Website scraper** | On any site, extracts title/business name, domain, phone numbers, emails, social links, address and a contact-page URL. |
| **Custom field selection** | Settings page with a checkbox per field — only enabled fields are collected, shown and exported. |
| **Local storage** | IndexedDB (no external DB). Survives browser restarts. **Duplicate detection + automatic merging.** |
| **Dashboard** | Data table with search, sort, filter, pagination, edit, delete, bulk delete and multi-row selection. Columns adapt to the enabled fields. |
| **Export** | XLSX (auto-sized columns) and readable PDF reports (professional table, header/footer, page numbers, generated date, auto page breaks). Export **all**, filtered, or selected records with folder-aware filenames. |
| **Import** | CSV + XLSX with automatic column mapping and duplicate merging. |
| **Statistics** | Total leads, added today, this month, unique businesses, total exported. |
| **UI** | Dark / Light / System theme, responsive SaaS-style design, smooth animations, toast notifications. |
| **Quality** | Fully typed TypeScript, modular architecture, commented code, ESLint config, clean production build. |

---

## 📁 Folder structure

```
lead-collector-pro/
├── manifest.config.ts          # MV3 manifest (consumed by @crxjs)
├── vite.config.ts              # Vite + React + crx plugin config
├── tailwind.config.js          # Tailwind (class-based dark mode)
├── postcss.config.js
├── tsconfig.json / tsconfig.node.json
├── .eslintrc.cjs               # ESLint configuration
├── package.json
├── scripts/
│   └── make-icons.mjs          # Generates the PNG toolbar icons
├── public/
│   └── icons/                  # icon16/32/48/128.png (generated)
└── src/
    ├── types/
    │   └── index.ts            # Shared types + messaging contracts
    ├── background/
    │   └── service-worker.ts   # MV3 service worker (owns IndexedDB, routing)
    ├── content/
    │   ├── maps-scraper.ts     # Google Maps content script + floating UI
    │   └── website-scraper.ts  # Generic website content script
    ├── storage/
    │   └── db.ts               # IndexedDB wrapper: CRUD, dedupe/merge, stats
    ├── utils/
    │   ├── scraper.ts          # Reusable extractors (regex engine)
    │   ├── exporter.ts         # XLSX / PDF export + CSV/XLSX import
    │   ├── settings.ts         # Settings persistence + field filtering
    │   └── messaging.ts        # Typed runtime/tabs messaging helpers
    ├── hooks/
    │   └── useTheme.ts         # Dark/light/system theme hook
    ├── components/
    │   ├── icons.tsx           # Inline SVG icon set
    │   ├── ThemeToggle.tsx
    │   ├── Toast.tsx           # Toast provider + useToast()
    │   └── Modal.tsx
    ├── popup/
    │   ├── index.html
    │   ├── main.tsx            # Popup React entry
    │   └── popup.tsx           # Popup UI (scrape current tab, save, stats)
    ├── options/
    │   ├── index.html
    │   ├── main.tsx
    │   └── settings.tsx        # Settings page (field checkboxes, theme, etc.)
    ├── dashboard/
    │   ├── index.html
    │   ├── main.tsx
    │   ├── dashboard.tsx       # Full dashboard (table, export, import)
    │   └── EditLeadModal.tsx   # Lead edit dialog
    └── styles/
        └── index.css           # Tailwind layers + component classes
```

### Where each required file lives

The task spec asked for specific files — here is the mapping:

| Spec path | Actual file |
| --- | --- |
| `manifest.json` | Generated into `dist/manifest.json` from `manifest.config.ts` |
| `background/service-worker.ts` | `src/background/service-worker.ts` |
| `content/maps-scraper.ts` | `src/content/maps-scraper.ts` |
| `content/website-scraper.ts` | `src/content/website-scraper.ts` |
| `popup/popup.tsx` | `src/popup/popup.tsx` |
| `options/settings.tsx` | `src/options/settings.tsx` |
| `dashboard/dashboard.tsx` | `src/dashboard/dashboard.tsx` |
| `storage/db.ts` | `src/storage/db.ts` |
| `utils/exporter.ts` | `src/utils/exporter.ts` |
| `utils/scraper.ts` | `src/utils/scraper.ts` |

---

## 🏗️ Architecture notes

- **Single DB writer.** IndexedDB lives on the extension origin. Content scripts
  run on the *host page's* origin, so they **cannot** access it directly. They
  scrape and send a `SAVE_LEAD` message; the **service worker** is the single
  writer (`src/storage/db.ts`). Extension pages (popup, options, dashboard)
  share the extension origin and use `db.ts` directly.
- **Duplicate detection & merge.** Each lead gets a deterministic `dedupeKey`
  (Maps URL → name+phone → name+domain → domain → name → email). Saving a lead
  whose key already exists **merges** the records (unions phones/emails/socials,
  fills empty scalars) instead of creating a duplicate.
- **Field filtering.** Enabled fields (Settings) are applied at save time
  (`applyFieldFilter`) and again when building dashboard/export columns, so the
  whole pipeline adapts automatically.
- **Reusable scraping engine.** `src/utils/scraper.ts` exposes
  `extractPhoneNumbers`, `extractEmails`, `extractAddress`, `extractSocialLinks`,
  `extractBusinessName`, `extractContactPage`, plus JSON-LD parsing — all used
  by both content scripts.

---

## 🚀 Build instructions

### Prerequisites
- **Node.js 18+** and npm.

### Steps

```bash
# 1. Install dependencies
npm install

# 2. (Only needed once, or after editing the generator) create the toolbar icons
npm run icons        # see "scripts" below; icons are committed under public/icons

# 3. Production build  →  outputs to ./dist
npm run build

# Other useful scripts
npm run dev          # Vite dev server with HMR (for iterating on the UI)
npm run lint         # ESLint (zero warnings enforced)
npm run lint:fix     # Auto-fix lint issues
```

> The build runs `tsc --noEmit` (type-check) then `vite build`. The output in
> `dist/` is the unpacked, ready-to-load extension.

Add this convenience script to regenerate icons if you tweak the generator
(already wired via `scripts/make-icons.mjs`):

```bash
node scripts/make-icons.mjs
```

---

## 🧩 Installation (load the extension in Chrome)

1. Run `npm install && npm run build`.
2. Open **`chrome://extensions`**.
3. Toggle **Developer mode** (top-right).
4. Click **Load unpacked**.
5. Select the generated **`dist/`** folder.
6. Pin **MapHarvest** from the extensions menu. The dashboard opens
   automatically on first install.

### Using it
- **Google Maps:** open a business listing → click the floating **＋ Save Lead**
  button (or enable **Auto Save** in the popup / Settings).
- **Any website:** click the toolbar icon → review the detected fields →
  **Save Lead**.
- **Dashboard:** click **Dashboard** in the popup to search, filter, edit,
  import and export your leads.
- **Settings:** choose which fields to collect, toggle auto-save, pick a theme
  and set the dashboard page size.

### Development mode (HMR)
`npm run dev`, then **Load unpacked** the `dist/` folder once. Vite/crx writes
to `dist/` and hot-reloads the UI surfaces. Reload the extension from
`chrome://extensions` after changes to the service worker or manifest.

---

## ⚠️ Error handling

The extension handles the common failure modes explicitly:

- **Missing fields** — every business field is optional; the UI shows `—`.
- **Invalid pages** (chrome://, PDFs, no content script) — the popup shows a
  friendly message with a *Reload page* action.
- **Duplicate records** — detected and merged automatically.
- **Export failures / empty data** — surfaced via toast (e.g. "No leads to export").
- **Storage limits** — `QuotaExceededError` is caught and reported with guidance
  to export & clear.

---

## 🔐 Permissions (least privilege)

| Permission | Why |
| --- | --- |
| `activeTab` | Read the active tab when the user invokes the popup. |
| `storage` | Persist user settings. |
| `tabs` | Open the dashboard, query the active tab, message content scripts. |
| `scripting` | MV3 scripting capability for content interaction. |
| `https://www.google.com/maps/*` | Dedicated Google Maps scraper. |
| `<all_urls>` | Generic website scraper. |

---

## 🛠️ Tech stack

React 18 · TypeScript 5 · Vite 5 · TailwindCSS 3 · @crxjs/vite-plugin ·
SheetJS (`xlsx`) · jsPDF + jspdf-autotable · IndexedDB.

## 📄 License

MIT.
