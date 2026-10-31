import { tz } from "@date-fns/tz";
import { format, startOfDay } from "date-fns";

/**
 * How every owner admin list is searched and filtered, the same on every
 * page: one search box, up to three drop-downs in a fixed order, and When.
 * The page keeps what's set in its address, so Back, a refresh and a
 * bookmark all come back to the same rows. The server does the searching
 * and the filtering; these only say what was asked for.
 */

/** When, as the drop-down offers it. `any` is no limit. */
export type WhenPreset = "hour" | "today" | "week" | "month" | "any";

export const WHEN_PRESETS: readonly WhenPreset[] = ["hour", "today", "week", "month", "any"];

export const WHEN_LABEL: Record<WhenPreset, string> = {
  hour: "The last hour",
  today: "Today",
  week: "The last 7 days",
  month: "The last 30 days",
  any: "Any time",
};

/** What a list is asked for: the words searched, each drop-down's choice by its key, and When. */
export interface ListQuery {
  q: string;
  /** Each drop-down's choice, by the drop-down's key ("who", "what"); a missing key is its first choice. */
  picks: Record<string, string>;
  when: WhenPreset;
  /** Start from a moment: the list begins here and goes back, instead of at now. */
  from: string | null;
}

/** The window a query reads: newer than `after`, no newer than `before`. Null is no limit. */
export interface ListWindow {
  after: string | null;
  before: string | null;
}

/**
 * The window When asks for, in the owner's zone: Today starts at midnight
 * there. Starting from a moment reads back from it, with no lower limit, so
 * you can keep scrolling past the day you jumped to.
 */
export function listWindow(query: Pick<ListQuery, "when" | "from">, now: Date, zone: string): ListWindow {
  if (query.from) return { after: null, before: query.from };
  const hours = (n: number) => new Date(now.getTime() - n * 3_600_000).toISOString();
  switch (query.when) {
    case "hour":
      return { after: hours(1), before: null };
    case "today":
      // A TZDate writes its own offset; the server wants plain UTC.
      return { after: new Date(startOfDay(now, { in: tz(zone) }).getTime()).toISOString(), before: null };
    case "week":
      return { after: hours(7 * 24), before: null };
    case "month":
      return { after: hours(30 * 24), before: null };
    case "any":
      return { after: null, before: null };
  }
}

/**
 * A row's time: "16:41:07" today (or "16:41" where seconds won't fit),
 * "Thu 29 Oct, 23:58" before today. No day headings: in a busy list a day
 * holds thousands of rows, so the date rides in the time column instead.
 */
export function listTime(iso: string, now: Date, zone: string, seconds = true): string {
  const at = new Date(iso);
  const inZone = { in: tz(zone) };
  const sameDay = format(at, "yyyy-MM-dd", inZone) === format(now, "yyyy-MM-dd", inZone);
  if (sameDay) return format(at, seconds ? "HH:mm:ss" : "HH:mm", inZone);
  return format(at, "EEE d MMM, HH:mm", inZone);
}

type Params = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/**
 * A query from the page's address. Only the drop-downs the page has are
 * read, and only choices they offer; anything else falls back to the first
 * choice, so an old or mistyped link still opens the list.
 */
export function listQueryFromParams(
  params: Params,
  dropDowns: Record<string, readonly string[]>,
  defaultWhen: WhenPreset = "any",
): ListQuery {
  const picks: Record<string, string> = {};
  for (const [key, choices] of Object.entries(dropDowns)) {
    const pick = one(params[key]);
    if (pick && choices.includes(pick)) picks[key] = pick;
  }
  const when = one(params.when);
  const from = one(params.from);
  return {
    q: (one(params.q) ?? "").slice(0, 200),
    picks,
    when: when && (WHEN_PRESETS as readonly string[]).includes(when) ? (when as WhenPreset) : defaultWhen,
    from: from && !Number.isNaN(Date.parse(from)) ? new Date(from).toISOString() : null,
  };
}

/** The page's address for a query: only what differs from the page's defaults, so a plain list has a plain address. */
export function listQueryToParams(query: ListQuery, defaultWhen: WhenPreset = "any"): Record<string, string> {
  const params: Record<string, string> = {};
  const q = query.q.trim();
  if (q) params.q = q;
  for (const [key, pick] of Object.entries(query.picks)) params[key] = pick;
  if (query.from) params.from = query.from;
  else if (query.when !== defaultWhen) params.when = query.when;
  return params;
}

/** Whether anything is set, for Clear. */
export function listQueryIsSet(query: ListQuery, defaultWhen: WhenPreset = "any"): boolean {
  return Object.keys(listQueryToParams(query, defaultWhen)).length > 0;
}

/** "2,481", "about 48,000": exact up to ten thousand, then rounded, because past that the database estimates. */
export function listCount(count: number, exact: boolean): string {
  if (exact || count < 10_000) return count.toLocaleString("en-GB");
  return `about ${(Math.round(count / 1000) * 1000).toLocaleString("en-GB")}`;
}

// --- The audit log's search and drop-downs ---------------------------------------------

export const AUDIT_WHO = ["anyone", "you", "others", "jonz"] as const;
export type AuditWho = (typeof AUDIT_WHO)[number];
export const AUDIT_WHAT = ["anything", "notices", "accounts"] as const;
export type AuditWhat = (typeof AUDIT_WHAT)[number];

/** The audit log's drop-downs, in their order: Who, What (When is every list's). */
export const AUDIT_DROPDOWNS = { who: AUDIT_WHO, what: AUDIT_WHAT } as const;

export const AUDIT_LIST_COPY = {
  search: "Search",
  searchPlaceholder: "Entry number, account id or words",
  who: "Who",
  what: "What",
  when: "When",
  whoLabel: { anyone: "Anyone", you: "You", others: "Someone else", jonz: "Jonz itself" } satisfies Record<AuditWho, string>,
  whatLabel: { anything: "Anything", notices: "Notices", accounts: "Accounts" } satisfies Record<AuditWhat, string>,
  count: (count: string) => (count === "1" ? "1 entry" : `${count} entries`),
  noMatch: "Nothing matches",
  noMatchBody: "Try other words, or clear the filters.",
  clear: "Clear",
  likeThis: "Show more like this",
  byYou: "Everything you did",
  byThem: "Everything by someone else",
  byJonz: "Everything Jonz did by itself",
  ofKind: (what: string) => `Every entry about ${what.toLowerCase()}`,
  around: "Around this time",
  aroundMeta: "The list from five minutes after it, going back",
} as const;

/** What each What reads: the start of the entries' action. */
export const AUDIT_WHAT_ACTION: Record<AuditWhat, string | null> = { anything: null, notices: "notice.", accounts: "account." };

/**
 * The search box's words as the database's `or` filter: an entry number
 * finds that entry (and any account id starting with those digits); words
 * find an account id that starts with them, or a notice's title or a
 * reason that has them. Only letters, digits, spaces and @ . _ ' - are
 * kept, so nothing typed can change the filter itself. Null when there is
 * nothing to search for.
 */
export function auditSearchFilter(q: string): string | null {
  const words = q
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} @._'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  if (!words) return null;
  const like = (column: string, pattern: string) => `${column}.ilike."${pattern}"`;
  if (/^#?\d{1,15}$/.test(words)) {
    const id = words.replace("#", "");
    return [`id.eq.${id}`, like("target_id", `${id}*`)].join(",");
  }
  return [
    like("target_id", `${words}*`),
    like("reason", `*${words}*`),
    like("after->>title", `*${words}*`),
    like("before->>title", `*${words}*`),
  ].join(",");
}

/** A way from one entry to more like it: a label, what it sets, and the address it leads to. */
export interface LikeThis {
  label: string;
  meta: string;
  params: Record<string, string>;
}

/**
 * Show more like this, on an entry: everything by the same Who, everything
 * of the same What, and the list around its moment. Each is a whole query
 * (it clears the search), so it reads the same wherever it is opened from.
 */
export function auditLikeThis(entry: { actor: string | null; action: string; at: string }, ownerId: string | null): LikeThis[] {
  const who: AuditWho = entry.actor === null ? "jonz" : entry.actor === ownerId ? "you" : "others";
  const whoLabel = who === "you" ? AUDIT_LIST_COPY.byYou : who === "jonz" ? AUDIT_LIST_COPY.byJonz : AUDIT_LIST_COPY.byThem;
  const like: LikeThis[] = [{ label: whoLabel, meta: `${AUDIT_LIST_COPY.who}: ${AUDIT_LIST_COPY.whoLabel[who]}`, params: { who } }];
  const what = AUDIT_WHAT.find((kind) => AUDIT_WHAT_ACTION[kind] !== null && entry.action.startsWith(AUDIT_WHAT_ACTION[kind]!));
  if (what) {
    const label = AUDIT_LIST_COPY.whatLabel[what];
    like.push({ label: AUDIT_LIST_COPY.ofKind(label), meta: `${AUDIT_LIST_COPY.what}: ${label}`, params: { what } });
  }
  const from = new Date(Date.parse(entry.at) + 5 * 60_000).toISOString();
  like.push({ label: AUDIT_LIST_COPY.around, meta: AUDIT_LIST_COPY.aroundMeta, params: { from } });
  return like;
}
