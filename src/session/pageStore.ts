import { randomBytes } from 'node:crypto';

/** Short hex identifier used for page ids, action ids, etc. */
export function hexId(): string {
  return randomBytes(6).toString('hex');
}

export interface AuditRecord {
  auditedAt: string;
  audit: unknown;
}

export interface PageRecord {
  id: string;
  url: string;
  firstSeenAt: string;
  audits: AuditRecord[];
}

export interface PageStoreSnapshot {
  pages: string[];
  audits: Array<{ pageId: string; audit: unknown }>;
}

/**
 * Per-session audit history keyed by URL. The first visit to a URL mints a hex
 * page id; audits append to that page so repeated audits of the same URL
 * accumulate under one id.
 */
export class PageStore {
  private readonly records = new Map<string, PageRecord>();

  record(url: string): PageRecord {
    let record = this.records.get(url);
    if (!record) {
      record = { id: hexId(), url, firstSeenAt: new Date().toISOString(), audits: [] };
      this.records.set(url, record);
    }
    return record;
  }

  appendAudit(url: string, audit: unknown): string {
    const record = this.record(url);
    record.audits.push({ auditedAt: new Date().toISOString(), audit });
    return record.id;
  }

  snapshot(): PageStoreSnapshot {
    const pages: string[] = [];
    const audits: PageStoreSnapshot['audits'] = [];
    for (const record of this.records.values()) {
      pages.push(record.id);
      for (const entry of record.audits) {
        audits.push({ pageId: record.id, audit: entry.audit });
      }
    }
    return { pages, audits };
  }

  toJSON(): PageRecord[] {
    return [...this.records.values()];
  }
}
