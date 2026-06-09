import sys
import json
import argparse
import re
import time
from urllib.parse import urlparse
import requests
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

# Regex to validate email
EMAIL_REGEX = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}')

def parse_args():
    parser = argparse.ArgumentParser(description="Google Maps Business Lead Scraper")
    parser.add_argument("--category", type=str, required=True, help="Category of business (e.g. Plombier)")
    parser.add_argument("--city", type=str, required=True, help="City in France (e.g. Nantes)")
    parser.add_argument("--radius", type=int, default=5, help="Radius in kilometers (for logging)")
    return parser.parse_args()

def clean_social_url(url):
    if not url:
        return None
    url = url.strip()
    if url.startswith('//'):
        url = 'https:' + url
    elif not url.startswith('http'):
        url = 'https://' + url
    return url

def audit_website(url):
    result = {
        "has_ssl": 0,
        "is_mobile_friendly": 0,
        "has_chat_widget": 0,
        "social_handles": {},
        "tech_stack": None,
        "load_time_ms": None,
        "email": None
    }
    
    if not url:
        return result

    # Normalize URL
    target_url = url.strip()
    if not re.match(r'^https?://', target_url, re.IGNORECASE):
        target_url = 'http://' + target_url

    result["has_ssl"] = 1 if target_url.lower().startswith('https') else 0

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    try:
        start_time = time.time()
        response = requests.get(target_url, headers=headers, timeout=5, allow_redirects=True)
        load_time = int((time.time() - start_time) * 1000)
        result["load_time_ms"] = load_time
        
        if response.status_code != 200:
            return result

        html = response.text
        soup = BeautifulSoup(html, 'html.parser')

        # SSL updated detection (if redirected to https)
        if response.url.lower().startswith('https'):
            result["has_ssl"] = 1

        # 1. Mobile friendliness (viewport tag verification)
        viewport = soup.find('meta', attrs={'name': 'viewport'})
        if viewport and 'width=device-width' in viewport.get('content', ''):
            result["is_mobile_friendly"] = 1

        # 2. Email scraping from homepage text & mailto links
        emails = set()
        # mailto links
        for a in soup.find_all('a', href=True):
            href = a['href']
            if href.lower().startswith('mailto:'):
                email = href.split('?')[0].replace('mailto:', '').strip()
                if EMAIL_REGEX.match(email):
                    emails.add(email)

        # Regex on text
        matches = EMAIL_REGEX.findall(html)
        for email in matches:
            if not email.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.css', '.js')):
                emails.add(email.strip())

        if emails:
            result["email"] = list(emails)[0]

        # 3. Social Media links
        socials = {}
        for a in soup.find_all('a', href=True):
            href = a['href']
            if 'facebook.com' in href.lower() and 'facebook' not in socials:
                socials['facebook'] = clean_social_url(href)
            if 'instagram.com' in href.lower() and 'instagram' not in socials:
                socials['instagram'] = clean_social_url(href)
            if 'linkedin.com' in href.lower() and 'linkedin' not in socials:
                socials['linkedin'] = clean_social_url(href)
            if ('twitter.com' in href.lower() or 'x.com' in href.lower()) and 'twitter' not in socials:
                socials['twitter'] = clean_social_url(href)

        result["social_handles"] = socials

        # 4. Chat widgets
        chat_signatures = ['crisp.chat', 'intercom', 'tawk.to', 'calendly', 'drift', 'hubspot']
        for sig in chat_signatures:
            if sig in html.lower():
                result["has_chat_widget"] = 1
                break

        # 5. Tech stack detection
        meta_generator = soup.find('meta', attrs={'name': 'generator'})
        meta_content = meta_generator.get('content', '') if meta_generator else ''
        
        tech_patterns = [
            ("WordPress", r'wordpress'),
            ("Wix", r'wix\.com'),
            ("Squarespace", r'squarespace'),
            ("Shopify", r'shopify'),
            ("Webflow", r'webflow')
        ]
        
        for name, pattern in tech_patterns:
            if re.search(pattern, meta_content, re.IGNORECASE) or re.search(pattern, html, re.IGNORECASE):
                result["tech_stack"] = name
                break

    except Exception as e:
        # Gracefully handle download errors, keeping default 0s
        pass

    return result

def scrape_google_maps(category, city, radius):
    query = f"{city} {category}"
    search_url = f"https://www.google.com/maps/search/{query.replace(' ', '+')}/"
    
    leads = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        print(f"Scraper: Navigating to Google Maps search page for '{query}'...", file=sys.stderr)
        page.goto(search_url)
        page.wait_for_timeout(3000)

        # Cookie consent bypass
        try:
            # Look for "Tout accepter" (French) or "Accept all" button
            consent_selectors = [
                'button:has-text("Tout accepter")',
                'button:has-text("Tout autoriser")',
                'button:has-text("Accept all")',
                'form[action*="consent"] button',
                'div[role="dialog"] button:has-text("Accepter")'
            ]
            for selector in consent_selectors:
                loc = page.locator(selector)
                if loc.count() > 0:
                    loc.first.click()
                    print("Scraper: Cookies accepted.", file=sys.stderr)
                    page.wait_for_timeout(2000)
                    break
        except Exception as e:
            print(f"Scraper: Cookie check skipped or failed: {str(e)}", file=sys.stderr)

        # Scroll the left pane to load items
        try:
            # The list container is usually div[role="feed"]
            feed_selector = 'div[role="feed"]'
            page.wait_for_selector(feed_selector, timeout=10000)
            feed = page.locator(feed_selector).first

            print("Scraper: Scrolling results pane to collect leads...", file=sys.stderr)
            
            # Scroll multiple times to load items
            last_count = 0
            no_new_results_count = 0
            
            for scroll_step in range(15):
                # Scroll the feed down
                feed.evaluate("element => element.scrollBy(0, 5000)")
                page.wait_for_timeout(1500)
                
                # Check loaded items count
                item_count = page.locator('a[href*="/maps/place/"]').count()
                if item_count == last_count:
                    no_new_results_count += 1
                    if no_new_results_count >= 3:
                        break
                else:
                    no_new_results_count = 0
                
                last_count = item_count
                
                # Stop scrolling if we have enough leads (e.g. 40 leads to respect memory and speed limits)
                if last_count >= 40:
                    break

        except Exception as e:
            print(f"Scraper: Scrolling results failed (possibly singular result page): {str(e)}", file=sys.stderr)

        # Gather card selectors
        cards = page.locator('a[href*="/maps/place/"]')
        count = cards.count()
        print(f"Scraper: Found {count} business listings on page.", file=sys.stderr)

        # Collect basic info of all items to avoid DOM detachments during details navigation
        items_raw = []
        for i in range(count):
            try:
                card = cards.nth(i)
                maps_url = card.get_attribute('href')
                name = card.get_attribute('aria-label')
                
                if name and maps_url:
                    items_raw.append({
                        "name": name,
                        "maps_url": maps_url
                    })
            except Exception:
                continue

        # Extract details for each lead
        for idx, item in enumerate(items_raw):
            try:
                print(f"Scraper: Extracting detail for lead {idx+1}/{len(items_raw)}: {item['name']}", file=sys.stderr)
                
                # Navigate to the specific place detail view
                page.goto(item['maps_url'])
                page.wait_for_timeout(2000)

                # Parse detail elements
                name = item['name']
                maps_url = item['maps_url']
                website = None
                phone = None
                address = None
                rating = None
                review_count = 0

                # 1. Website
                try:
                    # Look for button with website icon/globe or specific data-item-id="authority"
                    web_loc = page.locator('a[data-item-id="authority"]').first
                    if web_loc.count() > 0:
                        website = web_loc.get_attribute('href')
                except Exception:
                    pass

                # 2. Phone
                try:
                    # Look for data-item-id starting with phone:tel:
                    phone_loc = page.locator('button[data-item-id^="phone:tel:"]').first
                    if phone_loc.count() > 0:
                        phone = phone_loc.get_attribute('data-item-id').replace('phone:tel:', '').strip()
                except Exception:
                    pass

                # 3. Address
                try:
                    addr_loc = page.locator('button[data-item-id="address"]').first
                    if addr_loc.count() > 0:
                        address = addr_loc.get_attribute('aria-label').replace('Adresse: ', '').strip()
                except Exception:
                    pass

                # 4. Rating and reviews
                try:
                    # Maps detail view contains rating in a span like "4,6" and review count "87 avis"
                    # We can target classes or roles
                    rating_loc = page.locator('div.F7nice span[aria-hidden="true"]').first
                    if rating_loc.count() > 0:
                        rating_text = rating_loc.inner_text().replace(',', '.')
                        rating = float(rating_text)
                    
                    reviews_loc = page.locator('div.F7nice button.HHrUfc').first
                    if reviews_loc.count() > 0:
                        reviews_text = reviews_loc.inner_text()
                        # Extract digits
                        digits = re.findall(r'\d+', reviews_text.replace(' ', ''))
                        if digits:
                            review_count = int(digits[0])
                except Exception:
                    pass

                # Build the lead structure
                lead = {
                    "name": name,
                    "category": category,
                    "city": city,
                    "website": website,
                    "phone": phone,
                    "address": address,
                    "google_maps_url": maps_url,
                    "rating": rating,
                    "review_count": review_count,
                    "status": "New"
                }

                # Perform Digital Audit if website exists
                if website:
                    print(f"Scraper: Auditing website {website}...", file=sys.stderr)
                    audit = audit_website(website)
                    lead.update(audit)
                    
                    # Store social handles as JSON string
                    lead["social_handles"] = json.dumps(audit.get("social_handles", {}))
                else:
                    lead.update({
                        "has_ssl": 0,
                        "is_mobile_friendly": 0,
                        "has_chat_widget": 0,
                        "social_handles": json.dumps({}),
                        "tech_stack": None,
                        "load_time_ms": None,
                        "email": None
                    })

                leads.append(lead)

            except Exception as e:
                print(f"Scraper: Error parsing lead index {idx}: {str(e)}", file=sys.stderr)

        browser.close()
    
    return leads

def main():
    args = parse_args()
    
    try:
        leads = scrape_google_maps(args.category, args.city, args.radius)
        # Print leads as JSON on stdout
        print(json.dumps(leads, indent=2, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
