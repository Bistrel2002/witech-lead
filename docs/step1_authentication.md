# Step 1: Authentication & Session Management Specification

This document provides a detailed breakdown of the technical decisions, architecture, and security implications of the modern CRM authentication system.

---

## 1. Requirement Overview
The objective was to transition the Witech Lead application from a simple lead list into a secure, business-oriented SaaS platform. This required:
- Secure login and registration.
- Google & Apple OAuth authentication integrations.
- Persistent sessions so users don't have to re-enter credentials constantly.
- Separation of administrative and team workspaces.

---

## 2. Technical Architecture & Decisions

### Session Mechanism: JWT HttpOnly Cookies
We chose **Stateless JSON Web Tokens (JWT)** combined with **HttpOnly cookies** for session management.

*   **Token Creation**: Upon successful login or registration, the server signs a JWT containing the user's ID, email, name, and role.
*   **Token Transmission**: The token is written to the client's browser using the HTTP response header `Set-Cookie`.
*   **Token Verification**: For protected API routes, an Express middleware (`authenticateUser`) extracts the token from incoming cookies, validates the cryptographic signature using `JWT_SECRET`, and attaches the user payload to `req.user`.

```
[React Frontend] --(Credentials / OAuth Auth)--> [Express Backend]
   [React Frontend] <-- (Set-Cookie: auth_token) -- [Express Backend]
   [React Frontend] --(Request with Cookie automatically sent)--> [Express Backend]
```

### Password Hashing: bcryptjs
Plaintext passwords must never be stored. We use `bcryptjs` to hash credentials:
- **Salt Generation**: A cryptographic salt (10 rounds) is generated for each password.
- **Hashing**: The password and salt are hashed together. The workload factor (10) balances hashing speed with resistance to brute-force attacks.

### Third-Party Identity Providers: Google & Apple OAuth
To facilitate fast onboarding, we integrated Google and Apple OAuth redirect flows.
- **Mock Bypass for Dev Mode**: A boolean environment variable (`VITE_MOCK_AUTH=true`) allows developers and test suites to bypass external redirection. Clicking the button issues a valid JWT for a demo user.
- **Production Integration**: In production, the backend redirects the user to Google/Apple authorization servers, receives the callback code, exchanges it for user profiles, and completes the login process.

### Hidden Portals & Portal Session Gates
The **Admin Panel** (`/portal/admin-panel`) and **Team Space** (`/portal/team-space`) are intentionally obfuscated.
- **Hidden Routes**: No links to these routes exist on the standard sidebar.
- **Password-Gated Portals**: Navigating to these paths displays a customized dark login overlay requiring portal-specific passwords (`ADMIN_PORTAL_PASSWORD` / `TEAM_PORTAL_PASSWORD`).
- **Portal Tokens**: Successful verification issues a short-lived (8 hours) portal cookie (`admin_portal_token` or `team_portal_token`) separate from the main user session token.

---

## 3. Decision Rationale: Pros & Cons

### Session Storage Strategy: HttpOnly Cookies vs. LocalStorage

| Storage Method | Pros | Cons | Decision |
| :--- | :--- | :--- | :--- |
| **HttpOnly Cookies** | **XSS Immunity**: Scripts running in the browser cannot read the token (prevents session hijacking via malicious JS injection). | **CSRF Vulnerability**: Browsers automatically attach cookies to requests, which can be abused in cross-site requests. | **Selected** (With CSRF Mitigations). |
| **LocalStorage** | **CSRF Immunity**: JavaScript must manually read the token and attach it to authorization headers. | **Vulnerable to XSS**: If any third-party library is compromised (supply chain attack), the token can be stolen. | **Rejected** due to high risk of script injection. |

#### CSRF Mitigation Detail
To neutralize CSRF risks associated with cookies, we enforce these cookie attributes:
- `httpOnly: true` (Blocks JS access).
- `secure: true` (Only transmitted over HTTPS in production).
- `sameSite: 'lax'` (Restricts the browser from sending cookies on cross-origin requests, blocking CSRF attacks).

---

## 4. Security & Vulnerability Analysis

1.  **Replay Attacks**: A stolen JWT could allow an attacker to impersonate the user.
    - *Mitigation*: Tokens expire after 7 days for normal users and 8 hours for portals. Admin cookies are strictly revoked upon portal exit.
2.  **Dev-Mode Bypass Leaks**: If the mock OAuth bypass is enabled in production, anybody can access user dashboards.
    - *Mitigation*: The middleware strictly checks `process.env.VITE_MOCK_AUTH === 'true'`. The production deployment pipeline overrides this environment variable to `false`.
3.  **Brute-Force Attacks on Portals**: Attackers might attempt to guess portal passwords.
    - *Mitigation*: Portal passwords should be set to long, high-entropy strings in the production `.env`. Additionally, server-side rate-limiting blocks repeated attempts on `/api/auth/verify-portal`.

---

## 5. Client-Facing Talking Points (How to explain to a client)
> "We protect your CRM accounts with the same security measures used by enterprise software and banks:
> - **Invisible Session Keys**: Your login tokens are locked in a digital vault inside the browser that hacker scripts cannot read.
> - **Salted Passwords**: We never store actual passwords. If our database were ever compromised, passwords cannot be deciphered.
> - **Double-Lock Portals**: Access to administrative configuration options requires a secondary security key and uses temporary session tokens that expire after a workday."
