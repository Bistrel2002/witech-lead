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
    parser.add_argument("--radius", type=int, default=5, help="Radius in kilometers")
    parser.add_argument("--limit", type=int, default=50, help="Max number of leads to scrape")
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
        "social_handles": {},
        "email": None
    }
    
    if not url:
        return result

    # Normalize URL
    target_url = url.strip()
    if not re.match(r'^https?://', target_url, re.IGNORECASE):
        target_url = 'http://' + target_url

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    try:
        response = requests.get(target_url, headers=headers, timeout=5, allow_redirects=True)
        if response.status_code != 200:
            return result

        html = response.text
        soup = BeautifulSoup(html, 'html.parser')

        # 1. Email scraping from homepage text & mailto links
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

        # 2. Social Media links
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

    except Exception:
        # Gracefully ignore crawling failures
        pass

    return result

def scrape_google_maps(category, city, radius, limit):
    leads = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        # Determine initial URL
        if radius and radius > 0:
            print(f"Scraper: Locating coordinates for city '{city}' to apply {radius}km radius...", file=sys.stderr)
            initial_url = f"https://www.google.com/maps/place/{city.replace(' ', '+')}/"
        else:
            initial_url = f"https://www.google.com/maps/search/{category.replace(' ', '+')}+{city.replace(' ', '+')}/"

        page.goto(initial_url)
        page.wait_for_timeout(3000)

        # Cookie consent bypass
        try:
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

        # Radius query routing using coordinates if applicable
        search_url = None
        if radius and radius > 0:
            # Let the URL resolve/load the city place to get coordinates in URL
            for attempt in range(5):
                current_url = page.url
                match = re.search(r"@(-?\d+\.\d+),(-?\d+\.\d+)", current_url)
                if match:
                    lat, lng = match.group(1), match.group(2)
                    # Determine zoom level based on radius:
                    # 15z: ~2km, 14z: ~5km, 13z: ~10km, 12z: ~20km, 11z: ~50km
                    zoom = 13
                    if radius <= 2:
                        zoom = 15
                    elif radius <= 5:
                        zoom = 14
                    elif radius <= 10:
                        zoom = 13
                    elif radius <= 20:
                        zoom = 12
                    else:
                        zoom = 11
                    
                    search_url = f"https://www.google.com/maps/search/{category.replace(' ', '+')}/@{lat},{lng},{zoom}z/"
                    print(f"Scraper: Found city coordinates {lat},{lng}. Searching category '{category}' in viewport with zoom {zoom}z (~{radius}km radius)...", file=sys.stderr)
                    break
                page.wait_for_timeout(1000)
            
            if not search_url:
                print("Scraper: Could not parse coordinates from URL. Falling back to text query.", file=sys.stderr)
                search_url = f"https://www.google.com/maps/search/{category.replace(' ', '+')}+{city.replace(' ', '+')}/"
            
            # Navigate to the actual search URL
            page.goto(search_url)
            page.wait_for_timeout(3000)

        # Scroll feed pane to load target amount of elements
        try:
            feed_selector = 'div[role="feed"]'
            page.wait_for_selector(feed_selector, timeout=10000)
            feed = page.locator(feed_selector).first

            print("Scraper: Scrolling results pane to collect leads...", file=sys.stderr)
            
            last_count = 0
            no_new_results_count = 0
            
            for scroll_step in range(100):
                # Count current cards
                item_count = page.locator('a[href*="/maps/place/"]').count()
                if item_count >= limit:
                    print(f"Scraper: Loaded {item_count} results, which satisfies limit of {limit}.", file=sys.stderr)
                    break
                    
                # Scroll the feed down
                feed.evaluate("element => element.scrollBy(0, 5000)")
                page.wait_for_timeout(1000)
                
                if item_count == last_count:
                    no_new_results_count += 1
                    if no_new_results_count >= 5:
                        print("Scraper: Reached end of maps results feed.", file=sys.stderr)
                        break
                else:
                    no_new_results_count = 0
                
                last_count = item_count
        except Exception as e:
            print(f"Scraper: Feed scrolling bypass (possibly singular result page): {str(e)}", file=sys.stderr)

        # Gather card selectors
        cards = page.locator('a[href*="/maps/place/"]')
        count = cards.count()
        print(f"Scraper: Found {count} business listings on maps page.", file=sys.stderr)

        # Collect basic info of all items to avoid DOM detachments
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

        # Enforce maximum scrape limit
        items_raw = items_raw[:limit]

        # Extract details for each lead using optimized in-page clicks
        for idx, item in enumerate(items_raw):
            try:
                print(f"Scraper: Extracting detail for lead {idx+1}/{len(items_raw)}: {item['name']}", file=sys.stderr)
                
                # Locate card element by index and click
                card_element = page.locator('a[href*="/maps/place/"]').nth(idx)
                card_element.scroll_into_view_if_needed()
                card_element.click()
                
                # Wait for detail pane to load in the UI
                page.wait_for_timeout(1200)

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
                    web_loc = page.locator('a[data-item-id="authority"]').first
                    if web_loc.count() > 0:
                        website = web_loc.get_attribute('href')
                except Exception:
                    pass

                # 2. Phone
                try:
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
                    rating_loc = page.locator('div.F7nice span[aria-hidden="true"]').first
                    if rating_loc.count() > 0:
                        rating_text = rating_loc.inner_text().replace(',', '.')
                        rating = float(rating_text)
                    
                    reviews_loc = page.locator('div.F7nice button.HHrUfc').first
                    if reviews_loc.count() > 0:
                        reviews_text = reviews_loc.inner_text()
                        digits = re.findall(r'\d+', reviews_text.replace(' ', ''))
                        if digits:
                            review_count = int(digits[0])
                except Exception:
                    pass

                # Build lead dictionary
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

                # Retrieve emails and social handles from website
                if website:
                    print(f"Scraper: Crawling website {website}...", file=sys.stderr)
                    audit = audit_website(website)
                    lead.update(audit)
                    lead["social_handles"] = json.dumps(audit.get("social_handles", {}))
                else:
                    lead.update({
                        "social_handles": json.dumps({}),
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
        leads = scrape_google_maps(args.category, args.city, args.radius, args.limit)
        # Output leads JSON on stdout
        print(json.dumps(leads, indent=2, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
