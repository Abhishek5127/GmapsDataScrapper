/**
 * IndexedDB persistence layer for MapHarvest.
 *
 * A small hand-rolled, fully-typed Promise wrapper around IndexedDB — no
 * external dependency. The database lives on the extension origin, so it is
 * shared by the service worker and every extension page (popup, options,
 * dashboard). Content scripts must NOT use this module directly (they run on
 * the host page's origin); they message the service worker instead.
 *
 * Stores:
 *  - `leads`   : keyPath `id`, indexes on dedupeKey/createdAt/domain/folderId.
 *  - `folders` : keyPath `id`, user-created folders leads can be filed under.
 *  - `meta`    : key/value store for counters (e.g. exportCount).
 */

import type { Folder, Lead, ScrapedLead, SaveResult, Stats } from '@/types';

const DB_NAME = 'lead_collector_pro';
const DB_VERSION = 2;
const LEADS_STORE = 'leads';
const FOLDERS_STORE = 'folders';
const META_STORE = 'meta';

let dbPromise: Promise<IDBDatabase> | null = null;

/** Open (or upgrade) the database, memoizing the connection. */
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = request.transaction;

      // v1: leads + meta stores.
      let leadsStore: IDBObjectStore;
      if (!db.objectStoreNames.contains(LEADS_STORE)) {
        leadsStore = db.createObjectStore(LEADS_STORE, { keyPath: 'id' });
        leadsStore.createIndex('dedupeKey', 'dedupeKey', { unique: false });
        leadsStore.createIndex('createdAt', 'createdAt', { unique: false });
        leadsStore.createIndex('domain', 'domain', { unique: false });
      } else {
        leadsStore = tx!.objectStore(LEADS_STORE);
      }

      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }

      // v2: folders store + folderId index on leads.
      if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
        db.createObjectStore(FOLDERS_STORE, { keyPath: 'id' });
      }
      if (!leadsStore.indexNames.contains('folderId')) {
        leadsStore.createIndex('folderId', 'folderId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
    request.onblocked = () => reject(new Error('IndexedDB open blocked by another connection'));
  });

  return dbPromise;
}

/** Promisify a single IDBRequest. */
function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

/* ----------------------------- Helpers ----------------------------- */

/** RFC4122-ish UUID using the Web Crypto API (available in SW + pages). */
function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for older runtimes.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Normalize a string for comparison (lowercase, collapse whitespace). */
function norm(value?: string): string {
  return (value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Keep digits only — used to compare phone numbers across formats. */
function digits(value?: string): string {
  return (value ?? '').replace(/\D/g, '');
}

/**
 * Build a deterministic key used to detect duplicates. Priority:
 *  1. Google Maps URL (most specific for maps leads).
 *  2. Business name + first phone.
 *  3. Domain / website.
 *  4. First email.
 * Returns an empty string when nothing identifying exists.
 */
function computeDedupeKey(lead: Pick<Lead, 'mapsUrl' | 'businessName' | 'phone' | 'domain' | 'website' | 'email'>): string {
  if (lead.mapsUrl) {
    // Strip query/hash noise from the maps URL.
    return `maps:${lead.mapsUrl.split('?')[0]}`;
  }
  const name = norm(lead.businessName);
  const firstPhone = digits(lead.phone?.[0]);
  if (name && firstPhone) return `np:${name}|${firstPhone}`;

  const domain = norm(lead.domain) || norm(lead.website).replace(/^https?:\/\//, '').split('/')[0];
  if (name && domain) return `nd:${name}|${domain}`;
  if (domain) return `d:${domain}`;

  if (name) return `n:${name}`;
  const firstEmail = norm(lead.email?.[0]);
  if (firstEmail) return `e:${firstEmail}`;
  return '';
}

/** Union two arrays of strings preserving order and removing case-dupes. */
function mergeStringArrays(a?: string[], b?: string[]): string[] | undefined {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of [...(a ?? []), ...(b ?? [])]) {
    const key = norm(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.length ? out : undefined;
}

/**
 * Merge a freshly scraped lead into an existing record. Existing scalar values
 * win unless they are empty; arrays and social links are unioned. Returns a new
 * object (does not mutate inputs).
 */
function mergeLeads(existing: Lead, incoming: ScrapedLead): Lead {
  const merged: Lead = { ...existing };

  const scalarKeys: (keyof ScrapedLead)[] = [
    'businessName',
    'website',
    'domain',
    'address',
    'rating',
    'reviewCount',
    'category',
    'contactPage',
    'mapsUrl',
    'latitude',
    'longitude',
    'sourceUrl',
  ];
  for (const key of scalarKeys) {
    const current = (merged as unknown as Record<string, unknown>)[key];
    const next = (incoming as unknown as Record<string, unknown>)[key];
    if ((current === undefined || current === null || current === '') && next !== undefined && next !== null && next !== '') {
      (merged as unknown as Record<string, unknown>)[key] = next;
    }
  }

  merged.phone = mergeStringArrays(existing.phone, incoming.phone);
  merged.email = mergeStringArrays(existing.email, incoming.email);
  merged.openingHours = incoming.openingHours?.length ? incoming.openingHours : existing.openingHours;
  merged.socialLinks = { ...(existing.socialLinks ?? {}), ...(incoming.socialLinks ?? {}) };
  if (Object.keys(merged.socialLinks).length === 0) merged.socialLinks = undefined;

  // Re-saving into a folder moves the lead; otherwise keep its current folder.
  if (incoming.folderId) merged.folderId = incoming.folderId;

  merged.updatedAt = Date.now();
  return merged;
}

/* ------------------------------ CRUD ------------------------------- */

/** A lead row as stored (adds the internal `dedupeKey`). */
type StoredLead = Lead & { dedupeKey: string };

/** Save a scraped lead, auto-merging into a duplicate when one exists. */
export async function saveLead(scraped: ScrapedLead): Promise<SaveResult> {
  const db = await openDB();
  const dedupeKey = computeDedupeKey(scraped);

  return new Promise<SaveResult>((resolve, reject) => {
    const tx = db.transaction(LEADS_STORE, 'readwrite');
    const store = tx.objectStore(LEADS_STORE);

    const finish = (result: SaveResult) => {
      tx.oncomplete = () => resolve(result);
    };
    tx.onerror = () => reject(tx.error ?? new Error('saveLead transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('saveLead transaction aborted'));

    if (!dedupeKey) {
      // Nothing to dedupe on — insert as new.
      const now = Date.now();
      const lead: StoredLead = { ...scraped, id: uuid(), createdAt: now, updatedAt: now, dedupeKey: uuid() };
      store.add(lead);
      finish({ status: 'created', lead });
      return;
    }

    const index = store.index('dedupeKey');
    const lookup = index.get(dedupeKey);
    lookup.onsuccess = () => {
      const existing = lookup.result as StoredLead | undefined;
      if (existing) {
        const merged = mergeLeads(existing, scraped) as StoredLead;
        merged.dedupeKey = dedupeKey;
        store.put(merged);
        finish({ status: 'merged', lead: merged });
      } else {
        const now = Date.now();
        const lead: StoredLead = { ...scraped, id: uuid(), createdAt: now, updatedAt: now, dedupeKey };
        store.add(lead);
        finish({ status: 'created', lead });
      }
    };
    lookup.onerror = () => reject(lookup.error ?? new Error('dedupe lookup failed'));
  });
}

/** Insert or replace a lead wholesale (used by import + edit). */
export async function putLead(lead: Lead): Promise<Lead> {
  const db = await openDB();
  const stored: StoredLead = {
    ...lead,
    dedupeKey: computeDedupeKey(lead) || lead.id,
    updatedAt: Date.now(),
  };
  const tx = db.transaction(LEADS_STORE, 'readwrite');
  await promisifyRequest(tx.objectStore(LEADS_STORE).put(stored));
  return stored;
}

/** Fetch every lead, newest first. */
export async function getAllLeads(): Promise<Lead[]> {
  const db = await openDB();
  const tx = db.transaction(LEADS_STORE, 'readonly');
  const all = (await promisifyRequest(tx.objectStore(LEADS_STORE).getAll())) as StoredLead[];
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

/** Fetch a single lead by id. */
export async function getLead(id: string): Promise<Lead | undefined> {
  const db = await openDB();
  const tx = db.transaction(LEADS_STORE, 'readonly');
  return (await promisifyRequest(tx.objectStore(LEADS_STORE).get(id))) as Lead | undefined;
}

/** Delete one lead. */
export async function deleteLead(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(LEADS_STORE, 'readwrite');
  await promisifyRequest(tx.objectStore(LEADS_STORE).delete(id));
}

/** Delete many leads in a single transaction. */
export async function deleteLeads(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDB();
  const tx = db.transaction(LEADS_STORE, 'readwrite');
  const store = tx.objectStore(LEADS_STORE);
  await Promise.all(ids.map((id) => promisifyRequest(store.delete(id))));
}

/** Remove every lead. */
export async function clearLeads(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(LEADS_STORE, 'readwrite');
  await promisifyRequest(tx.objectStore(LEADS_STORE).clear());
}

/** Bulk insert with duplicate-merging (used by CSV/XLSX import). */
export async function bulkSave(leads: ScrapedLead[]): Promise<{ created: number; merged: number }> {
  let created = 0;
  let merged = 0;
  for (const lead of leads) {
    const res = await saveLead(lead);
    if (res.status === 'created') created++;
    else merged++;
  }
  return { created, merged };
}

/* ----------------------------- Folders ----------------------------- */

/** Palette used to assign folder colors round-robin. */
const FOLDER_COLORS = ['violet', 'emerald', 'sky', 'amber', 'rose', 'cyan', 'indigo', 'fuchsia'];

/** Fetch all folders, alphabetically. */
export async function getFolders(): Promise<Folder[]> {
  const db = await openDB();
  const tx = db.transaction(FOLDERS_STORE, 'readonly');
  const all = (await promisifyRequest(tx.objectStore(FOLDERS_STORE).getAll())) as Folder[];
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Create a folder. Names are unique (case-insensitive) — an existing folder
 * with the same name is returned instead of creating a duplicate.
 */
export async function createFolder(name: string, color?: string): Promise<Folder> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Folder name cannot be empty.');

  const existing = await getFolders();
  const dupe = existing.find((f) => f.name.toLowerCase() === trimmed.toLowerCase());
  if (dupe) return dupe;

  const folder: Folder = {
    id: uuid(),
    name: trimmed,
    color: color ?? FOLDER_COLORS[existing.length % FOLDER_COLORS.length],
    createdAt: Date.now(),
  };
  const db = await openDB();
  const tx = db.transaction(FOLDERS_STORE, 'readwrite');
  await promisifyRequest(tx.objectStore(FOLDERS_STORE).add(folder));
  return folder;
}

/** Rename a folder. */
export async function renameFolder(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Folder name cannot be empty.');
  const db = await openDB();
  const tx = db.transaction(FOLDERS_STORE, 'readwrite');
  const store = tx.objectStore(FOLDERS_STORE);
  const folder = (await promisifyRequest(store.get(id))) as Folder | undefined;
  if (!folder) return;
  folder.name = trimmed;
  await promisifyRequest(store.put(folder));
}

/**
 * Delete a folder. Leads inside it are moved to Unfiled (folderId cleared)
 * rather than deleted.
 */
export async function deleteFolder(id: string): Promise<void> {
  const db = await openDB();
  // Clear folderId on member leads first.
  const leads = await getLeadsByFolder(id);
  if (leads.length) {
    const tx = db.transaction(LEADS_STORE, 'readwrite');
    const store = tx.objectStore(LEADS_STORE);
    await Promise.all(
      leads.map((l) => promisifyRequest(store.put({ ...l, folderId: undefined } as StoredLead))),
    );
  }
  const ftx = db.transaction(FOLDERS_STORE, 'readwrite');
  await promisifyRequest(ftx.objectStore(FOLDERS_STORE).delete(id));
}

/** Fetch all leads belonging to a folder. */
export async function getLeadsByFolder(folderId: string): Promise<Lead[]> {
  const db = await openDB();
  const tx = db.transaction(LEADS_STORE, 'readonly');
  const index = tx.objectStore(LEADS_STORE).index('folderId');
  return (await promisifyRequest(index.getAll(folderId))) as Lead[];
}

/** Move a set of leads into a folder (or to Unfiled when folderId is null). */
export async function moveLeads(ids: string[], folderId: string | null): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDB();
  const tx = db.transaction(LEADS_STORE, 'readwrite');
  const store = tx.objectStore(LEADS_STORE);
  await Promise.all(
    ids.map(async (id) => {
      const lead = (await promisifyRequest(store.get(id))) as StoredLead | undefined;
      if (!lead) return;
      lead.folderId = folderId ?? undefined;
      lead.updatedAt = Date.now();
      await promisifyRequest(store.put(lead));
    }),
  );
}

/* ------------------------------ Meta ------------------------------- */

interface MetaRow {
  key: string;
  value: number;
}

async function getMeta(key: string): Promise<number> {
  const db = await openDB();
  const tx = db.transaction(META_STORE, 'readonly');
  const row = (await promisifyRequest(tx.objectStore(META_STORE).get(key))) as MetaRow | undefined;
  return row?.value ?? 0;
}

async function setMeta(key: string, value: number): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(META_STORE, 'readwrite');
  await promisifyRequest(tx.objectStore(META_STORE).put({ key, value } satisfies MetaRow));
}

/** Increment the lifetime export counter and return the new total. */
export async function bumpExportCount(by = 1): Promise<number> {
  const current = await getMeta('exportCount');
  const next = current + by;
  await setMeta('exportCount', next);
  return next;
}

/* ----------------------------- Stats ------------------------------- */

/** Compute dashboard statistics from the current data set. */
export async function getStats(): Promise<Stats> {
  const leads = await getAllLeads();
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const uniqueNames = new Set<string>();
  let today = 0;
  let thisMonth = 0;

  for (const lead of leads) {
    if (lead.createdAt >= startOfDay) today++;
    if (lead.createdAt >= startOfMonth) thisMonth++;
    const name = norm(lead.businessName) || norm(lead.domain);
    if (name) uniqueNames.add(name);
  }

  return {
    total: leads.length,
    today,
    thisMonth,
    uniqueBusinesses: uniqueNames.size,
    exportCount: await getMeta('exportCount'),
  };
}

export const _internal = { computeDedupeKey, mergeLeads, norm, digits };
