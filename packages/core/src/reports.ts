import { z } from "zod";

import type { ListFacet, ListWhen } from "./admin-list";

// Report a problem (docs/specs/report-a-problem.md): what someone tells Jonz
// from inside the app, what they see again under Your reports, and how the
// owner's Inbox lists it. The database keeps the same limits
// (supabase/migrations/20261112090000_reports.sql).

export const REPORT_KINDS = ["problem", "idea", "question"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_STATES = ["new", "open", "replied", "fixed"] as const;
export type ReportState = (typeof REPORT_STATES)[number];

export const SUPPORT_EMAIL = "support@jonz.app";

/** How much one report may carry, and how many a day each person may send. */
export const REPORT_LIMITS = {
  perDay: 5,
  words: 2000,
  shots: 3,
  /** The bucket refuses anything bigger; the app shrinks screenshots well under it. */
  shotBytes: 5 * 1024 * 1024,
} as const;

/** What the app sends with a report when its sender says so: one short line each. */
export const ReportDetails = z.object({
  pages: z.string().max(300).optional(),
  app: z.string().max(200).optional(),
  house: z.string().max(200).optional(),
  error: z.string().max(300).optional(),
});
export type ReportDetails = z.infer<typeof ReportDetails>;

/** POST /api/reports: send one. Screenshots are uploaded first, to the sender's own folder. */
export const ReportRequest = z.object({
  kind: z.enum(REPORT_KINDS),
  words: z.string().trim().min(1).max(REPORT_LIMITS.words),
  details: ReportDetails.nullable(),
  shots: z.array(z.string().min(1).max(200)).max(REPORT_LIMITS.shots),
});
export type ReportRequest = z.infer<typeof ReportRequest>;

export const ReportResponse = z.object({ ok: z.literal(true), id: z.string() });

/** POST /api/reports/:id/messages (its sender writes back) and /api/reports/:id/reply (the owner replies). */
export const ReportMessageRequest = z.object({ body: z.string().trim().min(1).max(REPORT_LIMITS.words) });
export type ReportMessageRequest = z.infer<typeof ReportMessageRequest>;

export const ReportMessageResponse = z.object({ ok: z.literal(true) });

/** A report's first line, short enough for a push or a list row. */
export function reportGist(words: string, max = 80): string {
  const line = words.trim().split("\n")[0].trim();
  if (line.length <= max) return line;
  const cut = line.slice(0, max - 1);
  // End on a whole word when one ends near the cut, so it never reads "still o…".
  const whole = /\s/.test(line[max - 1]) || /[\s,;:.!?]$/.test(cut);
  const space = cut.lastIndexOf(" ");
  const end = whole || space < max * 0.6 ? cut : cut.slice(0, space);
  return `${end.replace(/[\s,;:.\-–—]+$/, "")}…`;
}

/** The pushes a report sends. */
export const REPORT_PUSH = {
  /** To the owner. */
  sent: (kind: ReportKind, name: string | null) =>
    `${name ?? "Someone"} sent ${kind === "problem" ? "a problem" : kind === "idea" ? "an idea" : "a question"}`,
  wroteBack: (name: string | null) => `${name ?? "Someone"} wrote back`,
  /** To its sender. */
  replied: (signed: string | null) => (signed ? `${signed} at Jonz replied` : "Jonz replied"),
} as const;

export const REPORT_COPY = {
  help: "Help",
  report: "Report a problem",
  idea: "Send an idea",
  yours: "Your reports",
  yoursMeta: (count: number, replies: number) =>
    replies > 0 ? (replies === 1 ? "A reply to read" : `${replies} replies to read`) : count === 0 ? "None yet" : count === 1 ? "1 sent" : `${count} sent`,
  orEmail: `Or email ${SUPPORT_EMAIL}.`,
  kindLabel: "What is it?",
  kind: { problem: "Problem", idea: "Idea", question: "Question" } satisfies Record<ReportKind, string>,
  title: { problem: "Report a problem", idea: "Send an idea", question: "Ask a question" } satisfies Record<ReportKind, string>,
  words: { problem: "What happened?", idea: "What would help?", question: "What would you like to know?" } satisfies Record<ReportKind, string>,
  placeholder: {
    problem: "What you did, and what you saw instead",
    idea: "What you’d like Jonz to do",
    question: "Ask anything about Jonz",
  } satisfies Record<ReportKind, string>,
  screenshots: "Screenshots",
  addScreenshot: "Add a screenshot",
  removeScreenshot: (n: number) => `Take out screenshot ${n}`,
  screenshotsNote: "A screenshot can show your housemates’ names. Only Jonz sees it.",
  details: "Send the details that help",
  detailsMeta: "So we can find it faster",
  detail: { pages: "Pages", app: "App", house: "House", error: "Last error" },
  send: { problem: "Send report", idea: "Send idea", question: "Send question" } satisfies Record<ReportKind, string>,
  promise: "We read every one, and reply here and by email.",
  // Your reports.
  state: { new: "Sent", open: "Read", replied: "Replied", fixed: "Fixed" } satisfies Record<ReportState, string>,
  /** The same states as the owner sees them. */
  ownerState: { new: "New", open: "Open", replied: "Replied", fixed: "Fixed" } satisfies Record<ReportState, string>,
  yourReport: "Your report",
  sentAt: (kind: ReportKind, at: string) => `${REPORT_COPY.kind[kind]}, sent ${at}`,
  you: "You",
  fromJonz: (name: string) => `${name} at Jonz`,
  jonz: "Jonz",
  writeBack: "Write back",
  noneYet: "Nothing sent yet",
  noneYetBody: "Problems you report and ideas you send are kept here with our replies.",
  missing: "That report isn’t here",
  missingBody: "It may have been sent from another account.",
  // The owner's Inbox.
  inbox: "Inbox",
  from: "From",
  what: "What they said",
  kindColumn: "Kind",
  stateColumn: "State",
  when: "When",
  replyTo: (name: string) => `Reply to ${name}, in the app and by email`,
  sendReply: "Send reply",
  markFixed: "Mark fixed",
  reopen: "Open it again",
  note: "Every reply and every change goes in the audit log.",
  noHouse: "No house",
  role: { admin: "admin", member: "housemate" },
  gone: "Someone who left",
  sending: "Sending…",
  sent: "Sent. We’ll reply here.",
  replied: "Reply sent",
  tooBig: "That picture is too big. Try a smaller one.",
  searchPlaceholder: "Name, email, house or words",
  count: (count: string) => (count === "1" ? "1 report" : `${count} reports`),
  empty: "Nothing to answer",
  emptyBody: "Problems, ideas and questions from the app arrive here.",
} as const;

/** The Inbox's filters: what state it's in, and what kind it is. It opens on what's waiting for you. */
export const REPORT_FACETS: readonly ListFacet[] = [
  {
    key: "state",
    label: "State",
    options: [
      { value: "waiting", label: "Waiting", words: ["waiting", "open", "unanswered", "todo"] },
      { value: "new", label: "New", words: ["new", "unread"] },
      { value: "replied", label: "Replied", words: ["replied", "answered"] },
      { value: "fixed", label: "Fixed", words: ["fixed", "done", "closed"] },
      { value: "any", label: "Any state" },
    ],
  },
  {
    key: "kind",
    label: "Kind",
    options: [
      { value: "any", label: "Any kind" },
      { value: "problem", label: "Problems", words: ["problem", "bug", "broken", "wrong", "crash"] },
      { value: "idea", label: "Ideas", words: ["idea", "feature", "wish", "suggestion"] },
      { value: "question", label: "Questions", words: ["question", "ask", "how"] },
    ],
  },
];

export const REPORT_WHEN: ListWhen = { label: "Sent" };

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** How long ago, short enough for the Inbox's When column: "4 min", "3 h", "Thu", "12 Oct". */
export function reportAge(iso: string, now: Date): string {
  const at = new Date(iso);
  const minutes = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  if (hours < 24 * 6) return WEEKDAY[at.getDay()];
  return `${at.getDate()} ${MONTH[at.getMonth()]}`;
}
