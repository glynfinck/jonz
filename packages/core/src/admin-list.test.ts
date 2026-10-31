import { describe, expect, it } from "vitest";

import {
  auditLikeThis,
  auditSearchFilter,
  listCount,
  listQueryFromParams,
  listQueryIsSet,
  listQueryToParams,
  listTime,
  listWindow,
} from "./admin-list";

const NOW = new Date("2026-10-30T16:44:00Z");
const ZONE = "Europe/London";
const AUDIT = { who: ["anyone", "you", "owners", "people", "jonz"], what: ["anything", "notices", "accounts"] };

describe("a busy list's window", () => {
  it("reads the last hour, 7 and 30 days back from now", () => {
    expect(listWindow({ when: "hour", from: null }, NOW, ZONE)).toEqual({ after: "2026-10-30T15:44:00.000Z", before: null });
    expect(listWindow({ when: "week", from: null }, NOW, ZONE).after).toBe("2026-10-23T16:44:00.000Z");
    expect(listWindow({ when: "month", from: null }, NOW, ZONE).after).toBe("2026-09-30T16:44:00.000Z");
  });

  it("starts Today at midnight where you are, not in UTC", () => {
    expect(listWindow({ when: "today", from: null }, NOW, ZONE).after).toBe("2026-10-30T00:00:00.000Z");
    expect(listWindow({ when: "today", from: null }, NOW, "America/Vancouver").after).toBe("2026-10-30T07:00:00.000Z");
  });

  it("has no limit for Any time", () => {
    expect(listWindow({ when: "any", from: null }, NOW, ZONE)).toEqual({ after: null, before: null });
  });

  it("starts from a moment and reads back from it, past the day it's on", () => {
    expect(listWindow({ when: "today", from: "2026-10-29T23:30:00.000Z" }, NOW, ZONE)).toEqual({
      after: null,
      before: "2026-10-29T23:30:00.000Z",
    });
  });
});

describe("a row's time, with no day headings", () => {
  it("is the time with seconds today", () => {
    expect(listTime("2026-10-30T16:41:07Z", NOW, ZONE)).toBe("16:41:07");
  });

  it("drops the seconds where they won't fit", () => {
    expect(listTime("2026-10-30T16:41:07Z", NOW, ZONE, false)).toBe("16:41");
  });

  it("carries the date before today", () => {
    expect(listTime("2026-10-29T23:58:12Z", NOW, ZONE)).toBe("Thu 29 Oct, 23:58");
  });

  it("decides today in your zone", () => {
    // 05:00 UTC on the 30th is still the 29th in Vancouver.
    expect(listTime("2026-10-30T05:00:00Z", NOW, "America/Vancouver")).toBe("Thu 29 Oct, 22:00");
  });
});

describe("a busy list's address", () => {
  it("reads what the page offers and keeps it", () => {
    const query = listQueryFromParams({ q: "elm", who: "you", what: "notices", when: "today" }, AUDIT);
    expect(query).toEqual({ q: "elm", picks: { who: "you", what: "notices" }, when: "today", from: null });
    expect(listQueryToParams(query)).toEqual({ q: "elm", who: "you", what: "notices", when: "today" });
  });

  it("falls back to the first choice for anything it doesn't offer, so an old link still opens", () => {
    const query = listQueryFromParams({ who: "everyone", what: ["accounts", "x"], when: "fortnight", from: "soon" }, AUDIT);
    expect(query).toEqual({ q: "", picks: { what: "accounts" }, when: "any", from: null });
  });

  it("keeps a plain list's address plain", () => {
    const query = listQueryFromParams({}, AUDIT, "today");
    expect(listQueryToParams(query, "today")).toEqual({});
    expect(listQueryIsSet(query, "today")).toBe(false);
    expect(listQueryIsSet({ ...query, q: "  " }, "today")).toBe(false);
    expect(listQueryIsSet({ ...query, when: "week" }, "today")).toBe(true);
  });

  it("writes a moment instead of When when the list starts from one", () => {
    const query = listQueryFromParams({ from: "2026-10-29T23:30:00Z", when: "week" }, AUDIT);
    expect(listQueryToParams(query)).toEqual({ from: "2026-10-29T23:30:00.000Z" });
  });

  it("caps a pasted search at 200 letters", () => {
    expect(listQueryFromParams({ q: "x".repeat(500) }, AUDIT).q).toHaveLength(200);
  });
});

describe("a busy list's count", () => {
  it("is exact up to ten thousand and rounded past it", () => {
    expect(listCount(2481, true)).toBe("2,481");
    expect(listCount(9999, false)).toBe("9,999");
    expect(listCount(48_213, false)).toBe("about 48,000");
    expect(listCount(48_213, true)).toBe("48,213");
  });
});

describe("the audit log's search", () => {
  it("finds an entry by its number, with or without #", () => {
    expect(auditSearchFilter("418213")).toBe('id.eq.418213,target_id.ilike."418213*"');
    expect(auditSearchFilter(" #42 ")).toBe('id.eq.42,target_id.ilike."42*"');
  });

  it("finds words in an account id, a notice's title or a reason", () => {
    expect(auditSearchFilter("jonz is slow")).toBe(
      'target_id.ilike."jonz is slow*",reason.ilike."*jonz is slow*",after->>title.ilike."*jonz is slow*",before->>title.ilike."*jonz is slow*"',
    );
  });

  it("drops anything that could change the filter itself", () => {
    expect(auditSearchFilter('a"),id.gt.(0')).toBe(
      'target_id.ilike."a id.gt. 0*",reason.ilike."*a id.gt. 0*",after->>title.ilike."*a id.gt. 0*",before->>title.ilike."*a id.gt. 0*"',
    );
    expect(auditSearchFilter("100% * _x")).toContain('"*100 _x*"');
  });

  it("searches nothing for nothing", () => {
    expect(auditSearchFilter("   ")).toBeNull();
    expect(auditSearchFilter("()*,")).toBeNull();
  });
});

describe("Show more like this, on an entry", () => {
  const at = "2026-10-30T16:41:07.000Z";

  it("offers everything by the same Who, of the same What, and around its moment", () => {
    expect(auditLikeThis({ actor: "owner-1", action: "notice.save", at }, "owner-1")).toEqual([
      { label: "Everything you did", meta: "Who: You", params: { who: "you" } },
      { label: "Every entry about notices", meta: "What: Notices", params: { what: "notices" } },
      { label: "Around this time", meta: "The list from five minutes after it, going back", params: { from: "2026-10-30T16:46:07.000Z" } },
    ]);
  });

  it("names who did it as the drop-down does", () => {
    expect(auditLikeThis({ actor: null, action: "account.delete_done", at }, "owner-1")[0].params).toEqual({ who: "jonz" });
    expect(auditLikeThis({ actor: "someone", action: "account.delete_request", at }, "owner-1")[0].params).toEqual({ who: "others" });
  });

  it("leaves What out for a kind the drop-down doesn't have", () => {
    expect(auditLikeThis({ actor: null, action: "house.open", at }, null).map((like) => like.label)).toEqual([
      "Everything Jonz did by itself",
      "Around this time",
    ]);
  });
});
