# Multi-Tenant Outreach Infra (Email + SMS) — Design

**Status:** Approved
**Date:** 2026-08-05
**Scope:** Sub-project 1 of 2 (see "Related work" below for the UI redesign, tracked separately)

## Problem

Witech Lead is moving from a single-tenant internal tool to a sellable multi-tenant SaaS.
Two blockers stand in the way of that:

1. **Onboarding friction.** Today, sending email or SMS/WhatsApp campaigns requires each
   user to manually configure SMTP credentials and Twilio credentials in Settings. A
   paying customer signing up for an automated prospecting tool should not have to go
   set up an external mail server before they can send their first campaign.
2. **A multi-tenancy security bug found during this investigation.** The `settings`
   table (`backend/src/database/db.js`) is a single global key-value store, and the
   `/api/settings` endpoints (`backend/src/routes.js`) read/write it with no `user_id`
   scoping at all — only `authenticateUser` (any logged-in user) gates the route. Any
   authenticated user on any tenant can currently read and overwrite every other
   tenant's SMTP password and Twilio Auth Token. This must not ship to real customers.

This spec removes the SMTP/Twilio configuration UI entirely and replaces it with
platform-managed sending infrastructure, which fixes both problems by construction:
there is no longer any per-tenant secret for a user to see or overwrite.

## Constraints specific to this product

Witech Lead sends **cold B2B outreach** (unsolicited prospecting), not opt-in
newsletters. This matters for the design:

- Most general-purpose ESPs (SendGrid, Postmark, Mailgun) prohibit cold outreach in
  their AUP and will suspend accounts without warning once spam complaints appear.
- A single shared sending domain across all tenants means one tenant's bad sending
  behavior can tank deliverability for every other tenant simultaneously.
- WhatsApp Business sending requires per-number verification by Meta (not just
  Twilio), which cannot be automated or made instant — it is explicitly out of scope
  for this spec.

## Chosen approach

### Email: AWS SES + per-tenant subdomain isolation

- **Provider:** Amazon SES. Matches the project's existing AWS footprint (RDS, S3
  backups per `docs/step7_database_security.md`) and exposes a full API for
  programmatic domain/DKIM provisioning.
- **Domain:** `witechagency.com` is registered and hosted on Vercel (site + domain both
  live there). We do **not** touch the apex domain or migrate DNS. Instead we delegate
  only the `mail.witechagency.com` zone to Route53 via NS records added once in Vercel's
  DNS panel. All further automation happens inside that delegated zone via the AWS API,
  with zero risk to the live marketing site and zero further manual DNS steps.
- **Per-tenant isolation:** on signup (or first campaign send, whichever comes first),
  the backend provisions an SES domain identity for `{userId}.mail.witechagency.com`,
  pushing DKIM/SPF records into the delegated Route53 zone via the AWS SDK. DKIM
  verification typically completes within minutes. If a tenant's spam-complaint rate
  spikes, only that tenant's subdomain reputation is affected — other tenants are
  unaffected.
- **Send identity:** `From: "{user.name}" <no-reply@{userId}.mail.witechagency.com>`,
  `Reply-To: {user.email}`. Prospect replies land directly in the real customer's inbox.
  Nothing about this requires the customer to have a real mailbox on that subdomain —
  it exists purely for SPF/DKIM alignment and reputation isolation.
- **Bounce/complaint handling:** an SES event destination publishes to SNS, which hits
  a new backend webhook. Bounces/complaints are recorded, and a tenant whose complaint
  rate crosses a threshold has sending automatically paused (with an in-app notice)
  rather than silently damaging their subdomain's reputation further.
- **One-time platform setup (not per tenant):** request AWS SES production access
  (exit sandbox mode), documenting the B2B outreach use case in the request.

### SMS: shared Twilio account, alphanumeric Sender ID

- One platform-level Twilio account and a single alphanumeric Sender ID (e.g.
  `WITECH`), compliant with FR/EU one-way SMS sending rules. No per-tenant Twilio
  number, no recurring per-tenant cost.
- The existing `sender_phone` merge tag (`backend/src/services/emailService.js`,
  `compileTemplate`) is unchanged in behavior — it already inserts the campaign
  owner's phone number into the message body as a callback number, not as the Twilio
  "From". Only the source of the Twilio credentials moves (platform secret, not the
  `settings` table).
- **WhatsApp is explicitly deferred** to a post-launch v2, where a customer who wants
  it would go through a one-time manual "connect your WhatsApp Business number" flow.
  Not built as part of this spec.

### Platform secrets

AWS credentials, the SES configuration, and the shared Twilio credentials are stored
as platform-level secrets (Vault, consistent with the existing secure-backup
infrastructure), injected via environment/secret manager — never written to or
readable from the `settings` table or any user-facing API.

## Data model changes

- `users` gains columns to track domain provisioning state, e.g.
  `send_subdomain_status` (`pending` / `verified` / `failed`), and whatever SES
  identity metadata is needed to avoid re-provisioning on every send.
- The global `settings` table stops being used for `smtp_*` and `twilio_*` keys
  entirely. Whatever remains in it (e.g. `sender_signature` defaults) should be
  reassessed for whether it needs to move to a per-user table — out of scope to fully
  resolve here, but no new global-secret keys should be added to it going forward.
- A new table (or reuse of an existing log table) records SES bounce/complaint events
  per tenant for the suppression/pause logic above.

## Backend changes

- `backend/src/services/emailService.js`: replace the Nodemailer/`createTransport`
  SMTP path with an AWS SES SDK send call using the tenant's verified subdomain and
  the platform SES credentials. `runCampaignBackground`'s per-channel config
  validation (currently checking `settings.smtp_host` etc.) is replaced with a check
  that the tenant's subdomain is `verified` before allowing an email campaign to
  start.
- `backend/src/routes.js`: remove/replace the `/api/settings` SMTP+Twilio read/write
  behavior — those keys stop being accepted from client input. `/api/settings/test-smtp`
  is removed (nothing left for a user to test).
- New: a domain-provisioning service (SES domain identity creation + Route53 record
  push + status polling) and a bounce/complaint webhook route.

## Frontend changes (Settings.jsx)

Remove the "Configuration SMTP" and "Configuration Twilio" tabs/sections entirely.
Replace with a single "Prospection" section containing: sender display name
(pre-filled from account name), email signature, and phone number (already exists on
the user record, used for the `{{sender_phone}}` merge tag). Add explanatory copy:
*"Vos emails partent automatiquement depuis votre espace Wi'Tech Lead — les réponses
de vos prospects arrivent directement dans [compte email]."*

## Testing

- Unit: SES send call construction (From/Reply-To correctness), merge-tag compilation
  (unchanged, but re-verify after the transport swap).
- Integration: campaign run against a test/sandbox SES identity, verifying a campaign
  is blocked (with a clear error) if the tenant's subdomain isn't yet verified.
- Manual: end-to-end signup → domain auto-provisioning → first campaign send → reply
  lands in the real inbox, using a real SES sandbox recipient during development.

## Out of scope (this spec)

- WhatsApp automated onboarding (v2, manual connect flow).
- UI/visual redesign (separate spec, to be brainstormed next).
- Any broader redesign of the `settings` table beyond removing SMTP/Twilio keys from
  it.
- Per-tenant deliverability dashboard / analytics (nice-to-have, not required to fix
  the two blockers above).

## Related work

This is sub-project 1 of 2 identified during brainstorming. Sub-project 2 (general
SaaS-grade UI/UX redesign) will be brainstormed and specced separately once this
infra work is scoped into an implementation plan.
