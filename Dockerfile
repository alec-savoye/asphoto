FROM nginx:1.29-alpine

# The stock nginx configuration is sufficient for this static placeholder.
COPY index.html styles.css /usr/share/nginx/html/

EXPOSE 80
