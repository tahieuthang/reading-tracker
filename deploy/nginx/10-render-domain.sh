#!/bin/sh
set -eu

: "${DOMAIN:?DOMAIN must be set}"
sed "s|__DOMAIN__|${DOMAIN}|g" /opt/nginx/default.conf.template > /etc/nginx/conf.d/default.conf
