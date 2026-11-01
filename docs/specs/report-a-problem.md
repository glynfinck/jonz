# Report a problem

## What it does

Anyone signed in can tell Jonz about a problem, send an idea or ask a
question from inside the app, without GitHub or an email app. The owner
answers from the admin Inbox. Glyn picked option A on 31 October 2026, from
the options page (https://claude.ai/artifact/9MRXJf6wot9i58tDLEydh6).

It comes in three steps. This file describes step 1; the others are below
under "Later".

## In the app

- **Help on House**, between You and Leave: Report a problem, Send an idea,
  and Your reports (with "A reply to read" and a count when one is waiting).
  Under it, "Or email support@jonz.app."
- **The sheet**: Problem, Idea or Question; what happened (up to 2,000
  letters); up to three screenshots from the photo library, shrunk to 1600px
  JPEGs; and "Send the details that help", ticked, listing exactly what goes:
  - the last two pages they were on ("Today, then House", no ids or codes),
  - the app or browser ("Jonz on the web, Safari 18, iPhone"),
  - their house's name,
  - the last error the app showed (from React Query's caches).
  Unticking it sends none of them. One amber button sends; then the report
  opens under Your reports.
- **Your reports**: newest first, each with its state as the sender sees it
  (Sent, Read, Replied, Fixed) or a badge when a reply is unread. Opening one
  shows the conversation in the setup chat's look and marks replies read; a
  box at the bottom writes back.

## The Inbox

- **First admin page.** `/admin` opens on it. It is a busy list
  (`docs/specs/owner-admin.md`): one search box (name, email, house, words or
  an id's start), State (Waiting by default: new or open; New; Replied;
  Fixed; Any) and Kind, When as "Sent", 50 at a time, newest first.
- **One report**: beside the list on a laptop, a page of its own on a phone.
  Who sent it, their house, role and email; the conversation with
  screenshots; the details; a reply box; Mark fixed (or Open it again).
  Opening a new one marks it read (open), which its sender sees as Read.
- **States**: new (nobody at Jonz has read it, or its sender wrote back),
  open (read, not answered), replied, fixed.

## Telling the other side

`apps/api` sends, writes back and replies (`lib/moves/reports.ts`), each
after the caller's own database call:

- `POST /api/reports`: every owner gets a push, "Ava sent a problem".
- `POST /api/reports/:id/messages`: the sender writes back; every owner gets
  "Ava wrote back".
- `POST /api/reports/:id/reply`: the owner replies; the sender gets a push,
  "Glyn at Jonz replied", and an email (`reportReplyEmail`) whose reply goes
  to support@jonz.app.

These pushes are kind `support`: no switch turns them off (they answer
something you asked), and quiet hours still make them silent.

## Safety

- Only signed-in people can send; five reports a day each, and twenty
  write-backs.
- Screenshots go to the private `report-shots` bucket, in the sender's own
  folder; `send_report` checks each path is theirs and uploaded. Only the
  sender and the owner (with their code) can open them, through links that
  expire after an hour. The bucket takes JPEGs up to 5 MB.
- The owner reads through owner-only functions that check `is_owner()`
  (second factor this session). Every reply, fix and reopen goes in the
  audit log, with the reply's words.
- Deleting an account clears its reports' screenshots (`finish_account_deletion`
  and the API's folder removal); the Inbox then shows "Someone who left", no
  email, and has nobody to reply to.
- The Privacy Policy has a "Reports, ideas and questions" section.

## The data

`supabase/migrations/20261112090000_reports.sql`: `reports`,
`report_messages`, the `report-shots` bucket, `send_report`, `my_reports`,
`see_report`, `write_back`, `owner_reports_find` / `_page` / `_count`,
`owner_open_report`, `owner_reply_report`, `owner_set_report_state`.

## Later

- **Step 2, email both ways**: mail to support@jonz.app becomes a report in
  the Inbox (Resend inbound), a From filter (app or email), a public
  jonz.app/help, and moving the README and CONTRIBUTING off
  Gmail and GitHub issues.
- **Step 3**: "Tell us what happened" on the crash screen, "Same as…" to fold
  duplicates together, and telling everyone who reported it when it's fixed.
- After that: the support agent (owner admin PR 5), Ask Jonz filing a report,
  shake to report in the phone apps, and automatic crash reports.
