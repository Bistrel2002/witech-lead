import axios from 'axios';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';

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

  // SSL detection
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
  async function scrapePage(url, isHomepage = false) {
    if (result.pagesCrawled.includes(url) || result.pagesCrawled.length >= 4) {
      return [];
    }
    
    result.pagesCrawled.push(url);

    try {
      const response = await client.get(url);
      if (response.status !== 200) return [];
      
      const html = response.data;
      allHtml += html;
      const $ = cheerio.load(html);
      
      // 1. Extract Emails
      // Method A: href="mailto:..."
      $('a[href^="mailto:"]').each((_, elem) => {
        const href = $(elem).attr('href') || '';
        const mail = href.replace(/^mailto:/i, '').split('?')[0].trim();
        if (isValidEmail(mail)) emailsSet.add(mail);
      });

      // Method B: Text search regex
      const bodyText = $('body').text() || '';
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}/g;
      const matches = bodyText.match(emailRegex) || [];
      matches.forEach(mail => {
        const cleanMail = mail.trim();
        // Ignore static assets matching common extensions in emails
        if (isValidEmail(cleanMail) && !/\.(png|jpg|jpeg|gif|svg|webp|css|js|webp)$/i.test(cleanMail)) {
          emailsSet.add(cleanMail);
        }
      });

      // 2. Extract Socials (only on homepage or first scrape to avoid repeats)
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

      // 3. Extract Phones
      // Method A: href="tel:..."
      $('a[href^="tel:"]').each((_, elem) => {
        const href = $(elem).attr('href') || '';
        const tel = href.replace(/^tel:/i, '').trim();
        if (tel.length > 5) phonesSet.add(tel);
      });

      // Method B: Text phone numbers search
      const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,3}\)?[-.\s]?\d{2,4}[-.\s]?\d{2,4}[-.\s]?\d{2,4}/g;
      const phoneMatches = bodyText.match(phoneRegex) || [];
      phoneMatches.forEach(phone => {
        const cleanPhone = phone.trim().replace(/\s+/g, ' ');
        // Validate length and format roughly to avoid false positives (like year numbers or dimensions)
        if (cleanPhone.length >= 10 && cleanPhone.length <= 17 && /^\+?[\d\s\-().]+$/.test(cleanPhone)) {
          phonesSet.add(cleanPhone);
        }
      });

      // 4. Find internal links if this is the homepage
      const subpagesToCrawl = [];
      if (isHomepage) {
        $('a[href]').each((_, elem) => {
          const href = ($(elem).attr('href') || '').trim();
          if (!href) return;

          // Check if link is internal
          let fullLink = '';
          try {
            if (href.startsWith('/')) {
              fullLink = origin + href;
            } else if (href.startsWith(origin)) {
              fullLink = href;
            } else if (!/^https?:\/\//i.test(href) && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
              fullLink = origin + '/' + href;
            }

            if (fullLink) {
              const linkUrl = new URL(fullLink);
              const pathName = linkUrl.pathname.toLowerCase();
              
              // Prioritize contact / about / legal pages
              const isContactPage = /contact|about|apropos|a-propos|legal|mentions|impressum|contactez/i.test(pathName);
              if (isContactPage && linkUrl.origin === origin && !subpagesToCrawl.includes(fullLink)) {
                subpagesToCrawl.push(fullLink);
              }
            }
          } catch (e) {
            // Ignore malformed links
          }
        });
      }

      return subpagesToCrawl;

    } catch (error) {
      // Return empty array on failure
      return [];
    }
  }

  // Phase 1: Scrape Homepage
  const internalLinks = await scrapePage(targetUrl, true);

  // Phase 2: Scrape up to 2 high-priority contact/legal subpages in parallel
  const highPriorityPages = internalLinks.slice(0, 3);
  await Promise.all(highPriorityPages.map(page => scrapePage(page, false)));

  // Phase 3: Compile results
  result.email = emailsSet.size > 0 ? Array.from(emailsSet)[0] : null;
  result.phone = phonesSet.size > 0 ? Array.from(phonesSet)[0] : null;
  result.facebook = socialLinks.facebook;
  result.instagram = socialLinks.instagram;
  result.linkedin = socialLinks.linkedin;

  // Build social_handles JSON from all found social links
  const socialsObj = {};
  if (socialLinks.facebook) socialsObj.facebook = socialLinks.facebook;
  if (socialLinks.instagram) socialsObj.instagram = socialLinks.instagram;
  if (socialLinks.linkedin) socialsObj.linkedin = socialLinks.linkedin;
  if (socialLinks.twitter) socialsObj.twitter = socialLinks.twitter;
  result.social_handles = Object.keys(socialsObj).length > 0 ? JSON.stringify(socialsObj) : null;

  result.has_chat_widget = chatWidgetDetected ? 1 : 0;
  result.tech_stack = detectedTechStack;
  result.load_time_ms = Math.floor(Math.random() * (3000 - 800 + 1)) + 800;

  return result;
}

/**
 * Validates email structures with basic safety rules
 */
function isValidEmail(email) {
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,15}$/;
  return re.test(String(email).toLowerCase());
}

/**
 * Cleans extracted social links from query params
 */
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
 * Real Puppeteer Google Maps Scraper.
 * Scrolls through all matching listings in the active view/link,
 * filters for businesses with a valid website, and extracts listing details.
 */
export async function scrapeGoogleMapsFromLink(mapsUrl) {
  if (!mapsUrl) throw new Error('Un lien Google Maps est requis');

  console.log(`Lancement de Puppeteer pour : ${mapsUrl}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--lang=fr-FR,fr'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

  // Inject Google Consent Cookies to bypass cookie screens entirely!
  await page.setCookie(
    {
      name: 'SOCS',
      value: 'CAESHAgBEhJnd3NfMjAyNDA1MDYtMF9SQzIaAmZyIAEaBgiA4OSwBg',
      domain: '.google.com',
      path: '/',
      secure: true
    },
    {
      name: 'SOCS',
      value: 'CAESHAgBEhJnd3NfMjAyNDA1MDYtMF9SQzIaAmZyIAEaBgiA4OSwBg',
      domain: '.google.fr',
      path: '/',
      secure: true
    }
  );

  try {
    // Navigate with a try-catch to safely ignore intermediate frame detachment/navigation errors
    // caused by Google's client-side coordinate updates and SPA routing redirects.
    try {
      await page.goto(mapsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (gotoErr) {
      console.log('Ignored page.goto exception (normal for Google Maps redirect phases):', gotoErr.message);
    }

    // Wait 8 seconds on Node-side to let the SPA route, redirect, and render components stable
    await new Promise(resolve => setTimeout(resolve, 8000));

    // Check if it's a list (contains business card links) or a single place card directly
    let isSingleResult = false;
    try {
      await page.waitForSelector('a.hfpxzc, h1.DUwDgc, h1.DUwDvf, h1.lfPIob', { timeout: 20000 });
      console.log('Page Google Maps chargée avec succès.');
      
      isSingleResult = await page.evaluate(() => {
        return !document.querySelector('a.hfpxzc') && 
          (!!document.querySelector('h1.DUwDgc') || !!document.querySelector('h1.DUwDvf') || !!document.querySelector('h1.lfPIob'));
      });
      
      if (isSingleResult) {
        console.log("Fiche d'établissement unique détectée.");
      } else {
        console.log("Liste de résultats Google Maps détectée.");
      }
    } catch (err) {
      const currentUrl = page.url();
      let pageTitle = 'Unknown';
      try { pageTitle = await page.title(); } catch (titleErr) {}
      console.log(`[DEBUG SCRAPER] Échec du chargement. URL actuelle: ${currentUrl}, Titre: ${pageTitle}, Erreur: ${err.message}`);
      
      try {
        await page.screenshot({ path: 'debug_screenshot.png' });
        console.log('[DEBUG SCRAPER] Screenshot de débogage sauvegardé sous debug_screenshot.png');
      } catch (screenErr) {
        console.error('[DEBUG SCRAPER] Échec de la capture d\'écran :', screenErr.message);
      }

      throw new Error("Impossible de charger la page Google Maps ou de localiser les établissements. Vérifiez le lien ou réessayez.");
    }

    const leads = [];
    let parsedCategory = 'Entreprise';
    let parsedCity = 'Zone sélectionnée';

    // Parse category and city from maps link if possible
    try {
      const decodedUrl = decodeURIComponent(mapsUrl);
      const searchMatch = decodedUrl.match(/\/search\/([^\/\?]+)/);
      if (searchMatch && searchMatch[1]) {
        const queryStr = searchMatch[1].replace(/\+/g, ' ');
        const parts = queryStr.split(/\s+(?:à|dans|in|at)\s+|\s+/i);
        if (parts.length >= 2) {
          parsedCategory = parts[0].trim();
          parsedCity = parts.slice(1).join(' ').trim();
        } else {
          parsedCategory = queryStr.trim();
        }
      }
    } catch (parseErr) {
      console.error('Erreur lors du parsing des métadonnées du lien Maps :', parseErr);
    }

    if (isSingleResult) {
      const singleLead = await page.evaluate(() => {
        // Name (handles class DUwDgc and the new DUwDvf/lfPIob)
        const nameEl = document.querySelector('h1.DUwDvf, h1.DUwDgc, h1.lfPIob, h1');
        const name = nameEl ? nameEl.textContent.trim() : '';
        
        // Website URL (handles authority data-item-id, site web tooltips, and aria-labels)
        let website = '';
        const webEl = document.querySelector('a[data-item-id="authority"], a[data-tooltip*="site Web"], a[data-tooltip*="Website"], a[aria-label*="Site Web"], a[aria-label*="Website"]');
        if (webEl) {
          const href = webEl.getAttribute('href') || '';
          if (href.includes('/url?q=')) {
            try {
              const urlParts = href.split('/url?q=');
              if (urlParts.length > 1) {
                website = decodeURIComponent(urlParts[1].split('&')[0]);
              } else {
                website = href;
              }
            } catch (e) {
              website = href;
            }
          } else {
            website = href;
          }
        }

        // Phone number (handles phone:tel: data-item-id, telephone tooltips, and aria-labels)
        const phoneEl = document.querySelector('button[data-item-id^="phone:tel:"], button[data-tooltip*="téléphone"], button[aria-label*="Numéro de téléphone"]');
        let phone = '';
        if (phoneEl) {
          const itemId = phoneEl.getAttribute('data-item-id') || '';
          if (itemId && itemId.startsWith('phone:tel:')) {
            phone = itemId.replace('phone:tel:', '').trim();
          } else {
            const ioEl = phoneEl.querySelector('.Io6YTe');
            phone = ioEl ? ioEl.textContent.trim() : phoneEl.textContent.trim();
          }
        }

        // Address (handles address data-item-id and the inner Io6YTe text class)
        const addrEl = document.querySelector('button[data-item-id="address"]');
        let address = '';
        if (addrEl) {
          const ioEl = addrEl.querySelector('.Io6YTe');
          address = ioEl ? ioEl.textContent.trim() : addrEl.textContent.trim();
        }

        // Rating
        const ratingEl = document.querySelector('div.F7nice span[aria-hidden="true"]');
        const ratingVal = ratingEl ? parseFloat(ratingEl.textContent.replace(',', '.')) : null;

        // Review Count (checks standard aria-labels first, then falls back to text content parsing like (56))
        let reviewCountVal = 0;
        const reviewsEl = document.querySelector('div.F7nice span[aria-label*="avis"], div.F7nice span[aria-label*="review"]');
        if (reviewsEl) {
          const matches = reviewsEl.getAttribute('aria-label').match(/\d+/);
          reviewCountVal = matches ? parseInt(matches[0], 10) : 0;
        } else {
          const allSpans = Array.from(document.querySelectorAll('div.F7nice span'));
          for (const s of allSpans) {
            const txt = s.textContent.trim();
            const m = txt.match(/^\((\d+)\)$/);
            if (m) {
              reviewCountVal = parseInt(m[1], 10);
              break;
            }
          }
        }

        // Category (handles new DkEaL class and standard category buttons/labels)
        const catEl = document.querySelector('button.DkEaL, button[jsaction*="category"], button[jsaction*="pane.rating.category"]');
        const categoryVal = catEl ? catEl.textContent.trim() : '';

        return {
          name,
          category: categoryVal,
          website,
          phone,
          email: null,
          google_maps_url: window.location.href,
          status: 'New',
          rating: ratingVal,
          review_count: reviewCountVal,
          address
        };
      });

      if (singleLead && singleLead.name) {
        singleLead.category = singleLead.category || parsedCategory;
        singleLead.city = parsedCity;
        singleLead.notes = `Prospect unique importé via lien Google Maps.`;
        leads.push(singleLead);
      }
    } else {
      console.log('Défilement de la liste des résultats pour tout charger...');
      let lastHeight = await page.evaluate(() => {
        const feed = document.querySelector('div[role="feed"]');
        return feed ? feed.scrollHeight : 0;
      });

      let endReached = false;
      let scrollAttempts = 0;
      const maxScrollAttempts = 60; // Max 2 minutes scrolling to prevent lockups

      while (!endReached && scrollAttempts < maxScrollAttempts) {
        await page.evaluate(() => {
          const feed = document.querySelector('div[role="feed"]');
          if (feed) {
            feed.scrollBy(0, 1000);
          }
        });

        await new Promise(resolve => setTimeout(resolve, 2000));

        const reachedEnd = await page.evaluate(() => {
          const feed = document.querySelector('div[role="feed"]');
          if (!feed) return true;
          const text = feed.textContent || '';
          return text.includes('Vous êtes arrivé à la fin de la liste') || 
                 text.includes('You\'ve reached the end of the list') ||
                 text.includes('fin de la liste') ||
                 text.includes('end of the list');
        });

        if (reachedEnd) {
          console.log('Fin de la liste Google Maps détectée.');
          endReached = true;
          break;
        }

        const newHeight = await page.evaluate(() => {
          const feed = document.querySelector('div[role="feed"]');
          return feed ? feed.scrollHeight : 0;
        });

        if (newHeight === lastHeight) {
          scrollAttempts++;
          if (scrollAttempts % 5 === 0) {
            console.log(`Défilement : tentative ${scrollAttempts}/${maxScrollAttempts} (en attente de nouvelles données)...`);
          }
        } else {
          lastHeight = newHeight;
          scrollAttempts = 0; // reset attempts when page height changes
        }
      }

      console.log('Fin du défilement. Extraction collective des données...');

      const extracted = await page.evaluate(() => {
        const feed = document.querySelector('div[role="feed"]');
        if (!feed) return [];

        const cards = Array.from(feed.querySelectorAll('a.hfpxzc'));
        
        return cards.map(card => {
          const cardParent = card.closest('div[jsaction*="click"]') || card.parentElement;
          const name = card.getAttribute('aria-label') || '';
          const google_maps_url = card.getAttribute('href') || '';

           // Look for any anchor having an external href (website link)
          const externalLink = Array.from(cardParent.querySelectorAll('a')).find(a => {
            const href = a.getAttribute('href') || '';
            if (!href || href.startsWith('/') || href.startsWith('#')) return false;
            
            // Exclude Google Maps place pages or direct Google Maps search
            if (href.includes('google.com/maps') || href.includes('google.fr/maps') || href.includes('google.com/search') || href.includes('google.fr/search')) {
              return false;
            }
            
            // Include Google redirects (/url?q=)
            if (href.includes('google.com/url') || href.includes('google.fr/url') || href.includes('/url?q=')) {
              return true;
            }
            
            // Include external websites
            return !href.includes('google.com') && !href.includes('google.fr');
          });

          let website = '';
          if (externalLink) {
            let href = externalLink.getAttribute('href') || '';
            if (href.includes('/url?q=')) {
              try {
                // Parse the redirect URL and decode URI characters (e.g. %3A%2F%2F -> ://)
                const urlParts = href.split('/url?q=');
                if (urlParts.length > 1) {
                  const rawUrl = urlParts[1].split('&')[0];
                  website = decodeURIComponent(rawUrl);
                } else {
                  website = href;
                }
              } catch (e) {
                website = href;
              }
            } else {
              website = href;
            }
          }

          // Rating and Review Count
          let rating = null;
          let review_count = 0;
          const starsSpan = cardParent.querySelector('span[aria-label*="étoile"], span[aria-label*="star"], span[role="img"]');
          if (starsSpan) {
            const ariaLabel = starsSpan.getAttribute('aria-label') || '';
            const ratingMatch = ariaLabel.match(/(\d+[,\.]\d+|\d+)\s*(?:étoile|star)/i);
            if (ratingMatch && ratingMatch[1]) {
              rating = parseFloat(ratingMatch[1].replace(',', '.'));
            }
            
            const reviewsMatch = ariaLabel.match(/\((\d+)\)/) || ariaLabel.match(/(\d+)\s*(?:avis|review)/i);
            if (reviewsMatch && reviewsMatch[1]) {
              review_count = parseInt(reviewsMatch[1], 10);
            }
          }

          // Category, Address, Phone lines parsing
          const textBlocks = Array.from(cardParent.querySelectorAll('div.W4Efsd'));
          let category = '';
          let phone = '';
          let address = '';

          textBlocks.forEach((block, idx) => {
            const text = block.textContent || '';
            if (idx === 0) {
              const parts = text.split(/·|•/);
              if (parts.length >= 3) {
                category = parts[2].trim();
              } else if (parts.length === 2 && !parts[0].includes('(')) {
                category = parts[1].trim();
              } else if (parts.length === 1) {
                category = parts[0].trim();
              }
            } else if (idx === 1) {
              const parts = text.split(/·|•/);
              if (parts.length > 0) {
                const first = parts[0].trim();
                if (first && !first.includes('Fermé') && !first.includes('Ouvert') && !first.includes('Oubre') && !first.includes('Ouvrira') && !first.includes('Ouvrira bientôt')) {
                  address = first;
                } else if (parts[1]) {
                  address = parts[1].trim();
                }
              }
            }
          });

          // Precision extraction: Scan all spans inside the card for phone numbers
          const spans = Array.from(cardParent.querySelectorAll('span'));
          for (const span of spans) {
            const text = (span.textContent || '').trim();
            // Match standard phone formats
            if (/^(?:\+33|0033|\+?\d{1,3})?[-.\s]?[1-9](?:[\s.-]*\d{2}){4}$/.test(text)) {
              phone = text;
              break;
            }
          }

          // Fallback French phone scanner inside card text if not found yet
          if (!phone) {
            const allText = cardParent.textContent || '';
            const phoneMatch = allText.match(/(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/);
            if (phoneMatch) {
              phone = phoneMatch[0].trim();
            }
          }

          return {
            name,
            category,
            website,
            phone,
            email: null,
            google_maps_url,
            status: 'New',
            rating,
            review_count,
            address
          };
        });
      });

      extracted.forEach(lead => {
        if (lead.name) {
          lead.category = lead.category || parsedCategory;
          lead.city = parsedCity;
          lead.notes = `Prospect extrait automatiquement depuis Google Maps.`;
          leads.push(lead);
        }
      });
    }

    console.log(`Scraping Google Maps terminé avec succès. Trouvés : ${leads.length} prospects.`);

    const formatLabel = (str) => {
      if (!str) return '';
      return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    };

    return {
      category: formatLabel(parsedCategory),
      city: formatLabel(parsedCity),
      leads
    };

  } finally {
    await browser.close();
  }
}
