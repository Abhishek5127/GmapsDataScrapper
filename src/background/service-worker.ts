/**
 * Background service worker (Manifest V3).
 *
 * Owns the extension-origin IndexedDB and acts as the single writer for leads.
 * Content scripts and UI surfaces message it to:
 *   - SAVE_LEAD          persist a scraped lead (with dedupe/merge)
 *   - GET_STATS          fetch dashboard statistics
 *   - BUMP_EXPORT_COUNT  increment the lifetime export counter
 *   - PING               liveness check
 *
 * It also maintains the toolbar badge (total lead count) and seeds default
 * settings on install.
 */

import type {
  RuntimeMessage,
  MessageResponse,
  SaveResult,
  Stats,
} from '@/types';
import { saveLead, getStats, bumpExportCount, getAllLeads, getFolders, createFolder } from '@/storage/db';
import { getSettings, saveSettings, defaultSettings } from '@/utils/settings';

/** Update the toolbar badge with the current total lead count. */
async function refreshBadge(): Promise<void> {
  try {
    const leads = await getAllLeads();
    const count = leads.length;
    await chrome.action.setBadgeBackgroundColor({ color: '#4f46e5' });
    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  } catch (err) {
    console.warn('[LCP] Failed to refresh badge', err);
  }
}

/** Seed default settings on first install and open the dashboard. */
chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    const existing = await getSettings();
    // Persist (merged) settings so the options page always has a baseline.
    await saveSettings(existing ?? defaultSettings());
  } catch (err) {
    console.warn('[LCP] Failed to seed settings', err);
  }

  if (details.reason === 'install') {
    void chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/index.html') });
  }
  void refreshBadge();
});

chrome.runtime.onStartup.addListener(() => {
  void refreshBadge();
});

/**
 * Central message router. Returns `true` to keep the message channel open for
 * the async `sendResponse` call.
 */
chrome.runtime.onMessage.addListener(
  (message: RuntimeMessage, _sender, sendResponse: (response: MessageResponse) => void) => {
    switch (message.type) {
      case 'SAVE_LEAD': {
        saveLead(message.payload)
          .then(async (result: SaveResult) => {
            await refreshBadge();
            sendResponse({ ok: true, data: result });
          })
          .catch((err: unknown) => {
            console.error('[LCP] SAVE_LEAD failed', err);
            sendResponse({ ok: false, error: errorMessage(err) });
          });
        return true;
      }

      case 'GET_STATS': {
        getStats()
          .then((stats: Stats) => sendResponse({ ok: true, data: stats }))
          .catch((err: unknown) => sendResponse({ ok: false, error: errorMessage(err) }));
        return true;
      }

      case 'BUMP_EXPORT_COUNT': {
        bumpExportCount(message.count)
          .then((total) => sendResponse({ ok: true, data: total }))
          .catch((err: unknown) => sendResponse({ ok: false, error: errorMessage(err) }));
        return true;
      }

      case 'GET_FOLDERS': {
        getFolders()
          .then((folders) => sendResponse({ ok: true, data: folders }))
          .catch((err: unknown) => sendResponse({ ok: false, error: errorMessage(err) }));
        return true;
      }

      case 'CREATE_FOLDER': {
        createFolder(message.name, message.color)
          .then((folder) => sendResponse({ ok: true, data: folder }))
          .catch((err: unknown) => sendResponse({ ok: false, error: errorMessage(err) }));
        return true;
      }

      case 'PING': {
        sendResponse({ ok: true });
        return true;
      }

      default:
        sendResponse({ ok: false, error: `Unknown message type: ${(message as { type: string }).type}` });
        return false;
    }
  },
);

/** Normalize an unknown thrown value to a string message. */
function errorMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === 'QuotaExceededError') {
    return 'Storage limit reached. Export and clear some leads to free space.';
  }
  return err instanceof Error ? err.message : String(err);
}

// Keep the badge accurate when leads change from any surface that writes
// directly (dashboard import/edit/delete) by listening for a custom signal.
chrome.runtime.onMessage.addListener((message: { type?: string }) => {
  if (message?.type === 'LEADS_CHANGED') {
    void refreshBadge();
  }
  return false;
});

void refreshBadge();
