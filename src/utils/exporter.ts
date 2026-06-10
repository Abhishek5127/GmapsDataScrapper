/**
 * Export & import module.
 *
 * Exports leads to XLSX (SheetJS) and PDF (jsPDF + autotable). Imports leads
 * from CSV and XLSX with automatic column mapping.
 *
 * All exporters operate on the field set the user has enabled, so output
 * columns adapt to the dashboard configuration.
 *
 * NOTE: jsPDF must be imported as a *named* export. The autotable plugin is
 * called via its FUNCTIONAL form — `autoTable(doc, options)` — rather than the
 * `doc.autoTable()` prototype method. The prototype attachment (applyPlugin)
 * is unreliable under the @crxjs/Vite ESM bundling and produced empty PDFs;
 * the functional import works regardless of how the module is interop-wrapped.
 */

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable, { type UserOptions } from 'jspdf-autotable';
import type { CollectableField, Lead, ScrapedLead, Settings } from '@/types';

import { ALL_FIELDS, FIELD_LABELS } from '@/utils/settings';
import { extractDomain } from '@/utils/scraper';

/** Ordered list of columns: a header label + a value accessor. */
interface Column {
  field: CollectableField | 'source' | 'folder' | 'createdAt';
  header: string;
  value: (lead: Lead) => string;
}

export interface ExportOptions {
  folderNames?: Record<string, string>;
}

/** Join an array field into a single display string. */
function joinArr(value?: string[]): string {
  return (value ?? []).join('; ');
}

/** Render social links as "platform: url" pairs. */
function socialToString(links?: Record<string, string>): string {
  if (!links) return '';
  return Object.entries(links)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
}

/** Build the active column set from enabled fields, preserving canonical order. */
export function buildColumns(enabled: Record<CollectableField, boolean>): Column[] {
  const accessors: Record<CollectableField, (l: Lead) => string> = {
    businessName: (l) => l.businessName ?? '',
    phone: (l) => joinArr(l.phone),
    email: (l) => joinArr(l.email),
    website: (l) => l.website ?? '',
    address: (l) => l.address ?? '',
    rating: (l) => (l.rating != null ? String(l.rating) : ''),
    reviewCount: (l) => (l.reviewCount != null ? String(l.reviewCount) : ''),
    category: (l) => l.category ?? '',
    socialLinks: (l) => socialToString(l.socialLinks),
    contactPage: (l) => l.contactPage ?? '',
    mapsUrl: (l) => l.mapsUrl ?? '',
  };

  const columns: Column[] = ALL_FIELDS.filter((f) => enabled[f]).map((field) => ({
    field,
    header: FIELD_LABELS[field],
    value: accessors[field],
  }));

  // Always include provenance columns at the end.
  columns.push({ field: 'source', header: 'Source', value: (l) => (l.source === 'google_maps' ? 'Google Maps' : 'Website') });
  columns.push({
    field: 'createdAt',
    header: 'Date Added',
    value: (l) => new Date(l.createdAt).toLocaleString(),
  });

  return columns;
}

/** Convert leads to an array of plain row objects keyed by header. */
function toRows(leads: Lead[], columns: Column[]): Record<string, string>[] {
  return leads.map((lead) => {
    const row: Record<string, string> = {};
    for (const col of columns) row[col.header] = col.value(lead);
    return row;
  });
}

/** Build a timestamped default file name (no extension). */
function defaultName(prefix: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${prefix}_${date}_${time}`;
}

/** Sanitize a user-supplied name and guarantee the correct extension. */
function withExt(name: string | undefined, fallback: string, ext: string): string {
  let base = (name ?? '').trim() || fallback;
  // Strip an existing matching extension, then re-append (avoids leads.xlsx.xlsx).
  base = base.replace(new RegExp(`\\.${ext}$`, 'i'), '');
  // Remove characters illegal in filenames.
  base = base.replace(/[\\/:*?"<>|]+/g, '-');
  return `${base}.${ext}`;
}

/** Keep text readable inside fixed-width PDF columns. */
function compact(value: string | undefined, max = 120): string {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
}

/** Show a useful, short representation for links instead of giant raw URLs. */
function compactUrl(value?: string): string {
  if (!value) return '';
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/\/$/, '');
    return compact(`${url.hostname.replace(/^www\./i, '')}${path ? path.slice(0, 40) : ''}`, 70);
  } catch {
    return compact(value, 70);
  }
}

function folderLabel(lead: Lead, options?: ExportOptions): string {
  if (!lead.folderId) return 'Unfiled';
  return options?.folderNames?.[lead.folderId] ?? 'Unknown Folder';
}

/* ------------------------------- XLSX ------------------------------- */

/** Export leads to an .xlsx workbook with sized columns. */
export function exportToExcel(leads: Lead[], settings: Settings, filename?: string, options?: ExportOptions): void {
  if (leads.length === 0) throw new Error('No leads to export.');

  const columns = [
    ...buildColumns(settings.enabledFields).filter((col) => col.field !== 'createdAt'),
    { field: 'folder' as const, header: 'Folder', value: (lead: Lead) => folderLabel(lead, options) },
    ...buildColumns(settings.enabledFields).filter((col) => col.field === 'createdAt'),
  ];
  const rows = toRows(leads, columns);

  const worksheet = XLSX.utils.json_to_sheet(rows, { header: columns.map((c) => c.header) });

  // Auto-size columns based on the longest cell (capped for sanity).
  worksheet['!cols'] = columns.map((col) => {
    const maxLen = rows.reduce((max, row) => Math.max(max, (row[col.header] ?? '').length), col.header.length);
    return { wch: Math.min(Math.max(maxLen + 2, 12), 60) };
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');
  XLSX.writeFile(workbook, withExt(filename, defaultName('leads'), 'xlsx'));
}

/* -------------------------------- PDF ------------------------------- */

/**
 * Export leads to a polished PDF: a branded header band on every page, a
 * generated-on timestamp, alternating rows, automatic page breaks and
 * "Page X of Y" footers (stamped in a second pass so the total is accurate).
 */
export function exportToPdf(leads: Lead[], settings: Settings, filename?: string, exportOptions?: ExportOptions): void {
  if (leads.length === 0) throw new Error('No leads to export.');

  const enabled = settings.enabledFields;
  const head = ['Business', 'Contact', 'Location', 'Details', 'Source', 'Added'];
  const body = leads.map((lead) => {
    const contact = [
      enabled.phone ? joinArr(lead.phone) : '',
      enabled.email ? joinArr(lead.email) : '',
      enabled.website ? compactUrl(lead.website) : '',
    ].filter(Boolean).join('\n');

    const details = [
      enabled.category ? lead.category : '',
      enabled.rating && lead.rating != null ? `${lead.rating} stars` : '',
      enabled.reviewCount && lead.reviewCount != null ? `${lead.reviewCount} reviews` : '',
      enabled.contactPage ? `Contact: ${compactUrl(lead.contactPage)}` : '',
      enabled.mapsUrl && lead.mapsUrl ? `Maps: ${compactUrl(lead.mapsUrl)}` : '',
    ].filter(Boolean).join('\n');

    return [
      compact(enabled.businessName ? lead.businessName : '', 80),
      compact(contact, 150),
      compact(enabled.address ? lead.address : '', 130),
      compact(details, 170),
      `${lead.source === 'google_maps' ? 'Google Maps' : 'Website'}\n${folderLabel(lead, exportOptions)}`,
      new Date(lead.createdAt).toLocaleDateString(),
    ];
  });

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const generatedOn = new Date().toLocaleString();
  const BRAND: [number, number, number] = [5, 150, 105]; // emerald-600

  const tableOptions: UserOptions = {
    head: [head],
    body,
    startY: 78,
    margin: { top: 78, bottom: 42, left: 24, right: 24 },
    tableWidth: pageWidth - 48,
    styles: {
      fontSize: 8.2,
      cellPadding: { top: 6, right: 6, bottom: 6, left: 6 },
      overflow: 'linebreak',
      valign: 'top',
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
      minCellHeight: 24,
    },
    columnStyles: {
      0: { cellWidth: 120 },
      1: { cellWidth: 165 },
      2: { cellWidth: 150 },
      3: { cellWidth: 205 },
      4: { cellWidth: 70 },
      5: { cellWidth: 70 },
    },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    alternateRowStyles: { fillColor: [246, 247, 251] },
    // Branded header band drawn on every page.
    didDrawPage: () => {
      doc.setFillColor(BRAND[0], BRAND[1], BRAND[2]);
      doc.rect(0, 0, pageWidth, 56, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(17);
      doc.text('MapHarvest', 24, 28);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.text('Leads Export', 24, 44);
      doc.text(`Generated: ${generatedOn}`, pageWidth - 24, 28, { align: 'right' });
      doc.text(`Total records: ${leads.length}`, pageWidth - 24, 44, { align: 'right' });
    },
  };

  autoTable(doc, tableOptions);

  // Second pass: accurate "Page X of Y" footers.
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Page ${i} of ${total}`, pageWidth / 2, pageHeight - 18, { align: 'center' });
    doc.text('MapHarvest', 24, pageHeight - 18);
  }

  doc.save(withExt(filename, defaultName('leads'), 'pdf'));
}

/* ------------------------------ Import ------------------------------ */

/**
 * Heuristic mapping from arbitrary spreadsheet headers to our lead fields.
 * Each field lists header substrings (lowercased) that should map to it.
 */
const HEADER_ALIASES: Record<keyof ScrapedLead | 'ignore', string[]> = {
  businessName: ['business', 'company', 'name', 'organization', 'org'],
  phone: ['phone', 'tel', 'mobile', 'contact number', 'whatsapp'],
  email: ['email', 'e-mail', 'mail'],
  website: ['website', 'url', 'site', 'web'],
  domain: ['domain'],
  address: ['address', 'location', 'street'],
  rating: ['rating', 'stars'],
  reviewCount: ['reviews', 'review count', 'ratings count'],
  category: ['category', 'type', 'industry'],
  socialLinks: ['social', 'facebook', 'instagram', 'linkedin', 'twitter'],
  contactPage: ['contact page', 'contact url'],
  mapsUrl: ['maps', 'google maps', 'map url'],
  latitude: ['lat', 'latitude'],
  longitude: ['lng', 'lon', 'long', 'longitude'],
  openingHours: ['hours', 'opening'],
  source: ['source'],
  sourceUrl: ['source url'],
  folderId: [],
  ignore: [],
};

/** Resolve a header string to a lead field, or null if unrecognised. */
function mapHeader(header: string): keyof ScrapedLead | null {
  const h = header.toLowerCase().trim();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (field === 'ignore') continue;
    if (aliases.some((alias) => h === alias || h.includes(alias))) {
      return field as keyof ScrapedLead;
    }
  }
  return null;
}

/** Convert a single imported row object into a ScrapedLead. */
function rowToLead(row: Record<string, unknown>): ScrapedLead | null {
  const lead: Partial<ScrapedLead> = { source: 'website', sourceUrl: '' };

  for (const [rawHeader, rawValue] of Object.entries(row)) {
    const field = mapHeader(rawHeader);
    if (!field || rawValue == null || rawValue === '') continue;
    const value = String(rawValue).trim();

    switch (field) {
      case 'phone':
      case 'email':
        lead[field] = value.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
        break;
      case 'rating':
        lead.rating = parseFloat(value) || undefined;
        break;
      case 'reviewCount':
        lead.reviewCount = parseInt(value.replace(/[^\d]/g, ''), 10) || undefined;
        break;
      case 'latitude':
        lead.latitude = parseFloat(value) || undefined;
        break;
      case 'longitude':
        lead.longitude = parseFloat(value) || undefined;
        break;
      case 'socialLinks':
        // Accept "facebook: url; instagram: url" or a bare URL.
        lead.socialLinks = lead.socialLinks ?? {};
        if (value.includes(':') && /\w+:\s*https?/i.test(value)) {
          value.split(';').forEach((pair) => {
            const [k, ...rest] = pair.split(':');
            const url = rest.join(':').trim();
            if (k && url) lead.socialLinks![k.trim().toLowerCase()] = url;
          });
        } else if (/https?:/i.test(value)) {
          lead.socialLinks[`link${Object.keys(lead.socialLinks).length + 1}`] = value;
        }
        break;
      case 'openingHours':
        lead.openingHours = value.split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
        break;
      case 'source':
        lead.source = value.toLowerCase().includes('map') ? 'google_maps' : 'website';
        break;
      default:
        (lead as Record<string, unknown>)[field] = value;
    }
  }

  // Derive domain from website when missing.
  if (!lead.domain && lead.website) lead.domain = extractDomain(lead.website);
  if (!lead.sourceUrl) lead.sourceUrl = lead.website ?? lead.mapsUrl ?? '';

  // Require at least one identifying field.
  const hasData = lead.businessName || lead.phone?.length || lead.email?.length || lead.website;
  return hasData ? (lead as ScrapedLead) : null;
}

/** Parse a CSV or XLSX File into ScrapedLeads with auto column mapping. */
export async function importLeadsFromFile(file: File): Promise<ScrapedLead[]> {
  const buffer = await file.arrayBuffer();
  const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';

  const workbook = isCsv
    ? XLSX.read(new TextDecoder('utf-8').decode(buffer), { type: 'string' })
    : XLSX.read(buffer, { type: 'array' });

  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error('The file contains no sheets.');

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], {
    defval: '',
    raw: false,
  });

  const leads = rows.map(rowToLead).filter((l): l is ScrapedLead => l !== null);
  if (leads.length === 0) throw new Error('No recognisable lead rows found in the file.');
  return leads;
}
