/**
 * Thin typed wrappers around chrome.runtime / chrome.tabs messaging so callers
 * get Promises and proper types instead of callback soup.
 */

import type { MessageResponse, RuntimeMessage } from '@/types';

/** Send a message to the service worker and await a typed response. */
export async function sendToBackground<T = unknown>(
  message: RuntimeMessage,
): Promise<MessageResponse<T>> {
  try {
    const response = (await chrome.runtime.sendMessage(message)) as MessageResponse<T> | undefined;
    return response ?? { ok: false, error: 'No response from background' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Send a message to a specific tab's content script. */
export async function sendToTab<T = unknown>(
  tabId: number,
  message: RuntimeMessage,
): Promise<MessageResponse<T>> {
  try {
    const response = (await chrome.tabs.sendMessage(tabId, message)) as MessageResponse<T> | undefined;
    return response ?? { ok: false, error: 'No response from content script' };
  } catch (err) {
    // Most common cause: no content script on the page (e.g. chrome:// URLs).
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Resolve the currently active tab in the focused window. */
export async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}
