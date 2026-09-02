# Backend API — Node 20 on Debian slim.
#
# Slim rather than Alpine: pg and bcryptjs build against glibc without the
# extra toolchain Alpine needs for their native parts.
FROM node:20-slim

# Puppeteer is declared in package.json but never imported anywhere in
# backend/src — the scraping path uses axios + cheerio. Skipping its browser
# download keeps roughly 170 MB of Chromium out of the image. Remove this if
# the scraper is ever rewritten to drive a real browser.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    NODE_ENV=production

WORKDIR /app

# Dependencies first, so a source change does not reinstall everything.
COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3001

# Not `npm start`: node as PID 1 receives SIGTERM directly, so the container
# stops promptly instead of waiting out Docker's kill timeout.
CMD ["node", "src/index.js"]
