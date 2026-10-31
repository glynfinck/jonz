import {
  AUDIT_WHAT_ACTION,
  auditSearchFilter,
  humanError,
  noticeFromRow,
  qrShape,
  type AuditEntry,
  type AuditWhat,
  type AuditWho,
  type ListAsk,
  type Notice,
  type PendingDeletion,
  type QrShape,
} from '@app/core';

import { apiPost } from './http';
import { supabase } from './supabase';

// The owner's admin page (docs/specs/owner-admin.md). Every read and write
// here goes through the owner's own session, and the database decides: it
// answers an owner who has passed their code, and refuses everyone else.

/** Whether this account is the owner, and whether this session has passed the code. */
export interface OwnerStatus {
  owner: boolean;
  mfa: boolean;
}

export async function ownerStatus(): Promise<OwnerStatus> {
  const { data, error } = await supabase.rpc('owner_status');
  if (error) throw new Error(humanError(error));
  const status = data as Partial<OwnerStatus> | null;
  return { owner: status?.owner === true, mfa: status?.mfa === true };
}

/** The account's authenticator, if it has one that has been checked. */
export async function verifiedFactor(): Promise<string | null> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error(error.message);
  return data.totp.find((factor) => factor.status === 'verified')?.id ?? null;
}

export interface NewFactor {
  id: string;
  /** The QR code for the app to scan, or null if Supabase's couldn't be read. */
  qr: QrShape | null;
  /** The key to type in by hand. */
  secret: string;
  /** otpauth://, which a phone's passwords app opens. */
  uri: string;
}

/** Starts adding an authenticator: a QR code and key for the app, checked by the first code. */
export async function enrollFactor(): Promise<NewFactor> {
  // An earlier try that was never checked would block a new one: take it away first.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type === 'totp' && factor.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Jonz admin' });
  if (error) throw new Error(error.message);
  return { id: data.id, qr: qrShape(data.totp.qr_code), secret: data.totp.secret, uri: data.totp.uri };
}

/** Checks a code; afterwards the session has passed the second factor. False for a wrong code. */
export async function checkCode(factorId: string, code: string): Promise<boolean> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') });
  return !error;
}

/** Every notice, on or not: the owner reads them all. */
export async function ownerNotices(): Promise<Notice[]> {
  const { data, error } = await supabase
    .from('notices')
    .select('id, kind, title, body, link_label, link_url, starts_at, ends_at')
    .order('starts_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(humanError(error));
  return data.map(noticeFromRow).filter((notice): notice is Notice => notice !== null);
}

export interface SavedNotice {
  id: string | null;
  kind: Notice['kind'];
  title: string;
  body: string;
  linkLabel: string | null;
  linkUrl: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
}

/** Saves a notice (new when id is null), then updates the copy kept for outages. Says whether the copy kept up. */
export async function saveNotice(notice: SavedNotice): Promise<{ id: string; copied: boolean }> {
  const { data, error } = await supabase.rpc('save_notice', {
    p_id: notice.id,
    p_kind: notice.kind,
    p_title: notice.title,
    p_body: notice.body,
    p_link_label: notice.linkLabel,
    p_link_url: notice.linkUrl,
    p_starts_at: notice.startsAt?.toISOString() ?? null,
    p_ends_at: notice.endsAt?.toISOString() ?? null,
  });
  if (error) throw new Error(humanError(error));
  return { id: data, copied: await refreshCopy() };
}

export async function endNotice(id: string): Promise<{ copied: boolean }> {
  const { error } = await supabase.rpc('end_notice', { p_id: id });
  if (error) throw new Error(humanError(error));
  return { copied: await refreshCopy() };
}

const CopyResponse = {
  parse: (value: unknown) => ({ copied: (value as { copied?: unknown } | null)?.copied === true }),
};

/** POST /api/notices/copy. False when it didn't go; the notice itself is saved either way. */
async function refreshCopy(): Promise<boolean> {
  try {
    await apiPost('/api/notices/copy', {}, CopyResponse);
    return true;
  } catch {
    return false;
  }
}

const PAGE = 50;
const AUDIT_COLUMNS = 'id, at, actor, action, target_kind, target_id, reason, before, after';

/** What the audit log is narrowed to: the search box, Who (with whose account "You" is), What, and When's window. */
export interface AuditFilter {
  q: string;
  who: AuditWho;
  what: AuditWhat;
  ownerId: string | null;
  after: string | null;
  before: string | null;
}

export const ALL_OF_THE_AUDIT: AuditFilter = { q: '', who: 'anyone', what: 'anything', ownerId: null, after: null, before: null };

/** The audit log's filter from what its search box asks, with whose account "You" is. */
export function auditFilter(ask: ListAsk, ownerId: string | null): AuditFilter {
  return {
    q: ask.q,
    who: (ask.picks.who ?? 'anyone') as AuditWho,
    what: (ask.picks.what ?? 'anything') as AuditWhat,
    ownerId,
    after: ask.after,
    before: ask.before,
  };
}

/** The filter methods both of the audit log's reads share, whatever they select. */
interface Narrowable<T> {
  eq(column: string, value: unknown): T;
  neq(column: string, value: unknown): T;
  not(column: string, operator: string, value: unknown): T;
  is(column: string, value: null): T;
  like(column: string, pattern: string): T;
  gt(column: string, value: unknown): T;
  lte(column: string, value: unknown): T;
  or(filters: string): T;
}

/** The database does the narrowing, so the log reads as fast with a million entries as with fifty. */
function narrowed<T extends Narrowable<T>>(query: T, filter: AuditFilter): T {
  let narrow = query;
  if (filter.who === 'you' && filter.ownerId) narrow = narrow.eq('actor', filter.ownerId);
  if (filter.who === 'others') {
    narrow = narrow.not('actor', 'is', null);
    if (filter.ownerId) narrow = narrow.neq('actor', filter.ownerId);
  }
  if (filter.who === 'jonz') narrow = narrow.is('actor', null);
  const action = AUDIT_WHAT_ACTION[filter.what];
  if (action) narrow = narrow.like('action', `${action}%`);
  if (filter.after) narrow = narrow.gt('at', filter.after);
  if (filter.before) narrow = narrow.lte('at', filter.before);
  const search = auditSearchFilter(filter.q);
  if (search) narrow = narrow.or(search);
  return narrow;
}

/** A page of the audit log, newest first, older than `before` (an entry's id) when given, narrowed by `filter`. */
export async function auditPage(
  before: number | null,
  filter: AuditFilter = ALL_OF_THE_AUDIT,
): Promise<{ entries: AuditEntry[]; more: boolean }> {
  let query = narrowed(supabase.from('admin_audit').select(AUDIT_COLUMNS), filter)
    .order('id', { ascending: false })
    .limit(PAGE + 1);
  if (before !== null) query = query.lt('id', before);
  const { data, error } = await query;
  if (error) throw new Error(humanError(error));
  return { entries: data.slice(0, PAGE).map(entryFromRow), more: data.length > PAGE };
}

/** How many entries match: the database's own count, estimated once there are too many to count quickly. */
export async function auditCount(filter: AuditFilter = ALL_OF_THE_AUDIT): Promise<number> {
  const { count, error } = await narrowed(supabase.from('admin_audit').select('id', { count: 'estimated', head: true }), filter);
  if (error) throw new Error(humanError(error));
  return count ?? 0;
}

/** One entry of the audit log, for its own page on a phone; null when there's none with that id. */
export async function auditEntry(id: number): Promise<AuditEntry | null> {
  const { data, error } = await supabase.from('admin_audit').select(AUDIT_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(humanError(error));
  return data ? entryFromRow(data) : null;
}

function entryFromRow(row: {
  id: number;
  at: string;
  actor: string | null;
  action: string;
  target_kind: string;
  target_id: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
}): AuditEntry {
  return {
    id: row.id,
    at: row.at,
    actor: row.actor,
    action: row.action,
    targetKind: row.target_kind,
    targetId: row.target_id,
    reason: row.reason,
    before: row.before,
    after: row.after,
  };
}

// --- Deletions -----------------------------------------------------------------------

/** Everyone waiting to be deleted, soonest first. */
export async function ownerDeletions(): Promise<PendingDeletion[]> {
  const { data, error } = await supabase.rpc('owner_deletions');
  if (error) throw new Error(humanError(error));
  return (data ?? []).map((row) => ({
    userId: row.user_id,
    name: row.name,
    email: row.email ?? null,
    house: row.house_name ?? null,
    requestedAt: row.requested_at,
    deleteAfter: row.delete_after,
    requestedBy: row.requested_by === 'owner' ? 'owner' : 'self',
  }));
}

/** Delete now: the clock takes it within ten minutes. */
export async function deleteNow(userId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('owner_delete_now', { p_user: userId, p_reason: reason.trim() || undefined });
  if (error) throw new Error(humanError(error));
}

/** Stop: as if they'd pressed Keep my account. */
export async function stopDeletion(userId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('owner_stop_deletion', { p_user: userId, p_reason: reason.trim() || undefined });
  if (error) throw new Error(humanError(error));
}

/** Starts the 30 days for whoever has this email, who asked by email. */
export async function deleteByEmail(email: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('owner_request_deletion', { p_email: email.trim(), p_reason: reason.trim() || undefined });
  if (error) throw new Error(humanError(error));
}
