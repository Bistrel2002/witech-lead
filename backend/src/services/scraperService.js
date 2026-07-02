import axios from 'axios';
import * as cheerio from 'cheerio';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure Axios with standard headers and timeout to avoid hangs
const client = axios.create({
  timeout: 8000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7'
  }
});

/**
 * Normalizes a URL to ensure it starts with http:// or https://
 */
function normalizeUrl(url) {
  if (!url) return '';
  let cleanUrl = url.trim();
  if (!/^https?:\/\//i.test(cleanUrl)) {
    cleanUrl = 'http://' + cleanUrl;
  }
  return cleanUrl;
}

// Check if email is valid
function isValidEmail(email) {
  if (!email) return false;
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}$/.test(email);
}

// Cleans social url query strings
function cleanSocialUrl(url) {
  try {
    let clean = url.trim().split('?')[0];
    if (clean.endsWith('/')) {
      clean = clean.slice(0, -1);
    }
    return clean;
  } catch (e) {
    return url;
  }
}

/**
 * Extracts emails, social handles, and phone numbers from a website
 */
export async function scrapeWebsite(websiteUrl) {
  const result = {
    email: null,
    facebook: null,
    instagram: null,
    linkedin: null,
    phone: null,
    has_ssl: 0,
    social_handles: null,
    has_chat_widget: 0,
    tech_stack: null,
    load_time_ms: null,
    error: null,
    pagesCrawled: []
  };

  if (!websiteUrl) {
    result.error = 'No website URL provided';
    return result;
  }

  const targetUrl = normalizeUrl(websiteUrl);
  result.has_ssl = targetUrl.startsWith('https') ? 1 : 0;
  
  let parsedTarget = null;
  try {
    parsedTarget = new URL(targetUrl);
  } catch (e) {
    result.error = `Invalid URL: ${websiteUrl}`;
    return result;
  }

  const origin = parsedTarget.origin;
  const emailsSet = new Set();
  const socialLinks = { facebook: null, instagram: null, linkedin: null, twitter: null };
  const phonesSet = new Set();
  let chatWidgetDetected = false;
  let detectedTechStack = null;
  let allHtml = '';

  // Helper to scrape a single page
  async function scrapePage(url) {
    if (result.pagesCrawled.includes(url) || result.pagesCrawled.length >= 4) {
      return;
    }
    result.pagesCrawled.push(url);

    try {
      const response = await client.get(url);
      if (response.status !== 200) return;
      
      const html = response.data;
      allHtml += html;
      const $ = cheerio.load(html);
      
      // 1. Extract Emails
      $('a[href^="mailto:"]').each((_, elem) => {
        const href = $(elem).attr('href') || '';
        const mail = href.replace(/^mailto:/i, '').split('?')[0].trim();
        if (isValidEmail(mail)) emailsSet.add(mail);
      });

      const bodyText = $('body').text() || '';
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}/g;
      const matches = bodyText.match(emailRegex) || [];
      matches.forEach(mail => {
        const cleanMail = mail.trim();
        if (isValidEmail(cleanMail) && !/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(cleanMail)) {
          emailsSet.add(cleanMail);
        }
      });

      // 2. Extract Socials
      $('a[href]').each((_, elem) => {
        const href = $(elem).attr('href') || '';
        if (/facebook\.com/i.test(href) && !socialLinks.facebook) {
          socialLinks.facebook = cleanSocialUrl(href);
        }
        if (/instagram\.com/i.test(href) && !socialLinks.instagram) {
          socialLinks.instagram = cleanSocialUrl(href);
        }
        if (/linkedin\.com\/(company|in)/i.test(href) && !socialLinks.linkedin) {
          socialLinks.linkedin = cleanSocialUrl(href);
        }
        if (/twitter\.com|x\.com/i.test(href) && !socialLinks.twitter) {
          socialLinks.twitter = cleanSocialUrl(href);
        }
      });

      // 2b. Chat widget detection
      const chatSignatures = ['crisp.chat', 'intercom', 'tawk.to', 'calendly', 'drift', 'hubspot'];
      for (const sig of chatSignatures) {
        if (html.toLowerCase().includes(sig)) {
          chatWidgetDetected = true;
          break;
        }
      }

      // 2c. Tech stack detection
      const metaGenerator = $('meta[name="generator"]').attr('content') || '';
      const techPatterns = [
        { name: 'WordPress', pattern: /wordpress/i },
        { name: 'Wix', pattern: /wix\.com/i },
        { name: 'Squarespace', pattern: /squarespace/i },
        { name: 'Shopify', pattern: /shopify/i },
        { name: 'Joomla', pattern: /joomla/i }
      ];
      for (const { name, pattern } of techPatterns) {
        if (pattern.test(metaGenerator) || pattern.test(html)) {
          detectedTechStack = name;
          break;
        }
      }

    } catch (e) {
      // Ignore errors on subpages
    }
  }

  try {
    const startTime = Date.now();
    await scrapePage(targetUrl);
    result.load_time_ms = Date.now() - startTime;
    
    // Attempt crawling other pages
    const $ = cheerio.load(allHtml);
    const subpages = [];
    $('a[href]').each((_, elem) => {
      const href = $(elem).attr('href') || '';
      if (href.startsWith('/') && !href.startsWith('//')) {
        subpages.push(origin + href);
      } else if (href.startsWith(origin)) {
        subpages.push(href);
      }
    });

    // Crawl a maximum of 3 relevant subpages (e.g. Contact, About, Mentions)
    const candidates = subpages.filter(url => 
      /contact|about|apropos|legal|mentions/i.test(url)
    ).slice(0, 3);

    for (const url of candidates) {
      await scrapePage(url);
    }

    result.email = emailsSet.size > 0 ? Array.from(emailsSet)[0] : null;
    result.facebook = socialLinks.facebook;
    result.instagram = socialLinks.instagram;
    result.linkedin = socialLinks.linkedin;
    result.social_handles = JSON.stringify(socialLinks);
    result.has_chat_widget = chatWidgetDetected ? 1 : 0;
    result.tech_stack = detectedTechStack;

  } catch (err) {
    result.error = err.message;
  }

  return result;
}

/**
 * Spawns the Python Playwright Google Maps scraper process
 */
export async function scrapeGoogleMapsFromLink(mapsUrl, category, city, radius = 5, maxLeads = 50) {
  let finalCategory = category;
  let finalCity = city;

  // Extract from maps link if not explicitly provided
  if (!finalCategory || !finalCity) {
    try {
      const decodedUrl = decodeURIComponent(mapsUrl);
      const searchMatch = decodedUrl.match(/\/search\/([^\/\?]+)/) || decodedUrl.match(/query=([^&]+)/);
      if (searchMatch && searchMatch[1]) {
        const queryStr = searchMatch[1].replace(/\+/g, ' ');
        // Split by spaces, look for location
        const parts = queryStr.split(/\s+/);
        if (parts.length >= 2) {
          finalCity = parts[0].trim();
          finalCategory = parts.slice(1).join(' ').trim();
        } else {
          finalCategory = queryStr.trim();
          finalCity = 'France';
        }
      }
    } catch (err) {
      console.error('Error parsing category/city from Maps URL:', err);
    }
  }



  console.log(`[Node backend]: Spawning Playwright Python Scraper for Category: "${finalCategory}", City: "${finalCity}", Limit: ${maxLeads}`);

  const pythonBin = path.resolve(__dirname, '../../../venv/bin/python3');
  const pythonScript = path.resolve(__dirname, './scraper.py');

  return new Promise((resolve, reject) => {
    let pyProcess;
    try {
      pyProcess = spawn(pythonBin, [
        pythonScript,
        '--category', finalCategory,
        '--city', finalCity,
        '--radius', String(radius),
        '--limit', String(maxLeads)
      ]);
    } catch (err) {
      return reject(new Error(`Impossible de lancer le scraper : ${err.message}`));
    }

    pyProcess.on('error', (err) => {
      console.error('Failed to start python scraper process:', err);
      reject(new Error(`Le scraper n'est pas configuré ou introuvable sur le serveur (Python/venv manquant).`));
    });

    let stdoutData = '';
    let stderrData = '';

    pyProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    pyProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
      console.log(`[Python Scraper Log]: ${data.toString().trim()}`);
    });

    pyProcess.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Python scraper failed (code ${code}): ${stderrData}`));
      }
      try {
        const leads = JSON.parse(stdoutData);
        resolve({
          category: finalCategory,
          city: finalCity,
          leads
        });
      } catch (err) {
        reject(new Error(`Failed to parse scraper output: ${err.message}. Raw: ${stdoutData}`));
      }
    });
  });
}
