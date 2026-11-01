import "server-only";

import {
  firstName,
  REPORT_PUSH,
  type ReportMessageRequest,
  type ReportRequest,
  reportGist,
  reportReplyEmail,
  reportUrl,
} from "@app/core";

import { sendEmail } from "@/lib/email";
import type { Notify } from "@/lib/engine/tick";
import { pushNotifier } from "@/lib/push";
import { type AdminClient, createAdminClient } from "@/lib/supabase/admin";

import type { Caller, Refusal } from "./disputes";

// Report a problem (docs/specs/report-a-problem.md) needs a server for one
// thing: telling the other side. Sending, writing back and replying are the
// caller's own calls to the database, which decides whether they may
// (supabase/migrations/20261112090000_reports.sql); then the owner gets a
// push for each new word from a sender, and a sender gets a push and an
// email for each reply.

/** Where a push or an email is sent, and what with: kept apart so tests can watch. */
export interface Outbox {
  db: AdminClient;
  notify: Notify | undefined;
  email: typeof sendEmail;
}

export function outbox(): Outbox {
  const db = createAdminClient();
  return { db, notify: pushNotifier(db), email: sendEmail };
}

/** Everyone who owns Jonz: they hear about every report. */
async function owners(db: AdminClient): Promise<string[]> {
  const { data } = await db.from("app_owners").select("user_id");
  return (data ?? []).map((o) => o.user_id);
}

async function nameOf(db: AdminClient, userId: string): Promise<string | null> {
  const { data } = await db.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  return data?.display_name ? firstName(data.display_name) : null;
}

/** Send a report; the owner hears "Ava sent a problem: The bins John vanished…". */
export async function sendReport(caller: Caller, report: ReportRequest, out: Outbox = outbox()): Promise<{ refusal: Refusal } | { id: string }> {
  const { data: id, error } = await caller.db.rpc("send_report", {
    p_kind: report.kind,
    p_words: report.words,
    p_details: report.details ?? undefined,
    p_shots: report.shots,
  });
  if (error || !id) return { refusal: error ?? { message: "not_found" } };

  if (out.notify) {
    const [to, name] = await Promise.all([owners(out.db), nameOf(out.db, caller.userId)]);
    await out.notify(to, {
      title: REPORT_PUSH.sent(report.kind, name),
      body: reportGist(report.words),
      url: `/admin/inbox/${id}`,
      kind: "support",
      zone: "UTC",
      tag: `report:${id}`,
    });
  }
  return { id };
}

/** Write back on your own report; the owner hears "Ava wrote back". */
export async function writeBack(caller: Caller, reportId: string, { body }: ReportMessageRequest, out: Outbox = outbox()): Promise<Refusal | null> {
  const { error } = await caller.db.rpc("write_back", { p_report: reportId, p_body: body });
  if (error) return error;

  if (out.notify) {
    const [to, name] = await Promise.all([owners(out.db), nameOf(out.db, caller.userId)]);
    await out.notify(to, {
      title: REPORT_PUSH.wroteBack(name),
      body: reportGist(body),
      url: `/admin/inbox/${reportId}`,
      kind: "support",
      zone: "UTC",
      tag: `report:${reportId}`,
    });
  }
  return null;
}

/**
 * Reply, as the owner (the database checks it is them, with their code).
 * Its sender gets a push and an email; if they've deleted their account
 * since, there's nobody to tell.
 */
export async function replyToReport(
  caller: Caller,
  reportId: string,
  { body }: ReportMessageRequest,
  out: Outbox = outbox(),
): Promise<Refusal | null> {
  const { data, error } = await caller.db.rpc("owner_reply_report", { p_report: reportId, p_body: body });
  if (error) return error;
  const told = data as { user_id: string | null; kind: ReportRequest["kind"]; words: string; signed: string | null; zone: string | null };
  if (!told.user_id) return null;

  const title = REPORT_PUSH.replied(told.signed);
  await out.notify?.([told.user_id], {
    title,
    body: reportGist(body),
    url: `/house/reports/${reportId}`,
    kind: "support",
    zone: told.zone ?? "UTC",
    tag: `report:${reportId}`,
  });

  const [{ data: who }, name] = await Promise.all([
    out.db.auth.admin.getUserById(told.user_id),
    nameOf(out.db, told.user_id),
  ]);
  const address = who?.user?.email;
  if (address) {
    // A failed email is logged by sendEmail; the reply is in the app either way.
    await out.email(
      address,
      reportReplyEmail({ name, signed: told.signed, kind: told.kind, words: told.words, reply: body, url: reportUrl(reportId) }),
      { tag: "report-reply" },
    );
  }
  return null;
}
