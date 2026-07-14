FROM nginx:1.29-alpine

# The stock nginx configuration is sufficient for this static placeholder.
COPY index.html styles.css ripple.js wake.js elusive.js /usr/share/nginx/html/
COPY assets /usr/share/nginx/html/assets

EXPOSE 80
