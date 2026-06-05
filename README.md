# Wi'Tech Maps Prospector (Witech Lead)

Wi'Tech Maps Prospector is a full-stack B2B client acquisition suite designed for agency sales workflows. It programmatically extracts local business leads from Google Maps, performs automated digital audits (detecting websites, emails, SSL security, and mobile responsiveness), and coordinates targeted bulk cold email outreach campaigns directly from an interactive dashboard.

---

## 🏗️ Platform Architecture

The project is structured as a monorepo consisting of:
*   **`frontend/`**: A modern React + Vite application styled with custom CSS and utilizing Lucide icons and Recharts.
*   **`backend/`**: A Node.js + Express API server running Puppeteer/Cheerio for background scraping/auditing and Nodemailer for campaign outreach.
*   **`database.sqlite`**: A lightweight local SQLite database tracking leads, settings, campaigns, and outreach logs.

```
                          ┌──────────────────────────────┐
                          │     Vite / React Frontend    │
                          │   (Interactive UI & CRM)     │
                          └──────────────┬───────────────┘
                                         │ API / JSON
                                         ▼
                          ┌──────────────────────────────┐
                          │    Express Node.js Backend   │
                          └──────┬────────────────┬──────┘
                                 │                │
                                 ▼                ▼
                     ┌───────────────────────┐ ┌───────────────────────┐
                     │   SQLite Database     │ │ Puppeteer & Crawler   │
                     │ (Leads, Settings, etc)│ │ (Maps Scraper & Audit)│
                     └───────────────────────┘ └───────────────────────┘
```

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
Ensure you have the following installed:
*   [Node.js](https://nodejs.org/) (v18+ recommended)
*   [npm](https://www.npmjs.com/) (installed with Node)

### 2. Install All Dependencies
We have provided a helper script in the root directory to install dependencies for the root, backend, and frontend directories concurrently:
```bash
npm run install:all
```

### 3. Run the Application
Start both the frontend and backend servers concurrently in development mode:
```bash
npm run dev
```

*   **Frontend Development Server:** Running on [http://localhost:5173](http://localhost:5173)
*   **Backend Express Server:** Running on [http://localhost:3001](http://localhost:3001)

---

## 📦 Production Deployment

### Frontend (Vercel)
The React frontend is optimized for zero-config hosting on Vercel:
1.  Push the code to your GitHub repository.
2.  Import the repository in your **Vercel Dashboard**.
3.  In the Project settings, configure:
    *   **Framework Preset:** Vite
    *   **Root Directory:** `frontend`
    *   **Build Command:** `npm run build`
    *   **Output Directory:** `dist`
4.  Configure the **Environment Variables**:
    *   Add `VITE_API_URL` pointing to your hosted backend URL. If left blank, it defaults to `http://localhost:3001` (allowing you to run the frontend on Vercel while keeping your scraper running locally on your computer).

### Backend (Render, Railway, or VPS)
Because the backend runs heavy long-running Puppeteer scrapers and writes to a stateful SQLite database:
*   **Do not deploy the backend on Vercel serverless functions.** Vercel functions are stateless and ephemeral (any SQLite edits will be wiped out), and their execution timeout (10–60s) is too short for Puppeteer scrapers.
*   **Recommended Hosting:** Host the backend on **Render**, **Railway**, **Fly.io**, or any Virtual Private Server (VPS) that supports persistent storage disks and custom Docker/Node configurations with Chromium packages.

---

## 🛠️ Key Features

1.  **Google Maps Scraping:** Feed a Google Maps search URL (e.g. searching for plumbers or carpenters in a city) to load profiles and extract names, phone numbers, ratings, review counts, addresses, and website links.
2.  **Digital Audit & Sourcing:** Automatic extraction of public professional emails, SSL security validation, responsiveness evaluation, and tech stack detection.
3.  **CRM Dashboard:** Group leads by categories, filter by digital vulnerabilities (e.g., "Missing Website", "No SSL"), and log outreach status.
4.  **Campaign Builder:** Draft reusable email templates with custom variables (`{{business_name}}`, `{{city}}`, `{{audit_finding}}`) and send bulk emails with automated staggering to protect domain spam status.
