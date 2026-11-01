import { humanError, ReportMessageRequest, ReportMessageResponse } from "@app/core";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { replyToReport } from "@/lib/moves/reports";
import { error, json, preflight, refused } from "@/lib/respond";

/**
 * POST /api/reports/:id/reply `{ body }`: the owner replies, signed in with
 * their code. Its sender gets a push and an email; the reply goes in the
 * audit log.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;

  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return error(request, 404, humanError({ message: "not_found" }));
  const body = ReportMessageRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return error(request, 400, "Write a reply, in up to 2,000 letters.");

  const refusal = await replyToReport({ db: auth.supabase, userId: auth.user.id }, id.data, body.data);
  if (refusal) return refused(request, refusal);
  return json(request, ReportMessageResponse.parse({ ok: true }));
}

export const OPTIONS = preflight;
