/**
 * Generic website content script.
 *
 * Runs on every page (except Google Maps, which has its own dedicated
 * scraper) and extracts contact/business information on demand. The popup
 * requests a scrape via the SCRAPE_CURRENT message; an optional auto-save mode
 * persists the page automatically once it has loaded.
 */

import type { RuntimeMessage, ScrapedLead, MessageResponse, SaveResult } from '@/types';
import { getSettings, applyFieldFilter } from '@/utils/settings';
import {
  extractPhoneNumbersFromDom,
  extractEmailsFromDom,
  extractAddress,
  extractSocialLinks,
  extractBusinessName,
  extractContactPage,
  extractDomain,
  readJsonLd,
  formatJsonLdAddress,
} from '@/utils/scraper';

/** Don't run on Google Maps — the dedicated maps scraper owns that surface. */
function isMapsPage(): boolean {
  return location.hostname === 'www.google.com' && location.pathname.startsWith('/maps');
}

/** Collect the visible text once, capped, for regex-based extractors. */
function pageText(): string {
  return (document.body?.innerText ?? document.body?.textContent ?? '').slice(0, 500_000);
}

/** Build a {@link ScrapedLead} from the current website. */
function scrapeWebsite(): ScrapedLead {
  const text = pageText();
  const jsonLd = readJsonLd();

  const phones = extractPhoneNumbersFromDom(document);
  const emails = extractEmailsFromDom(document);
  const social = extractSocialLinks(document);
  const address = extractAddress(text) ?? formatJsonLdAddress(jsonLd?.address);
  const businessName = extractBusinessName(document);
  const contactPage = extractContactPage(document);
  const domain = extractDomain(location.href);

  return {
    source: 'website',
    sourceUrl: location.href,
    businessName,
    website: `${location.origin}/`,
    domain,
    phone: phones.length ? phones : undefined,
    email: emails.length ? emails : undefined,
    address,
    socialLinks: Object.keys(social).length ? social : undefined,
    contactPage,
  };
}

/** Filter by enabled fields and ask the background to persist. */
async function persist(lead: ScrapedLead): Promise<MessageResponse<SaveResult>> {
  const settings = await getSettings();
  const filtered = applyFieldFilter(lead, settings.enabledFields);
  const message: RuntimeMessage = { type: 'SAVE_LEAD', payload: filtered };
  return chrome.runtime.sendMessage(message) as Promise<MessageResponse<SaveResult>>;
}

/** Whether a scrape produced anything worth saving. */
function isMeaningful(lead: ScrapedLead): boolean {
  return Boolean(
    lead.phone?.length ||
      lead.email?.length ||
      (lead.socialLinks && Object.keys(lead.socialLinks).length) ||
      lead.address,
  );
}

function init(): void {
  if (isMapsPage()) return;

  // Respond to popup scrape / save requests.
  chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    if (message.type === 'SCRAPE_CURRENT') {
      const lead = scrapeWebsite();
      sendResponse({ ok: true, data: lead } satisfies MessageResponse<ScrapedLead>);
      return true;
    }
    if (message.type === 'PING') {
      sendResponse({ ok: true } satisfies MessageResponse);
      return true;
    }
    return false;
  });

  // Optional auto-save for websites.
  void (async () => {
    const settings = await getSettings();
    if (!settings.autoSaveWebsites) return;
    const lead = scrapeWebsite();
    if (isMeaningful(lead)) {
      await persist(lead);
    }
  })();
}

init();
