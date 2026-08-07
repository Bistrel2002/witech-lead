# Unsubscribe / Opt-Out — Design

**Status:** Approved
**Date:** 2026-08-06
**Depends on:** `2026-08-05-multitenant-outreach-infra-design.md` (branch `feat/managed-outreach`)

## Problem

Witech Lead sends cold B2B prospecting email and has **no opt-out mechanism of any
kind** — no unsubscribe link, no `List-Unsubscribe` header, no suppression list.
A grep of `backend/src` and `frontend/src` for `unsubscribe|désabonn|opt-out`
returns nothing.

This blocks two things:

1. **AWS SES production access.** The request form asks, as a mandatory field, how
   recipients opt out. Without a real answer the request is rejected; answering
   falsely risks account termination, since AWS samples live sends. Until
   production access is granted the platform is capped at 200 messages/day to
   pre-verified addresses — it cannot contact a single real prospect.
2. **CNIL / GDPR compliance.** For B2B cold outreach conducted under *intérêt
   légitime*, French guidance requires an opt-out in every message. The project's
   own `docs/architecture_and_security_report.md` claims GDPR compliance; that
   claim is currently not backed by the code.

Separately, Gmail and Outlook now require `List-Unsubscribe` and
`List-Unsubscribe-Post` from bulk senders — absent headers hurt deliverability
regardless of the legal question.

## Scope

Email only. SMS and WhatsApp are explicitly out of scope: the project owner
decided on 2026-08-06 to launch email-only, after the discovery that an
alphanumeric Twilio Sender ID is one-way and therefore cannot receive the `STOP`
replies French law requires for marketing SMS.

## Suppression model

Suppression is **per-tenant for voluntary unsubscribes, global for spam
complaints**. The same scraped business email frequently exists as a `leads` row
for several tenants, so scope matters.

- **Voluntary unsubscribe** — the recipient is opting out of a specific sender,
  not of the platform. Recorded against that tenant's `user_id`; other tenants are
  unaffected. This is the legally correct reading.
- **Spam complaint** (arriving through the existing SES→SNS webhook) — recorded
  with `user_id = NULL`, meaning global. An address that generates complaints
  endangers the reputation of the shared sending infrastructure, so no tenant may
  contact it.

### Table

```
unsubscribes (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,  -- NULL = global
  email       VARCHAR(255) NOT NULL,
  source      VARCHAR(20)  NOT NULL,   -- 'manual' | 'complaint'
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

Email is stored normalised (trimmed, lowercased) so lookups cannot be defeated by
case. The suppression check is a single query asking whether a row exists for this
email with either the sending tenant's `user_id` or `user_id IS NULL`.

## Token design

The unsubscribe token is an **HMAC**, not a stored value:

```
token = base64url( HMAC-SHA256(secret, `${user_id}:${normalised_email}`) )
```

plus the `user_id` and email encoded alongside it so the route can verify without
a lookup. Rationale:

- No new column, no token table, no migration risk.
- Unguessable and non-enumerable — a tenant's leads cannot be discovered by
  incrementing an ID.
- Deterministic and permanently valid: a recipient who finds an old email months
  later can still unsubscribe, which is exactly what the regulation intends.

The secret is a new platform config value, following the pattern already
established by `SES_WEBHOOK_TOKEN` in `backend/src/config/platformConfig.js`.

## Routes

Two public, unauthenticated routes, mounted **before** `authenticateUser` in
`backend/src/index.js` — the same placement and reasoning as the existing SES
webhook, since a recipient has no session.

- `GET /unsubscribe/:token` — renders a small self-contained HTML page (French)
  naming the sender and offering a confirmation button. Renders only; changes
  nothing.
- `POST /unsubscribe/:token` — performs the unsubscribe, then renders a
  confirmation page. Also serves the one-click `List-Unsubscribe-Post` flow.

The page is served **by the backend**, not the React frontend, because: it must
work even when the Vercel frontend is down; the frontend is a SPA with no router
and adding a public unauthenticated route to it is awkward; and it must stay
reachable independently of any deploy of the customer-facing app.

Splitting GET (renders) from POST (acts) is deliberate: corporate mail scanners
and antivirus products routinely follow links in email, and a `GET` that
unsubscribed would produce phantom opt-outs.

Both routes are idempotent — unsubscribing twice is a success, not an error.

## Headers

Every campaign email gains:

```
List-Unsubscribe: <https://<api-host>/unsubscribe/TOKEN>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

**Verified against the installed SDK** (`@aws-sdk/client-sesv2@3.1103.0`): the
`Simple` message shape supports a `Headers` field of type `MessageHeader[]`, where
`MessageHeader` is `{ Name: string, Value: string }`. So `buildEmailPayload` keeps
its current `Content.Simple` structure and simply gains:

```js
Content: {
  Simple: {
    Subject: { … },
    Body: { … },
    Headers: [
      { Name: 'List-Unsubscribe', Value: `<${unsubscribeUrl}>` },
      { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' }
    ]
  }
}
```

No raw-MIME construction is required. The existing `buildEmailPayload` tests must
continue to assert `From`/`Reply-To` correctness unchanged.

## Body

Emails remain **plain text** (`Body: { Text: … }`). For cold outreach this is an
asset, not a limitation — plain text reads as a personal message rather than a
marketing blast, and HTML would hurt both deliverability and tone.

A `{{unsubscribe_link}}` merge tag becomes available in templates, compiled by
`compileTemplate` alongside the existing tags.

**If a template does not contain the tag, the link is appended automatically** to
the compiled body before sending, under a short French line. This is the important
safety property: no tenant can send a non-compliant email, even by editing a
template carelessly or writing one from scratch.

## Send path

`runCampaignBackground` checks the suppression list before each send. A suppressed
prospect is logged as `Skipped`, not `Failed` — it is a correct outcome, not an
error, and conflating the two would corrupt the campaign failure metrics that feed
the operator's view of tenant health.

## Complaint integration

The existing SES webhook (`backend/src/routes/sesWebhookRoutes.js`) already
records `Complaint` events into `sending_events` and auto-pauses tenants over
threshold. It gains one additional action: insert a global (`user_id = NULL`)
`unsubscribes` row for the complaining recipient, so that no tenant contacts that
address again.

## Testing

- Unit: token generation/verification round-trip; a tampered token is rejected;
  email normalisation; suppression-check scoping (tenant row hits only that
  tenant, global row hits everyone).
- Unit: `compileTemplate` substitutes the tag; the auto-append fires when the tag
  is absent and does not double-append when present.
- Route: `GET` renders without mutating; `POST` suppresses; replay is idempotent;
  an invalid token yields a French error page, not a stack trace.
- Send path: a suppressed prospect is skipped and logged `Skipped`.
- Webhook: a complaint writes a global suppression row.

## Out of scope

- Any SMS or WhatsApp opt-out (`STOP` handling). Email-only launch.
- A tenant-facing UI listing their unsubscribes. The data is recorded correctly;
  surfacing it is a later feature.
- Re-subscribe. A recipient who opts out stays opted out; there is no legitimate
  cold-outreach reason to offer re-subscription, and building one invites misuse.
- Import of any pre-existing suppression list. There is none.
