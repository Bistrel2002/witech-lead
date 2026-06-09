# Use Playwright base image (Ubuntu jammy with preinstalled browser deps)
FROM mcr.microsoft.com/playwright:v1.44.0-jammy

WORKDIR /app

# Copy dependency configs
COPY package*.json ./

# Install Node packages
RUN npm install

# Install Python and build virtual environment (matching local structure)
RUN apt-get update && apt-get install -y python3-venv python3-pip && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv venv
RUN ./venv/bin/pip install --upgrade pip
RUN ./venv/bin/pip install playwright beautifulsoup4 requests
RUN ./venv/bin/playwright install chromium

# Copy backend files
COPY . .

EXPOSE 3001

CMD ["npm", "start"]
