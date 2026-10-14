import { useState } from 'react';
import { Check, Copy, Mail } from 'lucide-react';
import type { Lead } from '@workspace/api-client-react';

export function LeadOutreachDraft({ lead }: { lead: Lead }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');

  if (lead.contactStatus !== 'qualified' || !lead.contactEmail) {
    return null;
  }

  const salutation = lead.contactName?.trim() ? `Hello ${lead.contactName.trim()},` : 'Hello,';
  const draft = [
    salutation,
    '',
    `I’m reaching out regarding ${lead.title}${lead.location ? ` in ${lead.location}` : ''}.`,
    'I reviewed the publicly available information associated with this opportunity and would welcome the chance to confirm whether a conversation would be appropriate.',
    '',
    'If you are open to speaking, please let me know a convenient time. There is no urgency to respond if this is not relevant.',
    '',
    'Regards,',
    'Distress Intelligence Operations',
  ].join('\n');

  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setCopyError('');
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
      setCopyError('Clipboard access is unavailable in this browser.');
    }
  };

  return (
    <section className="outreach-draft" aria-label="Verified contact outreach draft">
      <div className="outreach-draft-head">
        <div className="outreach-draft-icon"><Mail size={15} /></div>
        <div>
          <strong>Professional outreach draft</strong>
          <span>Qualified contact · copy only · never sent automatically</span>
        </div>
      </div>
      <p className="outreach-recipient">Prepared for {lead.contactEmail}</p>
      <div className="outreach-preview">{draft}</div>
      {copyError && <p className="outreach-error" role="status">{copyError}</p>}
      <button className="button button-secondary outreach-copy" type="button" onClick={copyDraft} data-testid={`button-copy-outreach-${lead.id}`}>
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? 'Draft copied' : 'Copy draft'}
      </button>
    </section>
  );
}
