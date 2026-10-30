#!/usr/bin/env bash
# The hosted image, checked the way Fly would run it. Needs a running Docker daemon. Builds the image, then checks:
# no scripts, tests, docs, packages or .env inside; a misconfigured container exits 1 with its problems; a configured
# one serves the allowlisted routes only, as the node user, with the server itself as PID 1, and owner-only files on
# the volume.
# Usage: scripts/test-image.sh [host-port]   (default 18080; nothing is pushed or deployed)
set -u
PORT="${1:-18080}"
cd "$(dirname "$0")/.."
TAG="align-hosted:local-test"
NAME="align-image-test-$$"
VOL="align-image-test-$$"
fails=0
ok() { if [ "$1" = 0 ]; then echo "PASS  $2"; else echo "FAIL  $2${3:+  -> $3}"; fails=$((fails + 1)); fi; }
cleanup() { docker rm -f "$NAME" "$NAME-bad" >/dev/null 2>&1; docker volume rm -f "$VOL" >/dev/null 2>&1; }
trap cleanup EXIT

# What must never be in the image: these top-level names in /app, and a .env file at ANY depth. find prints absolute
# paths (/app/lib/.env.local), so the .env rule matches the last path segment, not the whole line (Sean's #6 review).
forbidden() { # forbidden <ls -A /app listing> <find output>: exit 0 if anything forbidden is present
  printf '%s\n' "$1" | grep -qxE 'data|scripts|packages|test|docs|\.env(\..*)?' || printf '%s\n' "$2" | grep -qE '(^|/)\.env(\.[^/]*)?$'
}
# The matcher itself, without Docker: a nested .env must be caught, a clean image must not be.
forbidden "package.json" "/app/lib/.env.local"; ok $? "matcher: a nested /app/lib/.env.local is caught"
forbidden "package.json" "/srv/x/.env"; ok $? "matcher: a nested /srv/x/.env is caught"
forbidden $'package.json\n.env.production' ""; ok $? "matcher: a top-level .env.production is caught"
! forbidden $'package.json\nnode_modules\npublic' $'/app/lib/env.ts\n/app/.envrc-not'; ok $? "matcher: a clean listing passes (env.ts and .envrc-not are not .env files)"

docker info >/dev/null 2>&1 || { echo "test-image: no Docker daemon"; [ $fails = 0 ] && echo "test-image: matcher checks passed"; exit 2; }
docker build -q -t "$TAG" . >/dev/null || { echo "FAIL  docker build"; exit 1; }
echo "PASS  docker build"

listing="$(docker run --rm --entrypoint sh "$TAG" -c 'ls -A /app')"
envs="$(docker run --rm --entrypoint sh "$TAG" -c 'find / \( -name ".env" -o -name ".env.*" \) -not -path "/proc/*" -not -path "/sys/*" -not -path "*/node_modules/*" 2>/dev/null')"
forbidden "$listing" "$envs"; nobad=$?
# The listing must be real (it names package.json), or "none of these names" would pass on an empty listing.
printf '%s\n' "$listing" | grep -qx 'package.json' && [ "$nobad" -ne 0 ]; ok $? "the image has no data/, scripts/, packages/, test/, docs/ or .env at any depth" "$(echo "$listing $envs" | tr '\n' ' ')"

docker run --name "$NAME-bad" "$TAG" >/dev/null 2>&1
code="$(docker inspect -f '{{.State.ExitCode}}' "$NAME-bad")"
docker logs "$NAME-bad" 2>&1 | grep -q "HOSTED=1 refused to start"; refused=$?
[ "$code" = 1 ] && [ $refused = 0 ]; ok $? "a misconfigured container exits 1 and lists its problems" "exit=$code"

docker volume create "$VOL" >/dev/null
docker run -d --name "$NAME" -p "127.0.0.1:$PORT:8080" -v "$VOL:/data" \
  -e ALIGN_HOSTS=align.test -e ALIGN_PUBLIC_ORIGIN=https://align.test -e ALIGN_DELETE_BY="$(date -u -d '+30 days' +%F 2>/dev/null || date -u -v+30d +%F)" \
  -e ALIGN_SECRET="$(openssl rand -hex 24)" -e BETTER_AUTH_SECRET="$(openssl rand -hex 24)" \
  -e GITHUB_CLIENT_ID=image-test-id -e GITHUB_CLIENT_SECRET=image-test-secret \
  "$TAG" >/dev/null
EDGE=(-H 'host: align.test' -H 'x-forwarded-proto: https' -H 'fly-client-ip: 192.0.2.1')
B="http://127.0.0.1:$PORT"
for _ in $(seq 1 30); do curl -s -o /dev/null "${EDGE[@]}" "$B/api/v2/auth/get-session" && break; sleep 1; done
st() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

[ "$(st "${EDGE[@]}" "$B/api/v2/auth/get-session")" = 200 ]; ok $? "configured: the server answers (Better Auth's session route)"
[ "$(st -H 'host: evil.example' -H 'x-forwarded-proto: https' -H 'fly-client-ip: 192.0.2.1' "$B/api/v2/auth/get-session")" = 421 ]; ok $? "a wrong Host -> 421"
[ "$(st -H 'host: align.test' -H 'x-forwarded-proto: http' -H 'fly-client-ip: 192.0.2.1' "$B/api/v2/auth/get-session")" = 403 ]; ok $? "plain http -> 403"
[ "$(st -H 'host: align.test' -H 'x-forwarded-proto: https' "$B/api/v2/auth/get-session")" = 403 ]; ok $? "no Fly-Client-IP -> 403"
loc="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "${EDGE[@]}" "$B/")"
[ "$loc" = "307 https://align.test/app" ]; ok $? "/ -> 307 to https://align.test/app" "$loc"
[ "$(st "${EDGE[@]}" "$B/app/sign-in")" = 200 ]; ok $? "the sign-in page is served"
closed="$(for p in /setup /new /w/x /api/state /api/session /api/sessions/events /api/workspaces/config /api/directives; do st "${EDGE[@]}" "$B$p"; echo; done | sort -u | tr '\n' ' ')"
[ "$closed" = "404 " ]; ok $? "paths outside the allowlist (the retired v1 routes among them) -> 404" "$closed"
# Connected AI apps: the MCP endpoint asks for Align's OAuth sign-in, and the OAuth metadata names this host.
mcp="$(curl -s -o /dev/null -D - "${EDGE[@]}" -X POST "$B/api/mcp" | tr -d '\r' | grep -i '^www-authenticate:')"
echo "$mcp" | grep -q 'resource_metadata="https://align.test/.well-known/oauth-protected-resource/api/mcp"'; ok $? "MCP without a token -> 401 pointing at the OAuth metadata" "$mcp"
curl -s "${EDGE[@]}" "$B/.well-known/oauth-authorization-server" | grep -q '"issuer":"https://align.test"'; ok $? "the OAuth server metadata is served, issuer https://align.test"

proc="$(docker exec "$NAME" sh -c 'grep -m1 "^Name" /proc/1/status | cut -f2; grep -m1 "^Uid" /proc/1/status | cut -f2')"
echo "$proc" | head -1 | grep -q '^next-server' && [ "$(echo "$proc" | tail -1)" = 1000 ]; ok $? "PID 1 is the server itself, as the node user (uid 1000)" "$(echo "$proc" | tr '\n' ' ')"
modes="$(docker exec "$NAME" sh -c 'stat -c "%a %U" /data/.pid')"
[ "$modes" = "600 node" ]; ok $? "the pid file is on the volume, 0600, owned by node" "$modes"

echo
[ $fails = 0 ] && echo "test-image: all checks passed" || echo "test-image: $fails check(s) failed"
[ $fails = 0 ]
