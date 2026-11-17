#!/bin/sh

set -eu

# 后台启动 PHP-FPM；启动失败时容器应直接退出。
php-fpm -D
# Nginx 保持前台运行，接收云托管的停止信号。
exec nginx -g 'daemon off;'
