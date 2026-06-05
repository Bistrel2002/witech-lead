# Product Requirement Document (PRD): Wi'Tech Maps Prospector (Revised)
**Project Phase:** Alpha Design & Architecture Specification  
**Target User/Owner:** Wi'Tech Agency (Web Design & Automation Sector)
**Document Format:** Comprehensive System Specification (`.md`)

---

## 1. Executive Summary & Strategic Value Proposition

### 1.1 Problem Statement
Wi'Tech Agency faces a classic B2B agency bottleneck: **unpredictable client acquisition pipelines (Prospection)**. Sourcing local small-to-medium businesses (SMBs) and independent workers manually via Google Maps is labor-intensive. Furthermore, moving data from Maps to spreadsheets, vetting their digital presence, and executing outreach manually creates a disjointed workflow that stalls agency growth.

### 1.2 Proposed Solution
The **Wi'Tech Maps Prospector** is an all-in-one proprietary full-stack web application designed to turn local extraction into immediate inbound opportunities. By inputting geographical target zones and industry keywords, the platform programmatically extracts business profiles from Google Maps. 

Instead of just storing this data, the app immediately runs a **digital audit** (detecting websites, emails, and automation gaps), indexes them into an intuitive dashboard, and enables **one-click mass outreach campaigns segmented by precise business categories** (e.g., blasting an email/message to all "plumbers", "carpenters", or "solo-entrepreneurs" simultaneously).

### 1.3 Core Agency Value Metrics
*   **Web Design Leads:** Instantly isolates businesses missing websites or running unoptimized mobile landing pages.
*   **Automation Leads:** Targets high-earning businesses lacking instant response widgets, contact forms, or automated booking flows.
*   **Outreach Efficiency:** Eliminates manual emailing. A single agent can pitch an entire regional industry sector in under 5 minutes.

---

## 2. Platform Architecture & Technical Stack

The architecture must support concurrent client-side web scraping alongside heavy outbound mail/message delivery queuing.

### 2.1 Technology Stack Selection
*   **Frontend:** **Next.js 14 (App Router)** + **Tailwind CSS** + **Shadcn/ui**.
*   **Backend:** **Node.js (TypeScript) with Fastify** to handle high-throughput asynchronous operations and webhook ingestion.
*   **Task Queue:** **Redis** + **BullMQ**. *Critical modification:* Dual-queue structure. `Queue A` handles background scraping tasks; `Queue B` manages throttled outbound communication campaigns to prevent spam blocks.
*   **Database:** **PostgreSQL** with **Prisma ORM**. Schema expanded to include `Campaigns`, `Templates`, and `OutreachLogs` mapped relations.
*   **Communication Providers:** Integration with specialized transactional/marketing systems like **Resend API**, **SendGrid**, or a custom authenticated **SMTP/IMAP node** for personalized cold mailing.

---

## 3. Deep Dive: Google Maps Extraction & Categorization Engine

### 3.1 Scraping Execution Workflow
1.  **Search Vector Injection:** The engine processes specialized local search strings.
2.  **Viewport DOM Scrolling & Entity Parsing:** Programmatically loads businesses from the Maps sidebar container, clicking each to parse vital metadata fields: Name, Rating, Address, Phone, Website URL, and **Google Category Tags** (e.g., *Plombier*, *Menuisier*).
3.  **Entity Classification Engine:** Because keywords overlap, an internal micro-classifier parses the primary Google Maps label to group targets cleanly into core business categories:
    *   `Category Tag` -> Artisan / Trade (Plumber, Carpenter, Electrician)
    *   `Category Tag` -> Corporate / Agency (Real Estate, Consulting)
    *   `Category Tag` -> Solo-Entrepreneur / Independent (Photographer, Coach)

### 3.2 Digital Maturity Enrichment Engine
Once scraped, the lead profile undergoes automated verification:
*   **Website Analysis:** Checks if a domain exists. If yes, it pings the header to evaluate loading speed, SSL status, and mobile responsiveness.
*   **Contact Sourcing:** Scrapes the target website's layout for public professional emails (`contact@...`, `info@...`), social handles, and contact page structures.
*   **Automation Deficit Audit:** Flags the absence of meta tags, modern analytics tracking, chat platforms, or client booking widgets.

---

## 4. Dashboard Features & System Requirements

The web application's dashboard is optimized around two activities: **Data Analysis** and **Mass Communication**.

### 4.1 Search & Extraction Panel
*   Interactive geographic bounding boxes to define search horizons.
*   Real-time processing logs tracking scraping depth and email extraction rates.

### 4.2 Lead Management & Analytics CRM
*   **Intuitive Category Grouping:** Tabs or fast-filter pills to view all plumbers, all carpenters, or all solo-entrepreneurs with a single click.
*   **Vulnerability Metric Flags:** Sort leads dynamically by their structural weaknesses: `Has No Website`, `Has Outdated Stack`, `Has Zero Automation`.

### 4.3 Integrated Bulk Outreach Module
*   **Dynamic Template Editor:** Supports custom markdown or rich-text templates using conditional placeholders:
    *   `{{business_name}}` -> *Dupuis Plomberie*
    *   `{{city}}` -> *Nantes*
    *   `{{audit_finding}}` -> *"votre entreprise n'a pas de site web connecté à votre fiche"* or *"votre site internet n'est pas optimisé pour les smartphones"*
*   **One-Click Batch Execution:** Select an entire category cluster, attach an outreach template, and hit send.
*   **Throttled Campaign Delivery Worker:** Automatically staggers outbound emails (e.g., 1 email every 45–90 seconds per connected sender account) to completely protect your agency's domain authority from being flagged as a spam vector.
*   **Outreach Tracker:** Displays open rates, link clicks, and reply loops directly inside the prospect's dashboard card.

---

## 5. Legal Compliance & Data Integrity (GDPR Context)

### 5.1 B2B Cold Outreach Compliance
*   **Legitimate Interest Frame:** In accordance with France’s CNIL regulations and GDPR Article 6(1)(f), cold emailing prospective business units (B2B) without explicit opt-in is authorized, provided the message explicitly targets their professional activity and offers a clear, immediate link to opt out (*Lien de désinscription*).
*   **Automatic Suppression Lists:** If a business opts out or replies negatively, their profile is instantly blacklisted from all future extraction lists and outreach actions.

---

## 6. Technical Implementation Roadmap


Conversation avec Gemini
Actually I have a buisness, we operate on web design and automation, but the main issue is at the level of prospection, it is difficult to get client, so I want to create a web app, with a dashboard and that will help me scrap all the buisness in a predefine zone on Google Maps. 



Here is the website of my buisness: https://www.witechagency.com



I want to tailor my idea, and I want you to deep in the research, and finally create an MD file

              ┌──────────────────────────────────────────────┐
              │              React / Next.js UI              │
              │             (Tailwind CSS Dashboard)         │
              └──────────────────────┬───────────────────────┘
                                     │ Rest API / WebSockets
                                     ▼
              ┌──────────────────────────────────────────────┐
              │           Node.js / Fastify Backend          │
              └──────┬──────────────────────┬────────────────┘
                     │                      │
                     ▼                      ▼
       ┌───────────────────────────┐  ┌───────────────────────────┐
       │     PostgreSQL / Prisma   │  │   Redis / BullMQ Queue    │
       │  (User & Lead Persistence)│  │ (Scraping Task Management)│
       └───────────────────────────┘  └─────────────┬─────────────┘
                                                    │
                                                    ▼
                                      ┌───────────────────────────┐
                                      │ Playwright / Puppeteer    │
                                      │ Scraping Cluster Worker   │
                                      └─────────────┬─────────────┘
                                                    │
                                                    ▼
                                      ┌───────────────────────────┐
                                      │ Residential Proxy Network │
                                      │    (Bright Data/Oxylabs)  │
                                      └───────────────────────────┘

### 2.1 Technology Stack Selection
* **Frontend:** **Next.js 14 (App Router)** + **Tailwind CSS** + **Shadcn/ui** (For high-speed dashboard iteration, state preservation, and data visualization via Recharts).
* **Backend:** **Node.js (TypeScript) with Fastify** or **NestJS** (To handle high-throughput async processing and background worker controls).
* **Task Queue:** **Redis** + **BullMQ** (Crucial for managing long-running scraping tasks, retries, rate limits, and job state propagation).
* **Database:** **PostgreSQL** with **Prisma ORM** (Structured storage for leads, geographic configurations, search histories, and pipeline status updates).
* **Scraping Engine:** **Playwright** running in a headless Dockerized environment, optimized for stealth browser execution.

---

## 3. Deep Dive: Google Maps Scraping & Data Enrichment Methodology

Scraping Google Maps directly via traditional HTTP requests is impossible due to highly dynamic client-side hydration. The scraping worker architecture must mimic human browsing behaviors perfectly.

### 3.1 Scraping Execution Workflow
1.  **Search Vector Injection:** The worker constructs a specialized query URL format:
    `https://www.google.com/maps/search/{vertical}+in+{location_or_coordinates}/`
2.  **Viewport DOM Scrolling:** Maps lazily loads results in a left-hand side panel (`role="feed"`). The worker targets this DOM container and scrolls systematically down by discrete pixel boundaries (`scrollBy(0, 800)`), listening for the explicit string or DOM endpoint denoting `"You've reached the end of the list."`
3.  **Entity Parsing:** For every item card identified in the list, the browser clicks to focus, loading the detailed sidebar panel. It extracts:
    * `Business Name` (H1 header text)
    * `Rating` & `Review Count`
    * `Physical Address`
    * `Phone Number`
    * `Website URL` (Extracting the tracking outbound redirect link safely)
    * `Google Maps URL`

### 3.2 Bypassing Anti-Scraping & IP Fingerprinting Blocks
Google employs robust anomaly detection. To ensure the scraping cluster maintains high availability, the infrastructure requires:
* **Stealth Plugin Architecture:** Use `playwright-extra` with the `user-agents` and `stealth` plugins to mask browser fingerprints (spoofing canvas, WebGL parameters, navigator languages, and removing `navigator.webdriver` flags).
* **Residential Proxy Rotation:** Route all traffic through a rotating backconnect residential proxy pool (e.g., Bright Data, Oxylabs, or Smartproxy) pinned specifically to French geo-locations to avoid cross-country authentication traps.
* **Asynchronous Delays (Jitter):** Humanize scraping behaviors by injecting random mathematical noise into interaction delays:
    $$\Delta t = t_{\text{base}} + \text{random}(0, 1.5) \times \text{scale\_factor}$$

### 3.3 The Digital Maturity Enrichment Engine
Raw Maps data is insufficient for a conversion-optimized agency pipeline. Once the scraper extracts a business, the platform initiates a secondary **Enrichment Microservice**:
1.  **Website Audit Layer:** If a website exists, execute a quick automated headless check:
    * Does it load within 4 seconds?
    * Is it built with modern frameworks, or outdated page builders?
    * Does it have an SSL certificate active (`https`)?
2.  **Contact/Social Enrichment Layer:** Scrap the landing page for social handles (`Facebook`, `Instagram`, `LinkedIn`) and look for typical contact endpoints (`/contact`, `/about`) to fetch public email coordinates using regex signatures.
3.  **Automation Gap Detection:** Verify if there is a modern live-chat widget or booking plugin present. If missing, flag as **"High-Value Automation Target"**.

---

## 4. Dashboard Features & System Requirements

The web application's frontend is split into three primary structural modules:

### 4.1 Search & Extraction Panel
* **Geographical Polygon Targeting:** An interactive Mapbox or open-source Leaflet map layout allowing users to draw custom bounding boxes over specific zones or type standard French cities/postal codes.
* **Task Setup Wizard:** Inputs for target keywords, depth limits (e.g., Max 100 leads per run), and a delay configuration toggle.
* **Live Status Progress Bar:** Displays real-time job feedback: `[Queued -> Sourcing Maps -> Auditing Websites -> Completed]`.

### 4.2 Lead Management CRM Dashboard
* **Advanced Dynamic Filters:** Instantly segment list views by:
    * `Has Website` == `False` (Direct target for Web Design sales pitch)
    * `Rating` < `4.0` (Target for reputation management/automation workflows)
    * `Missing Email` vs `Email Found`
* **Lead Pipeline Board:** A kanban-style layout tracking outbound pipeline stages: `New`, `Contacted`, `Meeting Scheduled`, `Proposal Sent`, `Closed Won/Lost`.

### 4.3 Export & Automation Trigger Module
* **CSV/XLSX Exporting Engine:** Raw layout formatting containing clean columns mapped for quick imports into active email tools (e.g., Lemlist, Instantly).
* **Webhook Automation Broker:** Build outbound webhook nodes triggering a Zapier or Make.com sequence directly upon finding a verified qualified lead, immediately auto-drafting a personalized pitch email detailing their specific website audit deficits.

---

## 5. Legal Compliance & Data Integrity (GDPR Context)

Operating a B2B scraper within France requires strict legal alignment with the General Data Protection Regulation (GDPR) and Google's Terms of Service.

### 5.1 Legal Positioning Strategy
* **B2B Exception Matrix:** Under GDPR, prospecting legal entities (B2B corporate entities) does not require explicit opt-in consent if the contact channel is professional and the offering aligns with the recipient's professional activity (*Intérêt Légitime* / Legitimate Interest under Article 6(1)(f)).
* **Data Minimization Protocol:** The tool must reject extraction of personal or private residential coordinates. It must only collect publicly exposed business communication data.
* **Data Lifecycle Limitations:** The internal system database must auto-purge or force-refresh old lead data every 90 days to prevent tracking dead data sets and ensure compliance with accuracy constraints.

---

## 6. Implementation Roadmap

┌─────────────────────────────────────────────────────────────┐
│ PHASE 1: Core Scraping Engine (CLI & Worker Setup)          │
│ - Finalize Playwright scripts with stealth injections        │
│ - Integrate residential proxy rotation pools                 │
└──────────────────────────────┬──────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────┐
│ PHASE 2: Backend Architecture & Queue Infrastructure        │
│ - Configure Fastify API Server & Prisma Database Schemas     │
│ - Implement BullMQ with Redis to manage concurrency constraints│
└──────────────────────────────┬──────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────┐
│ PHASE 3: Next.js Frontend Dashboard Construction            │
│ - Design lead extraction wizards & pipeline Kanban board    │
│ - Wire real-time update engine via WebSockets                │
└─────────────────────────────────────────────────────────────┘


This structural architecture ensures Wi'Tech Agency transforms from a reactive client seeker to an automated, systematic outbound engine, generating verified pipeline value natively.
"""

with open("witech_maps_prospector_prd.md", "w", encoding="utf-8") as f:
    f.write(markdown_content)

print("Markdown file written successfully.")


Your markdown file has been generated successfully.
Icône MD
 witech_map...pector_prd 
MD

Executive Summary of the Strategy Designed for Wi'Tech Agency:
This document details a tailored Product Requirement Document (PRD) for your upcoming local lead generation application (Wi'Tech Maps Prospector). It addresses your agency's key acquisition pain points by combining automated extraction with a smart Digital Maturity Enrichment Engine:

The Lead Engine Strategy: Instead of just exporting raw data, the scraper evaluates local businesses for technological gaps. If a business has no website or an insecure site, it flags them instantly as a Web Design Prospect. If they have high reviews but no contact automation, a chatbot, or an updated booking system, it flags them as an Automation Prospect.

Architecture: Driven by a modern stack (Next.js 14, Tailwind CSS, and Fastify/Node.js) utilizing an asynchronous task manager (BullMQ + Redis). This allows you to launch heavy jobs covering large zones without freezing your app's frontend dashboard.

Scraping Engineering: It bypasses Google Maps’ anti-bot restrictions using playwright-extra-stealth combined with automated human-like viewport scrolling and residential proxy rotation pools mapped strictly within your operating region.

GDPR Alignment: Since you operate in France/Europe, the workflow relies cleanly on the B2B Legitimate Interest exception (Art. 6-1-f of the GDPR), ensuring your automated outreach remains compliant while scraping public business channels.

You can download the generated .md file directly using the link above to view, store, or edit the specifications in your preferred markdown editor.

to better reformulate or let me say to adapt to what you have done, this is the first prompt I passed. check the md you did and see if it need some updates based on this prompt



I want to create a project that will help me to make a prospection, for my buisness, right now I have difficulties in prospecting, so I had an idea of creating a web app that will help me to do that, like scraping businesses  base on our research from Google Maps links, import it into my buisness, and make and intuitive dashboard, that will help me analyse the different buisness, see if it has email, website, etc, and by then trying to send a message at once to all the buisness of the same category maybe all plumber, or all carpenter, or all solo-entrepreneur etc. That s

Based on the original prompt you shared, your vision emphasizes a key feature that wasn't fully fleshed out in the initial document: mass bulk outreach segmented by business category (e.g., emailing all plumbers, carpenters, or solo-entrepreneurs at once) directly from the platform.

The original version treated the app more like a filter-and-export utility. To truly match your intent, the platform needs to act as a localized mass-outreach machine with built-in templating and cold communication rails.

I have updated the Product Requirement Document (PRD) to directly integrate these components:

Unified Bulk Communication Engine: Multi-channel template management with dynamic variables (e.g., {Business Name}, {Deficit_Type}).

Smart Blast Control (Anti-Spam): Queuing mechanisms to ensure that when you text or email 150 plumbers at once, they are trickled out safely so your domain doesn't get blacklisted.

Granular Category Tagging: Auto-tagging entities specifically into operational buckets (Solo-entrepreneur, Artisan, SME) based on their Google Maps profile metadata.

Here is your updated, fully tailored specification file:  
MD

Product Requirement Document (PRD): Wi'Tech Maps Prospector (Revised)
Project Phase: Alpha Design & Architecture Specification

Target User/Owner: Wi'Tech Agency (Web Design & Automation Sector)  
MD

Document Format: Comprehensive System Specification (.md)  
MD

1. Executive Summary & Strategic Value Proposition
1.1 Problem Statement
Wi'Tech Agency faces a classic B2B agency bottleneck: unpredictable client acquisition pipelines (Prospection). Sourcing local small-to-medium businesses (SMBs) and independent workers manually via Google Maps is labor-intensive. Furthermore, moving data from Maps to spreadsheets, vetting their digital presence, and executing outreach manually creates a disjointed workflow that stalls agency growth.  
MD
+ 1

1.2 Proposed Solution
The Wi'Tech Maps Prospector is an all-in-one proprietary full-stack web application designed to turn local extraction into immediate inbound opportunities. By inputting geographical target zones and industry keywords, the platform programmatically extracts business profiles from Google Maps.  
MD
+ 1

Instead of just storing this data, the app immediately runs a digital audit (detecting websites, emails, and automation gaps), indexes them into an intuitive dashboard, and enables one-click mass outreach campaigns segmented by precise business categories (e.g., blasting an email/message to all "plumbers", "carpenters", or "solo-entrepreneurs" simultaneously).  
MD

1.3 Core Agency Value Metrics
Web Design Leads: Instantly isolates businesses missing websites or running unoptimized mobile landing pages.  
MD

Automation Leads: Targets high-earning businesses lacking instant response widgets, contact forms, or automated booking flows.  
MD

Outreach Efficiency: Eliminates manual emailing. A single agent can pitch an entire regional industry sector in under 5 minutes.

2. Platform Architecture & Technical Stack
The architecture must support concurrent client-side web scraping alongside heavy outbound mail/message delivery queuing.

                  ┌──────────────────────────────────────────────┐
                  │              React / Next.js UI              │
                  │        (Tailwind Dashboard & Campaign Builder)│
                  └──────────────────────┬───────────────────────┘
                                         │ Rest API / WebSockets
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │           Node.js / Fastify Backend          │
                  └──────┬──────────────────────┬────────────────┘
                         │                      │
                         ▼                      ▼
           ┌───────────────────────────┐  ┌───────────────────────────┐
           │     PostgreSQL / Prisma   │  │   Redis / BullMQ Queue    │
           │  (Leads, Templates, Campaigns)│  │ (Scraping & Bulk Mail Jobs)│
           └───────────────────────────┘  └─────────────┬─────────────┘
                                                        │
                                                        ▼
                                          ┌───────────────────────────┐
                                          │   Outbound Mail/API Relays │
                                          │ (Resend / Twilio / SMTP)  │
                                          └───────────────────────────┘
2.1 Technology Stack Selection
Frontend: Next.js 14 (App Router) + Tailwind CSS + Shadcn/ui.  
MD

Backend: Node.js (TypeScript) with Fastify to handle high-throughput asynchronous operations and webhook ingestion.  
MD

Task Queue: Redis + BullMQ. Critical modification: Dual-queue structure. Queue A handles background scraping tasks; Queue B manages throttled outbound communication campaigns to prevent spam blocks.  
MD
+ 1

Database: PostgreSQL with Prisma ORM. Schema expanded to include Campaigns, Templates, and OutreachLogs mapped relations.  
MD

Communication Providers: Integration with specialized transactional/marketing systems like Resend API, SendGrid, or a custom authenticated SMTP/IMAP node for personalized cold mailing.

3. Deep Dive: Google Maps Extraction & Categorization Engine
3.1 Scraping Execution Workflow
Search Vector Injection: The engine processes specialized local search strings.  
MD

Viewport DOM Scrolling & Entity Parsing: Programmatically loads businesses from the Maps sidebar container, clicking each to parse vital metadata fields: Name, Rating, Address, Phone, Website URL, and Google Category Tags (e.g., Plombier, Menuisier).  
MD

Entity Classification Engine: Because keywords overlap, an internal micro-classifier parses the primary Google Maps label to group targets cleanly into core business categories:

Category Tag -> Artisan / Trade (Plumber, Carpenter, Electrician)

Category Tag -> Corporate / Agency (Real Estate, Consulting)

Category Tag -> Solo-Entrepreneur / Independent (Photographer, Coach)

3.2 Digital Maturity Enrichment Engine
Once scraped, the lead profile undergoes automated verification:  
MD

Website Analysis: Checks if a domain exists. If yes, it pings the header to evaluate loading speed, SSL status, and mobile responsiveness.  
MD
+ 1

Contact Sourcing: Scrapes the target website's layout for public professional emails (contact@..., info@...), social handles, and contact page structures.  
MD

Automation Deficit Audit: Flags the absence of meta tags, modern analytics tracking, chat platforms, or client booking widgets.  
MD

4. Dashboard Features & System Requirements
The web application's dashboard is optimized around two activities: Data Analysis and Mass Communication.

┌───────────────────────────────────────────────────────────────────────────┐
│ SEARCH & MAP CONTROL PANEL                                                │
│ [ Keyword: Plumber       ] [ Region: Nantes, FR   ] [ Start Extraction ]  │
└───────────────────────────────────────────────────────────────────────────┘
┌───────────────────────────────────────────────────────────────────────────┐
│ ANALYTICS DASHBOARD & CRM                                                 │
│ Total Extracted: 342  |  Missing Website: 84  |  Missing Email: 112       │
├───────────────────────────────────────────────────────────────────────────┤
│ [X] Business Name   │ Category    │ Website?   │ Email Found?    │ Status │
│ [x] Dupuis Plomberie│ Plumber     │ No         │ contact@..      │ New    │
│ [x] Loïc Menuiserie │ Carpenter   │ Yes (Bad)  │ loic@...        │ New    │
└───────────────────────────────────────────────────────────────────────────┘
┌───────────────────────────────────────────────────────────────────────────┐
│ MASS CAMPAIGN BUILDER (BUILT-IN OUTREACH)                                 │
│ Target Category: [ Plumber (All Selected: 45)                           ] │
│ Choose Template: [ Web Design Pitch - No Website Deficit                ] │
│ Message Body:                                                             │
│ "Bonjour {{business_name}}, nous avons remarqué que votre fiche Google    │
│  génère d'excellents avis mais qu'il vous manque un site web..."          │
│                                                   [ SEND TO ALL AT ONCE ] │
└───────────────────────────────────────────────────────────────────────────┘
4.1 Search & Extraction Panel
Interactive geographic bounding boxes to define search horizons.  
MD

Real-time processing logs tracking scraping depth and email extraction rates.  
MD

4.2 Lead Management & Analytics CRM
Intuitive Category Grouping: Tabs or fast-filter pills to view all plumbers, all carpenters, or all solo-entrepreneurs with a single click.

Vulnerability Metric Flags: Sort leads dynamically by their structural weaknesses: Has No Website, Has Outdated Stack, Has Zero Automation.

4.3 Integrated Bulk Outreach Module (New)
Dynamic Template Editor: Supports custom markdown or rich-text templates using conditional placeholders:

{{business_name}} -> Dupuis Plomberie

{{city}} -> Nantes

{{audit_finding}} -> "votre entreprise n'a pas de site web connecté à votre fiche" or "votre site internet n'est pas optimisé pour les smartphones"

One-Click Batch Execution: Select an entire category cluster, attach an outreach template, and hit send.

Throttled Campaign Delivery Worker: Automatically staggers outbound emails (e.g., 1 email every 45–90 seconds per connected sender account) to completely protect your agency's domain authority from being flagged as a spam vector.

Outreach Tracker: Displays open rates, link clicks, and reply loops directly inside the prospect's dashboard card.

5. Legal Compliance & Data Integrity (GDPR Context)
5.1 B2B Cold Outreach Compliance
Legitimate Interest Frame: In accordance with France’s CNIL regulations and GDPR Article 6(1)(f), cold emailing prospective business units (B2B) without explicit opt-in is authorized, provided the message explicitly targets their professional activity and offers a clear, immediate link to opt out (Lien de désinscription).  
MD

Automatic Suppression Lists: If a business opts out or replies negatively, their profile is instantly blacklisted from all future extraction lists and outreach actions.

6. Technical Implementation Roadmap
┌─────────────────────────────────────────────────────────────┐
│ PHASE 1: Core Scraping & Enrichment Crawler                │
│ - Playwright extraction loops with stealth optimizations   │
│ - Metadata categorizer & raw domain email hunters          │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ PHASE 2: Core CRM Dashboard & Segmentation Engines          │
│ - Database migration mappings for Categories & Campaigns   │
│ - Build Next.js interfaces for lead filtering & tracking     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ PHASE 3: Bulk Outreach Engine & Queue Guardrail            │
│ - Integrate SendGrid/Resend API endpoints                   │
│ - Deploy BullMQ worker logic for variable injection & pacing│
└─────────────────────────────────────────────────────────────┘
Key Architecture Updates Made for You:
Added Section 4.3 (Mass Campaign Builder): This outlines exactly how the app will handle sending a message "at once" using code-friendly variables like {{business_name}} and {{audit_finding}}.

Added Smart Pacing to Section 2.1 & 4.3: If you click "Send to all Plumbers" and you have 200 leads, sending them all in 1 millisecond will destroy your email reputation. The updated architecture routes this through a BullMQ delayed queue to trickle them out safely.

Refocused Data Models on Categories: Explicitly added architecture fields to map entries by business classification fields (Plumber, Carpenter, Solo-entrepreneur) so your global filtering works flawlessly.

please make it in md format

An updated Markdown specification file (witech_maps_prospector_prd.md) reflecting your entire bulk-outreach pipeline has been written to your project directory.

You can copy the raw code block below or open the generated file directly.

Markdown
# Product Requirement Document (PRD): Wi'Tech Maps Prospector (Revised)
**Project Phase:** Alpha Design & Architecture Specification  
**Target User/Owner:** Wi'Tech Agency (Web Design & Automation Sector)
**Document Format:** Comprehensive System Specification (`.md`)

---

## 1. Executive Summary & Strategic Value Proposition

### 1.1 Problem Statement
Wi'Tech Agency faces a classic B2B agency bottleneck: **unpredictable client acquisition pipelines (Prospection)**. Sourcing local small-to-medium businesses (SMBs) and independent workers manually via Google Maps is labor-intensive. Furthermore, moving data from Maps to spreadsheets, vetting their digital presence, and executing outreach manually creates a disjointed workflow that stalls agency growth.

### 1.2 Proposed Solution
The **Wi'Tech Maps Prospector** is an all-in-one proprietary full-stack web application designed to turn local extraction into immediate inbound opportunities. By inputting geographical target zones and industry keywords, the platform programmatically extracts business profiles from Google Maps. 

Instead of just storing this data, the app immediately runs a **digital audit** (detecting websites, emails, and automation gaps), indexes them into an intuitive dashboard, and enables **one-click mass outreach campaigns segmented by precise business categories** (e.g., blasting an email/message to all "plumbers", "carpenters", or "solo-entrepreneurs" simultaneously).

### 1.3 Core Agency Value Metrics
*   **Web Design Leads:** Instantly isolates businesses missing websites or running unoptimized mobile landing pages.
*   **Automation Leads:** Targets high-earning businesses lacking instant response widgets, contact forms, or automated booking flows.
*   **Outreach Efficiency:** Eliminates manual emailing. A single agent can pitch an entire regional industry sector in under 5 minutes.

---

## 2. Platform Architecture & Technical Stack

The architecture must support concurrent client-side web scraping alongside heavy outbound mail/message delivery queuing.

              ┌──────────────────────────────────────────────┐
              │              React / Next.js UI              │
              │        (Tailwind Dashboard & Campaign Builder)│
              └──────────────────────┬───────────────────────┘
                                     │ Rest API / WebSockets
                                     ▼
              ┌──────────────────────────────────────────────┐
              │           Node.js / Fastify Backend          │
              └──────┬──────────────────────┬────────────────┘
                     │                      │
                     ▼                      ▼
       ┌───────────────────────────┐  ┌───────────────────────────┐
       │     PostgreSQL / Prisma   │  │   Redis / BullMQ Queue    │
       │  (Leads, Templates, Campaigns)│  │ (Scraping & Bulk Mail Jobs)│
       └───────────────────────────┘  └─────────────┬─────────────┘
                                                    │
                                                    ▼
                                      ┌───────────────────────────┐
                                      │   Outbound Mail/API Relays │
                                      │ (Resend / Twilio / SMTP)  │
                                      └───────────────────────────┘

### 2.1 Technology Stack Selection
*   **Frontend:** **Next.js 14 (App Router)** + **Tailwind CSS** + **Shadcn/ui**.
*   **Backend:** **Node.js (TypeScript) with Fastify** to handle high-throughput asynchronous operations and webhook ingestion.
*   **Task Queue:** **Redis** + **BullMQ**. *Critical modification:* Dual-queue structure. `Queue A` handles background scraping tasks; `Queue B` manages throttled outbound communication campaigns to prevent spam blocks.
*   **Database:** **PostgreSQL** with **Prisma ORM**. Schema expanded to include `Campaigns`, `Templates`, and `OutreachLogs` mapped relations.
*   **Communication Providers:** Integration with specialized transactional/marketing systems like **Resend API**, **SendGrid**, or a custom authenticated **SMTP/IMAP node** for personalized cold mailing.

---

## 3. Deep Dive: Google Maps Extraction & Categorization Engine

### 3.1 Scraping Execution Workflow
1.  **Search Vector Injection:** The engine processes specialized local search strings.
2.  **Viewport DOM Scrolling & Entity Parsing:** Programmatically loads businesses from the Maps sidebar container, clicking each to parse vital metadata fields: Name, Rating, Address, Phone, Website URL, and **Google Category Tags** (e.g., *Plombier*, *Menuisier*).
3.  **Entity Classification Engine:** Because keywords overlap, an internal micro-classifier parses the primary Google Maps label to group targets cleanly into core business categories:
    *   `Category Tag` -> Artisan / Trade (Plumber, Carpenter, Electrician)
    *   `Category Tag` -> Corporate / Agency (Real Estate, Consulting)
    *   `Category Tag` -> Solo-Entrepreneur / Independent (Photographer, Coach)

### 3.2 Digital Maturity Enrichment Engine
Once scraped, the lead profile undergoes automated verification:
*   **Website Analysis:** Checks if a domain exists. If yes, it pings the header to evaluate loading speed, SSL status, and mobile responsiveness.
*   **Contact Sourcing:** Scrapes the target website's layout for public professional emails (`contact@...`, `info@...`), social handles, and contact page structures.
*   **Automation Deficit Audit:** Flags the absence of meta tags, modern analytics tracking, chat platforms, or client booking widgets.

---

## 4. Dashboard Features & System Requirements

The web application's dashboard is optimized around two activities: **Data Analysis** and **Mass Communication**.

### 4.1 Search & Extraction Panel
*   Interactive geographic bounding boxes to define search horizons.
*   Real-time processing logs tracking scraping depth and email extraction rates.

### 4.2 Lead Management & Analytics CRM
*   **Intuitive Category Grouping:** Tabs or fast-filter pills to view all plumbers, all carpenters, or all solo-entrepreneurs with a single click.
*   **Vulnerability Metric Flags:** Sort leads dynamically by their structural weaknesses: `Has No Website`, `Has Outdated Stack`, `Has Zero Automation`.

### 4.3 Integrated Bulk Outreach Module
*   **Dynamic Template Editor:** Supports custom markdown or rich-text templates using conditional placeholders:
    *   `{{business_name}}` -> *Dupuis Plomberie*
    *   `{{city}}` -> *Nantes*
    *   `{{audit_finding}}` -> *"votre entreprise n'a pas de site web connecté à votre fiche"* or *"votre site internet n'est pas optimisé pour les smartphones"*
*   **One-Click Batch Execution:** Select an entire category cluster, attach an outreach template, and hit send.
*   **Throttled Campaign Delivery Worker:** Automatically staggers outbound emails (e.g., 1 email every 45–90 seconds per connected sender account) to completely protect your agency's domain authority from being flagged as a spam vector.
*   **Outreach Tracker:** Displays open rates, link clicks, and reply loops directly inside the prospect's dashboard card.

---

## 5. Legal Compliance & Data Integrity (GDPR Context)

### 5.1 B2B Cold Outreach Compliance
*   **Legitimate Interest Frame:** In accordance with France’s CNIL regulations and GDPR Article 6(1)(f), cold emailing prospective business units (B2B) without explicit opt-in is authorized, provided the message explicitly targets their professional activity and offers a clear, immediate link to opt out (*Lien de désinscription*).
*   **Automatic Suppression Lists:** If a business opts out or replies negatively, their profile is instantly blacklisted from all future extraction lists and outreach actions.

---

## 6. Technical Implementation Roadmap

┌─────────────────────────────────────────────────────────────┐
│ PHASE 1: Core Scraping & Enrichment Crawler                │
│ - Playwright extraction loops with stealth optimizations   │
│ - Metadata categorizer & raw domain email hunters          │
└──────────────────────────────┬──────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────┐
│ PHASE 2: Core CRM Dashboard & Segmentation Engines          │
│ - Database migration mappings for Categories & Campaigns   │
│ - Build Next.js interfaces for lead filtering & tracking     │
└──────────────────────────────┬──────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────┐
│ PHASE 3: Bulk Outreach Engine & Queue Guardrail            │
│ - Integrate SendGrid/Resend API endpoints                   │
│ - Deploy BullMQ worker logic for variable injection & pacing│
└─────────────────────────────────────────────────────────────┘