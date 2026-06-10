import { useEffect, useState } from 'react';
import type { Lead } from '@/types';
import { Modal } from '@/components/Modal';

interface EditLeadModalProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onSave: (lead: Lead) => void;
}

/** Convert a comma/semicolon separated string into a trimmed array. */
function parseList(value: string): string[] | undefined {
  const arr = value
    .split(/[;,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return arr.length ? arr : undefined;
}

/** Parse "platform: url" lines into a social-links record. */
function parseSocial(value: string): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  value
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line) => {
      const idx = line.indexOf(':');
      if (idx > 0) {
        const key = line.slice(0, idx).trim().toLowerCase();
        const url = line.slice(idx + 1).trim();
        if (key && url) out[key] = url;
      }
    });
  return Object.keys(out).length ? out : undefined;
}

/** Editable text field row. */
function Field({
  label,
  value,
  onChange,
  textarea,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {textarea ? (
        <textarea className="input min-h-[68px] resize-y" value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className="input" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

/** Modal form for editing a single lead's fields. */
export function EditLeadModal({ lead, open, onClose, onSave }: EditLeadModalProps) {
  const [draft, setDraft] = useState<Lead | null>(lead);

  useEffect(() => setDraft(lead), [lead]);

  if (!draft) return null;

  const set = (patch: Partial<Lead>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const handleSubmit = () => {
    onSave(draft);
  };

  return (
    <Modal
      open={open}
      title="Edit lead"
      onClose={onClose}
      widthClass="max-w-2xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit}>Save changes</button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Business Name" value={draft.businessName ?? ''} onChange={(v) => set({ businessName: v })} />
        <Field label="Category" value={draft.category ?? ''} onChange={(v) => set({ category: v })} />
        <Field
          label="Phone (comma separated)"
          value={(draft.phone ?? []).join(', ')}
          onChange={(v) => set({ phone: parseList(v) })}
        />
        <Field
          label="Email (comma separated)"
          value={(draft.email ?? []).join(', ')}
          onChange={(v) => set({ email: parseList(v) })}
        />
        <Field label="Website" value={draft.website ?? ''} onChange={(v) => set({ website: v })} />
        <Field label="Domain" value={draft.domain ?? ''} onChange={(v) => set({ domain: v })} />
        <Field
          label="Rating"
          type="number"
          value={draft.rating != null ? String(draft.rating) : ''}
          onChange={(v) => set({ rating: v ? Number(v) : undefined })}
        />
        <Field
          label="Reviews"
          type="number"
          value={draft.reviewCount != null ? String(draft.reviewCount) : ''}
          onChange={(v) => set({ reviewCount: v ? Number(v) : undefined })}
        />
        <div className="sm:col-span-2">
          <Field label="Address" value={draft.address ?? ''} onChange={(v) => set({ address: v })} textarea />
        </div>
        <Field label="Contact Page" value={draft.contactPage ?? ''} onChange={(v) => set({ contactPage: v })} />
        <Field label="Google Maps URL" value={draft.mapsUrl ?? ''} onChange={(v) => set({ mapsUrl: v })} />
        <div className="sm:col-span-2">
          <Field
            label="Social Links (one per line, e.g. facebook: https://…)"
            value={Object.entries(draft.socialLinks ?? {})
              .map(([k, v]) => `${k}: ${v}`)
              .join('\n')}
            onChange={(v) => set({ socialLinks: parseSocial(v) })}
            textarea
          />
        </div>
      </div>
    </Modal>
  );
}
