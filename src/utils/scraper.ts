/**
 * Reusable, framework-agnostic scraping engine.
 *
 * Every function is pure with respect to the DOM/text it is given and returns
 * cleaned, de-duplicated results. These helpers are shared by both content
 * scripts (Google Maps + generic websites).
 */

/* --------------------------- Regex sources -------------------------- */

/**
 * Phone matcher. Deliberately permissive but anchored on a leading + or digit,
 * requiring at least 7 digits overall to avoid matching dates / ids. We extract
 * candidates then validate by digit count.
 */
const PHONE_REGEX =
  /(?:(?:\+|00)\d{1,3}[\s.-]?)?(?:\(\d{1,4}\)[\s.-]?)?\d{1,5}(?:[\s.-]?\d{2,5}){2,5}/g;

/** Standard, intentionally strict-ish email matcher. */
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** Loose US/EU-style street address line. */
const ADDRESS_REGEX =
  /\d{1,5}\s+(?:[A-Za-z0-9.'-]+\s){1,6}(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Lane|Ln\.?|Drive|Dr\.?|Court|Ct\.?|Way|Place|Pl\.?|Square|Sq\.?|Highway|Hwy\.?|Suite|Ste\.?|Unit)\b[^\n,]{0,40}/gi;

/** Known social platforms and the host fragment that identifies them. */
const SOCIAL_PLATFORMS: { key: string; pattern: RegExp }[] = [
  { key: 'facebook', pattern: /(?:facebook|fb)\.com/i },
  { key: 'instagram', pattern: /instagram\.com/i },
  { key: 'twitter', pattern: /(?:twitter|x)\.com/i },
  { key: 'linkedin', pattern: /linkedin\.com/i },
  { key: 'youtube', pattern: /(?:youtube\.com|youtu\.be)/i },
  { key: 'tiktok', pattern: /tiktok\.com/i },
  { key: 'pinterest', pattern: /pinterest\.com/i },
  { key: 'whatsapp', pattern: /(?:wa\.me|whatsapp\.com)/i },
  { key: 'telegram', pattern: /(?:t\.me|telegram\.me)/i },
  { key: 'github', pattern: /github\.com/i },
];

/* ----------------------------- Helpers ------------------------------ */

/** Count digits in a string. */
function digitCount(value: string): number {
  return (value.match(/\d/g) ?? []).length;
}

/** De-duplicate a list case-insensitively, preserving first-seen order. */
function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v.trim());
  }
  return out;
}

/* --------------------------- Extractors ---------------------------- */

/**
 * Extract phone numbers from arbitrary text. Validates each candidate by
 * requiring at least 7 digits (to avoid matching dates / ids) and trims
 * surrounding noise. No upper bound: a country code plus a fully-grouped
 * national number can exceed 15 digits, and capping it would drop the whole
 * number, so we keep every digit.
 */
export function extractPhoneNumbers(text: string): string[] {
  const matches = text.match(PHONE_REGEX) ?? [];
  const valid = matches
    .map((m) => m.trim())
    .filter((m) => digitCount(m) >= 7);
  return unique(valid);
}

/**
 * Pull phone numbers preferentially from `tel:` links (most reliable), then
 * fall back to scanning the document text.
 */
export function extractPhoneNumbersFromDom(root: ParentNode = document): string[] {
  const fromLinks: string[] = [];
  root.querySelectorAll<HTMLAnchorElement>('a[href^="tel:"]').forEach((a) => {
    const raw = decodeURIComponent(a.getAttribute('href') ?? '').replace(/^tel:/i, '');
    if (raw) fromLinks.push(raw.trim());
  });
  const fromText = extractPhoneNumbers((root.textContent ?? '').slice(0, 500_000));
  return unique([...fromLinks, ...fromText]);
}

/** Extract email addresses from text, ignoring obvious asset filenames. */
export function extractEmails(text: string): string[] {
  const matches = text.match(EMAIL_REGEX) ?? [];
  const filtered = matches.filter(
    (m) => !/\.(png|jpe?g|gif|svg|webp|css|js|woff2?)$/i.test(m),
  );
  return unique(filtered);
}

/** Extract emails from `mailto:` links and document text. */
export function extractEmailsFromDom(root: ParentNode = document): string[] {
  const fromLinks: string[] = [];
  root.querySelectorAll<HTMLAnchorElement>('a[href^="mailto:"]').forEach((a) => {
    const raw = decodeURIComponent(a.getAttribute('href') ?? '')
      .replace(/^mailto:/i, '')
      .split('?')[0];
    if (raw) fromLinks.push(raw.trim());
  });
  const fromText = extractEmails((root.textContent ?? '').slice(0, 500_000));
  return unique([...fromLinks, ...fromText]);
}

/**
 * Best-effort street address extraction. Prefers a microdata/JSON-LD address
 * when present, otherwise falls back to a regex scan of the visible text.
 */
export function extractAddress(text: string): string | undefined {
  const matches = text.match(ADDRESS_REGEX) ?? [];
  if (matches.length === 0) return undefined;
  // Choose the longest match — usually the most complete address.
  const best = matches.sort((a, b) => b.length - a.length)[0];
  return best ? best.replace(/\s+/g, ' ').trim() : undefined;
}

/**
 * Collect social media profile links from anchors in the DOM, keyed by
 * platform. Only the first link per platform is kept.
 */
export function extractSocialLinks(root: ParentNode = document): Record<string, string> {
  const result: Record<string, string> = {};
  root.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
    const href = a.href;
    if (!href || !/^https?:/i.test(href)) return;
    for (const { key, pattern } of SOCIAL_PLATFORMS) {
      if (!result[key] && pattern.test(href)) {
        result[key] = href.split('?')[0];
      }
    }
  });
  return result;
}

/**
 * Determine a business name using, in priority order:
 *  1. JSON-LD `name` of an Organization/LocalBusiness.
 *  2. Open Graph `og:site_name`.
 *  3. `<meta name="application-name">`.
 *  4. The leading segment of the document title.
 */
export function extractBusinessName(root: Document = document): string | undefined {
  // 1. JSON-LD
  const jsonLd = readJsonLd(root);
  if (jsonLd?.name && typeof jsonLd.name === 'string') return jsonLd.name.trim();

  // 2. Open Graph
  const og = root
    .querySelector<HTMLMetaElement>('meta[property="og:site_name"]')
    ?.content?.trim();
  if (og) return og;

  // 3. application-name
  const appName = root
    .querySelector<HTMLMetaElement>('meta[name="application-name"]')
    ?.content?.trim();
  if (appName) return appName;

  // 4. Title (strip common separators / trailing tagline).
  const title = root.title?.trim();
  if (title) {
    return title.split(/\s*[|\-–—:·]\s*/)[0].trim() || title;
  }
  return undefined;
}

/**
 * Find a "contact" page URL by scanning anchor text/href for contact keywords.
 * Returns an absolute URL.
 */
export function extractContactPage(root: ParentNode = document): string | undefined {
  const keywords = /(contact|kontakt|contacto|reach\s*us|get\s*in\s*touch)/i;
  const anchors = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]'));
  for (const a of anchors) {
    const text = (a.textContent ?? '').trim();
    const href = a.getAttribute('href') ?? '';
    if (keywords.test(text) || keywords.test(href)) {
      try {
        return new URL(a.href, location.href).toString();
      } catch {
        /* ignore malformed URL */
      }
    }
  }
  return undefined;
}

/** Extract the registrable-ish domain from a URL or hostname. */
export function extractDomain(input: string): string | undefined {
  try {
    const url = input.includes('://') ? new URL(input) : new URL(`https://${input}`);
    return url.hostname.replace(/^www\./i, '');
  } catch {
    return undefined;
  }
}

/* --------------------------- JSON-LD util --------------------------- */

interface JsonLdNode {
  '@type'?: string | string[];
  name?: string;
  telephone?: string;
  email?: string;
  address?: unknown;
  url?: string;
  aggregateRating?: { ratingValue?: string | number; reviewCount?: string | number };
  [key: string]: unknown;
}

/**
 * Parse all JSON-LD blocks and return the first node that looks like an
 * Organization / LocalBusiness. Robust to arrays and `@graph` wrappers.
 */
export function readJsonLd(root: Document = document): JsonLdNode | undefined {
  const scripts = root.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]');
  const candidates: JsonLdNode[] = [];

  scripts.forEach((script) => {
    try {
      const parsed = JSON.parse(script.textContent ?? 'null');
      collectNodes(parsed, candidates);
    } catch {
      /* malformed JSON-LD — skip */
    }
  });

  const isBusiness = (node: JsonLdNode) => {
    const type = node['@type'];
    const types = Array.isArray(type) ? type : [type];
    return types.some(
      (t) => typeof t === 'string' && /(Organization|LocalBusiness|Store|Restaurant|Corporation)/i.test(t),
    );
  };

  return candidates.find(isBusiness) ?? candidates.find((n) => !!n.name);
}

/** Flatten arbitrary JSON-LD structures into a flat list of nodes. */
function collectNodes(value: unknown, out: JsonLdNode[]): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((v) => collectNodes(v, out));
    return;
  }
  const node = value as JsonLdNode;
  if (Array.isArray(node['@graph'])) {
    collectNodes(node['@graph'], out);
  }
  out.push(node);
}

/** Stringify a JSON-LD `address` (PostalAddress object or plain string). */
export function formatJsonLdAddress(address: unknown): string | undefined {
  if (!address) return undefined;
  if (typeof address === 'string') return address.trim();
  if (typeof address === 'object') {
    const a = address as Record<string, string>;
    const parts = [
      a.streetAddress,
      a.addressLocality,
      a.addressRegion,
      a.postalCode,
      a.addressCountry,
    ].filter(Boolean);
    if (parts.length) return parts.join(', ');
  }
  return undefined;
}
