#!/bin/sh
# Git credential helper: supplies GITHUB_USER/PUSH_TOKEN from the repo's .env (never committed).
[ "$1" = "get" ] || exit 0
env_file="$(git rev-parse --show-toplevel)/.env"
[ -f "$env_file" ] || exit 0
val() { grep -E "^$1=" "$env_file" | tail -n1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'; }
token="$(val PUSH_TOKEN)"
[ -n "$token" ] || exit 0
echo "username=$(val GITHUB_USER)"
echo "password=$token"
