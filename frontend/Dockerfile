FROM caddy:alpine

EXPOSE 80
WORKDIR /var/www/html

COPY src/ .
COPY docker/Caddyfile.tpl /etc/Caddyfile.tpl
COPY docker/entrypoint.sh /entrypoint.sh

CMD ["/bin/sh", "/entrypoint.sh"]
