/**
 * Shared type definitions for MapHarvest.
 *
 * These types are used across the service worker, content scripts and the
 * React UI so the data contract stays consistent end-to-end.
 */

/** Where a lead originated from. */
export type LeadSource = 'google_maps' | 'website';

/**
 * A single collected lead. All business fields are optional because a given
 * page may only expose a subset of them. `id`, `source`, `sourceUrl`,
 * `createdAt` and `updatedAt` are always present.
 */
export interface Lead {
  /** Stable unique id (UUID). */
  id: string;
  businessName?: string;
  /** Phone numbers in normalized + raw display form. */
  phone?: string[];
  email?: string[];
  website?: string;
  /** Registrable domain extracted from website / page. */
  domain?: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
  category?: string;
  openingHours?: string[];
  /** Map of platform -> profile URL (e.g. { facebook: 'https://...' }). */
  socialLinks?: Record<string, string>;
  contactPage?: string;
  mapsUrl?: string;
  latitude?: number;
  longitude?: number;
  /** Id of the folder this lead is filed under (undefined = Unfiled). */
  folderId?: string;
  source: LeadSource;
  /** URL of the page the lead was scraped from. */
  sourceUrl: string;
  /** Epoch milliseconds. */
  createdAt: number;
  updatedAt: number;
}

/**
 * A user-created folder that leads can be organised into. Stored in IndexedDB.
 */
export interface Folder {
  id: string;
  name: string;
  /** Tailwind-ish accent token (e.g. 'violet', 'emerald') for the color dot. */
  color: string;
  createdAt: number;
}

/**
 * The subset of {@link Lead} fields produced by the scrapers before a record
 * is persisted (no id / timestamps yet).
 */
export type ScrapedLead = Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>;

/** Identifiers for every user-selectable collectable field. */
export type CollectableField =
  | 'businessName'
  | 'phone'
  | 'email'
  | 'website'
  | 'address'
  | 'rating'
  | 'reviewCount'
  | 'category'
  | 'socialLinks'
  | 'contactPage'
  | 'mapsUrl';

/** Theme options for the UI. */
export type ThemeMode = 'light' | 'dark' | 'system';

/** User-configurable settings, persisted in chrome.storage.local. */
export interface Settings {
  /** Which fields are collected when saving a lead. */
  enabledFields: Record<CollectableField, boolean>;
  /** When true, Google Maps leads are saved automatically on detection. */
  autoSave: boolean;
  /** When true, websites are scraped automatically (still respecting fields). */
  autoSaveWebsites: boolean;
  theme: ThemeMode;
  /** Rows shown per dashboard page. */
  pageSize: number;
}

/** Aggregate statistics shown on the dashboard. */
export interface Stats {
  total: number;
  today: number;
  thisMonth: number;
  uniqueBusinesses: number;
  exportCount: number;
}

/* ------------------------------------------------------------------ */
/* Messaging contracts between content scripts, popup and background.  */
/* ------------------------------------------------------------------ */

export type MessageType =
  | 'PING'
  | 'SCRAPE_CURRENT'
  | 'SCRAPE_RESULT'
  | 'SAVE_LEAD'
  | 'GET_STATS'
  | 'BUMP_EXPORT_COUNT'
  | 'GET_FOLDERS'
  | 'CREATE_FOLDER';

export interface ScrapeCurrentMessage {
  type: 'SCRAPE_CURRENT';
}

export interface SaveLeadMessage {
  type: 'SAVE_LEAD';
  payload: ScrapedLead;
}

export interface PingMessage {
  type: 'PING';
}

export interface BumpExportMessage {
  type: 'BUMP_EXPORT_COUNT';
  /** How many records were exported. */
  count: number;
}

export interface GetStatsMessage {
  type: 'GET_STATS';
}

export interface GetFoldersMessage {
  type: 'GET_FOLDERS';
}

export interface CreateFolderMessage {
  type: 'CREATE_FOLDER';
  name: string;
  color?: string;
}

export type RuntimeMessage =
  | ScrapeCurrentMessage
  | SaveLeadMessage
  | PingMessage
  | BumpExportMessage
  | GetStatsMessage
  | GetFoldersMessage
  | CreateFolderMessage;

/** Standard response envelope used by message handlers. */
export interface MessageResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

/** Result of persisting a lead (used to tell the user what happened). */
export interface SaveResult {
  status: 'created' | 'merged';
  lead: Lead;
}
