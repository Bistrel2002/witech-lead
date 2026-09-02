# Frontend — built to static files, served by nginx.
#
# Two entry points come out of the build: index.html is the public vitrine,
# app.html is the application. nginx.conf routes accordingly.
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

# Baked in at build time, not read at runtime: Vite inlines import.meta.env
# into the bundle. Changing where the API lives means rebuilding this image.
ARG VITE_API_URL=http://localhost:3001
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
