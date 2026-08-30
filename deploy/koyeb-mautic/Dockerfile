FROM mautic/mautic:5-apache

USER root
COPY start-koyeb.sh /usr/local/bin/start-koyeb.sh
RUN chmod +x /usr/local/bin/start-koyeb.sh

CMD ["/usr/local/bin/start-koyeb.sh"]
