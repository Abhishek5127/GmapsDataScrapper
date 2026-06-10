/**
 * Settings persistence + helpers, backed by chrome.storage.local.
 *
 * Settings are small and need to be readable synchronously-ish from every
 * surface (popup, options, content scripts via the background), so
 * chrome.storage is a better fit than IndexedDB here.
 */

import type { CollectableField, Settings } from '@/types';

const STORAGE_KEY = 'settings';

/** All collectable fields with human-readable labels (drives the UI). */
export const FIELD_LABELS: Record<CollectableField, string> = {
  businessName: 'Business Name',
  phone: 'Phone Number',
  email: 'Email',
  website: 'Website',
  address: 'Address',
  rating: 'Rating',
  reviewCount: 'Reviews',
  category: 'Category',
  socialLinks: 'Social Links',
  contactPage: 'Contact Page',
  mapsUrl: 'Google Maps Link',
};

export const ALL_FIELDS = Object.keys(FIELD_LABELS) as CollectableField[];

/** Factory for the default settings (all fields enabled). */
export function defaultSettings(): Settings {
  const enabledFields = ALL_FIELDS.reduce(
    (acc, field) => {
      acc[field] = true;
      return acc;
    },
    {} as Record<CollectableField, boolean>,
  );

  return {
    enabledFields,
    autoSave: false,
    autoSaveWebsites: false,
    theme: 'system',
    pageSize: 10,
  };
}

/** Load settings, merging stored values over defaults (forward-compatible). */
export async function getSettings(): Promise<Settings> {
  const defaults = defaultSettings();
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const saved = stored[STORAGE_KEY] as Partial<Settings> | undefined;
  if (!saved) return defaults;

  return {
    ...defaults,
    ...saved,
    enabledFields: { ...defaults.enabledFields, ...(saved.enabledFields ?? {}) },
  };
}

/** Persist settings. */
export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

/** Subscribe to settings changes; returns an unsubscribe function. */
export function onSettingsChanged(callback: (settings: Settings) => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area === 'local' && changes[STORAGE_KEY]?.newValue) {
      callback(changes[STORAGE_KEY].newValue as Settings);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

/**
 * Strip a scraped lead down to only the fields the user enabled. The structural
 * fields (`source`, `sourceUrl`) are always retained.
 */
export function applyFieldFilter<T extends Record<string, unknown>>(
  lead: T,
  enabled: Record<CollectableField, boolean>,
): T {
  const result = { ...lead } as Record<string, unknown>;
  const fieldToProps: Record<CollectableField, string[]> = {
    businessName: ['businessName'],
    phone: ['phone'],
    email: ['email'],
    website: ['website', 'domain'],
    address: ['address'],
    rating: ['rating'],
    reviewCount: ['reviewCount'],
    category: ['category'],
    socialLinks: ['socialLinks'],
    contactPage: ['contactPage'],
    mapsUrl: ['mapsUrl', 'latitude', 'longitude'],
  };

  for (const field of ALL_FIELDS) {
    if (!enabled[field]) {
      for (const prop of fieldToProps[field]) {
        delete result[prop];
      }
    }
  }
  return result as T;
}
