/**
 * Google Maps content script.
 *
 * Runs on https://www.google.com/maps/* and extracts structured data from the
 * business detail panel. Google Maps is a single-page app, so we observe URL +
 * DOM changes and re-detect the active listing. A floating "Save Lead" button
 * is injected; an optional Auto Save mode persists listings automatically.
 *
 * Content scripts cannot touch the extension-origin IndexedDB, so saving is
 * delegated to the service worker via runtime messaging.
 */

import type { RuntimeMessage, ScrapedLead, MessageResponse, SaveResult, Folder } from '@/types';
import { getSettings, applyFieldFilter, onSettingsChanged } from '@/utils/settings';
import {
  extractPhoneNumbers,
  formatJsonLdAddress,
  readJsonLd,
} from '@/utils/scraper';

/* --------------------------- DOM extraction ------------------------- */

/** True when a business detail panel is currently open. */
function hasBusinessPanel(): boolean {
  return !!document.querySelector('h1') && /\/maps\/place\//.test(location.pathname);
}

/** Read text from the first element matching any selector. */
function pickText(selectors: string[]): string | undefined {
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    const text = el?.textContent?.trim();
    if (text) return text;
  }
  return undefined;
}

/** Read a button value via its stable `data-item-id` and aria-label. */
function readItemButton(prefix: string): string | undefined {
  const el = document.querySelector<HTMLElement>(`button[data-item-id^="${prefix}"], a[data-item-id^="${prefix}"]`);
  if (!el) return undefined;
  // aria-label is usually "Phone: 020 1234 5678" / "Address: 1 High St".
  const aria = el.getAttribute('aria-label');
  if (aria) {
    const idx = aria.indexOf(':');
    return (idx >= 0 ? aria.slice(idx + 1) : aria).trim();
  }
  return el.textContent?.trim();
}

/** Parse rating + review count from the maps header block. */
function readRatingBlock(): { rating?: number; reviewCount?: number } {
  // The rating container exposes an aria-label like "4.5 stars 1,234 reviews".
  const container =
    document.querySelector<HTMLElement>('div.F7nice') ??
    document.querySelector<HTMLElement>('[role="img"][aria-label*="stars"]')?.parentElement ??
    undefined;

  const text = (container?.textContent ?? '').replace(/\u00a0/g, ' ');
  const ratingMatch = text.match(/(\d[.,]\d)/);
  const reviewMatch = text.match(/([\d,.]+)\s*(?:reviews|review)/i) ?? text.match(/\(([\d,.]+)\)/);

  const rating = ratingMatch ? parseFloat(ratingMatch[1].replace(',', '.')) : undefined;
  const reviewCount = reviewMatch ? parseInt(reviewMatch[1].replace(/[.,]/g, ''), 10) : undefined;

  return {
    rating: Number.isFinite(rating) ? rating : undefined,
    reviewCount: Number.isFinite(reviewCount) ? reviewCount : undefined,
  };
}

/** Parse latitude/longitude from the maps URL. */
function readLatLng(): { latitude?: number; longitude?: number } {
  // Two common encodings: "/@lat,lng,zoom" and "!3dlat!4dlng".
  const at = location.href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  const bang = location.href.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  const src = bang ?? at;
  if (src) {
    return { latitude: parseFloat(src[1]), longitude: parseFloat(src[2]) };
  }
  return {};
}

/** Read the opening-hours rows if the hours table is expanded/available. */
function readOpeningHours(): string[] | undefined {
  const rows = document.querySelectorAll<HTMLElement>('table[aria-label*="ours"] tr, div[aria-label*="ours"] tr');
  const hours: string[] = [];
  rows.forEach((row) => {
    const cells = Array.from(row.querySelectorAll('td, th')).map((c) => c.textContent?.trim() ?? '');
    const line = cells.filter(Boolean).join(': ');
    if (line) hours.push(line);
  });
  return hours.length ? hours : undefined;
}

/** Extract the website URL from the maps "authority" (website) button. */
function readWebsite(): string | undefined {
  const el = document.querySelector<HTMLAnchorElement>('a[data-item-id="authority"]');
  if (el?.href) return el.href;
  const label = readItemButton('authority');
  return label || undefined;
}

/**
 * Build a {@link ScrapedLead} from the current Google Maps listing. Combines
 * DOM extraction with any JSON-LD present on the page.
 */
function scrapeMapsListing(): ScrapedLead | null {
  if (!hasBusinessPanel()) return null;

  const jsonLd = readJsonLd();

  const businessName =
    pickText(['h1.DUwDvf', 'h1[class]', 'h1']) ?? (jsonLd?.name as string | undefined);

  const phoneRaw = readItemButton('phone:tel:') ?? readItemButton('phone');
  const phones = phoneRaw ? extractPhoneNumbers(phoneRaw) : [];
  if (phones.length === 0 && typeof jsonLd?.telephone === 'string') {
    phones.push(jsonLd.telephone);
  }

  const address = readItemButton('address') ?? formatJsonLdAddress(jsonLd?.address);
  const category = pickText(['button[jsaction*="category"]', 'button.DkEaL']);
  const { rating, reviewCount } = readRatingBlock();
  const { latitude, longitude } = readLatLng();

  const lead: ScrapedLead = {
    source: 'google_maps',
    sourceUrl: location.href,
    mapsUrl: location.href,
    businessName: businessName?.trim(),
    phone: phones.length ? phones : undefined,
    website: readWebsite(),
    address: address?.trim(),
    rating,
    reviewCount,
    category: category?.trim(),
    openingHours: readOpeningHours(),
    latitude,
    longitude,
  };

  // Require at least a name to consider this a valid listing.
  return lead.businessName ? lead : null;
}

/* --------------------------- Save handling -------------------------- */

let lastAutoSavedUrl = '';
const LAST_FOLDER_KEY = 'lcp_last_folder_id';

/** Filter by enabled fields and ask the background to persist the lead. */
async function persist(lead: ScrapedLead, folderId?: string): Promise<MessageResponse<SaveResult>> {
  const settings = await getSettings();
  const filtered = applyFieldFilter(lead, settings.enabledFields) as ScrapedLead;
  filtered.folderId = folderId;
  const message: RuntimeMessage = { type: 'SAVE_LEAD', payload: filtered };
  return chrome.runtime.sendMessage(message) as Promise<MessageResponse<SaveResult>>;
}

/** Fetch the user's folders via the background. */
async function fetchFolders(): Promise<Folder[]> {
  const res = (await chrome.runtime.sendMessage({ type: 'GET_FOLDERS' })) as MessageResponse<Folder[]>;
  return res.ok && res.data ? res.data : [];
}

/** Create a folder via the background. */
async function createFolder(name: string): Promise<Folder | null> {
  const res = (await chrome.runtime.sendMessage({ type: 'CREATE_FOLDER', name })) as MessageResponse<Folder>;
  return res.ok && res.data ? res.data : null;
}

/** Remember the last folder a lead was saved to (used by auto-save). */
async function getLastFolderId(): Promise<string | undefined> {
  const stored = await chrome.storage.local.get(LAST_FOLDER_KEY);
  return stored[LAST_FOLDER_KEY] as string | undefined;
}
async function setLastFolderId(folderId?: string): Promise<void> {
  await chrome.storage.local.set({ [LAST_FOLDER_KEY]: folderId ?? '' });
}

/* --------------------------- Floating UI ---------------------------- */

const BTN_ID = 'lcp-save-lead-btn';
const TOAST_ID = 'lcp-toast';
const PICKER_ID = 'lcp-folder-picker';

/** A folder color → hex map mirroring the dashboard palette. */
const FOLDER_HEX: Record<string, string> = {
  violet: '#8b5cf6',
  emerald: '#10b981',
  sky: '#0ea5e9',
  amber: '#f59e0b',
  rose: '#f43f5e',
  cyan: '#06b6d4',
  indigo: '#6366f1',
  fuchsia: '#d946ef',
};

/**
 * Open a small folder-picker popover anchored above the Save Lead button. The
 * user selects an existing folder (or "Unfiled"), or creates a new one, then
 * confirms to save the lead there.
 */
async function openFolderPicker(lead: ScrapedLead): Promise<void> {
  document.getElementById(PICKER_ID)?.remove();
  const folders = await fetchFolders();
  let selected: string | undefined = await getLastFolderId();
  if (selected && !folders.some((f) => f.id === selected)) selected = undefined;

  const panel = document.createElement('div');
  panel.id = PICKER_ID;
  Object.assign(panel.style, {
    position: 'fixed',
    bottom: '78px',
    right: '24px',
    zIndex: '2147483647',
    width: '288px',
    padding: '14px',
    borderRadius: '16px',
    background: '#ffffff',
    color: '#0f172a',
    fontFamily: 'system-ui, sans-serif',
    boxShadow: '0 20px 50px -12px rgba(15,23,42,.45)',
    border: '1px solid rgba(148,163,184,.25)',
  } satisfies Partial<CSSStyleDeclaration>);

  const title = document.createElement('div');
  title.textContent = 'Save lead to folder';
  Object.assign(title.style, { fontSize: '13px', fontWeight: '700', marginBottom: '10px' });
  panel.appendChild(title);

  const list = document.createElement('div');
  Object.assign(list.style, { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px', maxHeight: '160px', overflowY: 'auto' });

  const renderChips = () => {
    list.innerHTML = '';
    const makeChip = (id: string | undefined, label: string, color?: string) => {
      const chip = document.createElement('button');
      const active = selected === id;
      chip.textContent = label;
      Object.assign(chip.style, {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '5px 10px',
        borderRadius: '9px',
        fontSize: '12px',
        fontWeight: '600',
        cursor: 'pointer',
        border: active ? '1px solid #6366f1' : '1px solid rgba(148,163,184,.4)',
        background: active ? '#eef2ff' : '#fff',
        color: active ? '#4338ca' : '#475569',
      } satisfies Partial<CSSStyleDeclaration>);
      if (color) {
        const dot = document.createElement('span');
        Object.assign(dot.style, { width: '8px', height: '8px', borderRadius: '9999px', background: FOLDER_HEX[color] ?? '#94a3b8' });
        chip.prepend(dot);
      }
      chip.addEventListener('click', () => {
        selected = id;
        renderChips();
      });
      return chip;
    };

    list.appendChild(makeChip(undefined, 'Unfiled'));
    folders.forEach((f) => list.appendChild(makeChip(f.id, f.name, f.color)));
  };
  renderChips();
  panel.appendChild(list);

  // New folder row.
  const newRow = document.createElement('div');
  Object.assign(newRow.style, { display: 'flex', gap: '6px', marginBottom: '10px' });
  const newInput = document.createElement('input');
  newInput.placeholder = 'New folder…';
  Object.assign(newInput.style, {
    flex: '1',
    padding: '7px 10px',
    borderRadius: '9px',
    border: '1px solid rgba(148,163,184,.4)',
    fontSize: '12px',
    outline: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  const addBtn = document.createElement('button');
  addBtn.textContent = 'Add';
  Object.assign(addBtn.style, {
    padding: '7px 12px',
    borderRadius: '9px',
    border: 'none',
    background: '#eef2ff',
    color: '#4338ca',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
  } satisfies Partial<CSSStyleDeclaration>);
  const doAdd = async () => {
    const name = newInput.value.trim();
    if (!name) return;
    const folder = await createFolder(name);
    if (folder) {
      folders.push(folder);
      selected = folder.id;
      newInput.value = '';
      renderChips();
    }
  };
  addBtn.addEventListener('click', () => void doAdd());
  newInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void doAdd();
  });
  newRow.append(newInput, addBtn);
  panel.appendChild(newRow);

  // Action row.
  const actions = document.createElement('div');
  Object.assign(actions.style, { display: 'flex', gap: '6px', justifyContent: 'flex-end' });
  const cancel = document.createElement('button');
  cancel.textContent = 'Cancel';
  Object.assign(cancel.style, {
    padding: '8px 12px',
    borderRadius: '9px',
    border: '1px solid rgba(148,163,184,.4)',
    background: '#fff',
    color: '#475569',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
  } satisfies Partial<CSSStyleDeclaration>);
  cancel.addEventListener('click', () => panel.remove());
  const confirm = document.createElement('button');
  confirm.textContent = 'Save lead';
  Object.assign(confirm.style, {
    padding: '8px 14px',
    borderRadius: '9px',
    border: 'none',
    background: 'linear-gradient(135deg,#6366f1,#7c3aed)',
    color: '#fff',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
  } satisfies Partial<CSSStyleDeclaration>);
  confirm.addEventListener('click', async () => {
    confirm.disabled = true;
    confirm.textContent = 'Saving…';
    const res = await persist(lead, selected);
    await setLastFolderId(selected);
    panel.remove();
    if (res.ok) {
      const name = folders.find((f) => f.id === selected)?.name ?? 'Unfiled';
      showToast(res.data?.status === 'merged' ? `Merged ✓ · ${name}` : `Saved to ${name} ✓`, 'success');
    } else {
      showToast(`Save failed: ${res.error ?? 'unknown error'}`, 'error');
    }
  });
  actions.append(cancel, confirm);
  panel.appendChild(actions);

  document.body.appendChild(panel);
  newInput.focus();
}

/** Inject (once) the floating Save Lead button. */
function ensureButton(): void {
  if (document.getElementById(BTN_ID)) return;

  const btn = document.createElement('button');
  btn.id = BTN_ID;
  btn.textContent = '＋ Save Lead';
  Object.assign(btn.style, {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    zIndex: '2147483647',
    padding: '12px 18px',
    borderRadius: '9999px',
    border: 'none',
    background: 'linear-gradient(135deg,#6366f1,#4f46e5)',
    color: '#fff',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    boxShadow: '0 8px 24px rgba(79,70,229,.45)',
    transition: 'transform .15s ease, opacity .15s ease',
  } satisfies Partial<CSSStyleDeclaration>);

  btn.addEventListener('mouseenter', () => (btn.style.transform = 'translateY(-2px)'));
  btn.addEventListener('mouseleave', () => (btn.style.transform = 'translateY(0)'));

  btn.addEventListener('click', async () => {
    const lead = scrapeMapsListing();
    if (!lead) {
      showToast('Open a business listing first.', 'error');
      return;
    }
    // If the picker is already open, toggle it closed.
    if (document.getElementById(PICKER_ID)) {
      document.getElementById(PICKER_ID)?.remove();
      return;
    }
    await openFolderPicker(lead);
  });

  document.body.appendChild(btn);
}

/** Show a transient toast message. */
function showToast(message: string, kind: 'success' | 'error'): void {
  document.getElementById(TOAST_ID)?.remove();
  const toast = document.createElement('div');
  toast.id = TOAST_ID;
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '78px',
    right: '24px',
    zIndex: '2147483647',
    padding: '10px 16px',
    borderRadius: '10px',
    background: kind === 'success' ? '#16a34a' : '#dc2626',
    color: '#fff',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '13px',
    fontWeight: '600',
    boxShadow: '0 8px 24px rgba(0,0,0,.25)',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

/* ------------------------- SPA change watcher ----------------------- */

/** Re-evaluate the page after navigation: toggle button + run auto-save. */
async function onPageChanged(): Promise<void> {
  const present = hasBusinessPanel();
  const btn = document.getElementById(BTN_ID) as HTMLButtonElement | null;

  if (present) {
    ensureButton();
  } else if (btn) {
    btn.remove();
  }

  if (!present) return;

  const settings = await getSettings();
  if (settings.autoSave && location.href !== lastAutoSavedUrl) {
    const lead = scrapeMapsListing();
    if (lead) {
      lastAutoSavedUrl = location.href;
      const folderId = await getLastFolderId();
      const res = await persist(lead, folderId || undefined);
      if (res.ok) showToast('Auto-saved ✓', 'success');
    }
  }
}

/** Debounce helper. */
function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return ((...args: never[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

/* ------------------------------ Boot ------------------------------- */

function init(): void {
  const handler = debounce(() => {
    void onPageChanged();
  }, 600);

  // Observe DOM mutations (Maps swaps the panel in place).
  const observer = new MutationObserver(handler);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Also react to history-based navigation.
  window.addEventListener('popstate', handler);

  // React live to Auto Save being toggled.
  onSettingsChanged(() => handler());

  // Respond to popup scrape requests.
  chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    if (message.type === 'SCRAPE_CURRENT') {
      const lead = scrapeMapsListing();
      sendResponse({ ok: !!lead, data: lead ?? undefined, error: lead ? undefined : 'No business listing detected' } satisfies MessageResponse<ScrapedLead>);
      return true;
    }
    if (message.type === 'PING') {
      sendResponse({ ok: true } satisfies MessageResponse);
      return true;
    }
    return false;
  });

  void onPageChanged();
}

init();
