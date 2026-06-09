# Step 3: Playwright Python Scraper Specification

This document outlines the architecture, data extraction algorithms, pros/cons, and security practices of the Python-based Google Maps Scraper and Website Auditor.

---

## 1. Requirement Overview
The user requested replacing the manual scraping process (which required copy-pasting Google Maps links) with an automated search system:
- Input: Category of business and French City filters.
- Automation: The app constructs search query links and scrapes the listings automatically (default radius 10km).
- Dual Engine: Choose between direct Google Maps live scraping and querying our offline 2GB+ French Business Database.
- Campaign Injector: Option to load scraped leads directly into outreach campaigns without inserting them into the main CRM leads list.
- Python transition: The scraper must run in Python.

---

## 2. Technical Architecture & Data Flow

```
[React Frontend] --(Submit: Category, City, Campaign Option)--> [Express Backend]
                                                                        |
                                                    (Spawn Child Process with Safe Arguments)
                                                                        v
+---------------------------------------------------------------------------------------+
| Python Playwright Scraping Sandbox                                                    |
|                                                                                       |
|  1. Launches Headless Chromium via Playwright                                         |
|  2. Bypasses Google Cookie Consent Popups                                             |
|  3. Scrolls div[role="feed"] to load listings (caps at 40 to avoid rate limits)      |
|  4. Resolves Details (Name, Phone, Address, Reviews, Website URL)                     |
|                                                                                       |
|  IF Website URL exists -> Launch Digital Audit:                                       |
|    - SSL check (HTTPS redirection test)                                               |
|    - Mobile Friendliness (Viewport check)                                             |
|    - Email Extraction (Mailto & regex sweep)                                          |
|    - Social profiles (FB, Instagram, LinkedIn, Twitter)                               |
|    - Chat widget detection (Crisp, Intercom, Tawk, Drift, HubSpot, Calendly)          |
|    - Tech stack detection (WordPress, Wix, Squarespace, Shopify, Webflow)             |
|                                                                                       |
|  5. Returns audited leads as a clean JSON stream to Stdout                            |
+---------------------------------------------------------------------------------------+
                                                                        |
                                                     (JSON Parser & Routing Rules)
                                                                        v
                             +------------------------------------------+------------------------------------------+
                             |                                                                                     |
                   [Route A: Default]                                                                    [Route B: Direct Campaign]
             Insert into CRM Leads Database                                                         Inject into active Campaign Queue
```

---

## 3. Playwright Sync API vs. Puppeteer Node
We migrated the headless crawler to **Python Playwright** (`scraper.py`) wrapped inside Node's child process manager (`scraperService.js`).

### Rationale: Pros & Cons

| Scraper Runtime | Pros | Cons | Decision |
| :--- | :--- | :--- | :--- |
| **Python Playwright & BeautifulSoup4** | **Unblocks Event Loop**: Running as a subprocess keeps the main Express API free to serve other requests. **Rich Ecosystem**: Python libraries (BeautifulSoup, requests) parse data, emails, and social channels with much greater ease. Playwright's locator engines are highly resilient against selector changes. | Spawning a subprocess takes around 15–30 seconds to launch the browser and crawl details. | **Selected**. |
| **Node Puppeteer** | Native JS execution; no need to configure Python virtual environments. | Heavy scraping runs can block the Node.js single-threaded event loop, freezing the entire API for other users. | **Rejected** due to performance risks. |

---

## 4. Web Auditing & Scraping Algorithm Details

### A. Cookie Consent Bypass
Google Maps displays varying consent walls depending on the regional IP. The scraper queries multiple known French and English consent targets (`Tout accepter`, `Tout autoriser`, `Accept all`, `Accepter`) and clicks the visible targets to proceed.

### B. Scrolling Feed Selector
To trigger Google's lazy loading of results, the scraper locates the scrollable left feed container (`div[role="feed"]`) and executes scroll scripts.
- To prevent infinite loops or memory leaks, scrolling is stopped once 40 listings are collected.

### C. The Website Auditor
For each lead that has a website:
1.  **SSL Test**: Verifies if the target URL resolves successfully using `https://`.
2.  **Mobile Friendly Check**: Inspects the HTML headers for `<meta name="viewport" content="width=device-width">`. Lacking this tag is a major sales opportunity (the client needs a modern responsive design).
3.  **Email Scraper**: Combines:
    - Scans for `a[href^="mailto:"]` anchors.
    - Uses regular expression scans over the text nodes to capture unlinked emails, while ignoring image/CSS/JS file suffixes.
4.  **Social Channels Tracker**: Analyzes anchor URLs to detect Facebook, Instagram, LinkedIn, and Twitter profile handles.
5.  **Chat Widget Scan**: Inspects script tags and text patterns for popular chat/scheduling tools (Crisp, Intercom, Tawk, Calendly, Drift, HubSpot).
6.  **Tech Stack Fingerprint**: Searches for site generator meta-tags to categorize the client's platform (WordPress, Wix, Squarespace, Shopify, Webflow).

---

## 5. Security Implications

*   **Subprocess Shell Injection**: Passing user input directly into shell execution is highly dangerous.
    - *Mitigation*: We do **not** run the process through a shell interpreter (`shell: false`). The script path and arguments (`--category`, `--city`, `--radius`) are sent as an isolated array of strings directly to the Python executable.
*   **Server Side Request Forgery (SSRF) / Infinite Crawl Hangs**: Auditing external websites forces the server to make outbound connections, which could be exploited or hang.
    - *Mitigation*: We enforce a tight 5-second connection timeout (`timeout=5`) and limit requests to the homepage and 3 key subpages (e.g. contact/legal/about).
*   **Crawler Rate Limiting & Captchas**: Excessive queries on Google Maps will trigger captchas.
    - *Mitigation*: Playwright simulates human scroll timings (`page.wait_for_timeout(1500)`). In the event of persistent captchas, the UI provides a seamless toggle to fallback to the offline national French database.

---

## 6. Client-Facing Talking Points (How to explain to a client)
> "We don't just find names and phone numbers; we audit your leads automatically:
> - **Digital Gap Assessment**: Our scraper checks if a lead's website has security SSL certificates, is mobile-friendly, or has live chat. If a business lacks these, your salespeople have immediate, high-value conversation starters.
> - **Zero Database Clutter**: If you are testing a new niche, you can route prospects directly to an email sequence without cluttering your core client directory database."
