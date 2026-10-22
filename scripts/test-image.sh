#!/usr/bin/env bash
# The hosted image, checked the way Fly would run it (Sean's PR #3 review, items 2, 3 and 10). Needs a running
# Docker daemon. Builds the image, then checks: no fixture, Sparta evidence, agent or test scripts or .env inside;
# a misconfigured container exits 1 with its problems; a configured one serves the tester routes only, as the
# node user, with the server itself as PID 1, and owner-only files on the volume.
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

docker info >/dev/null 2>&1 || { echo "test-image: no Docker daemon"; exit 2; }
docker build -q -t "$TAG" . >/dev/null || { echo "FAIL  docker build"; exit 1; }
echo "PASS  docker build"

inside="$(docker run --rm --entrypoint sh "$TAG" -c 'ls -A /app; ls /app/scripts; find / \( -name ".env" -o -name ".env.*" \) -not -path "/proc/*" -not -path "/sys/*" -not -path "*/node_modules/*" 2>/dev/null')"
echo "$inside" | grep -qxE 'data|sparta|agent|test|docs|\.env.*'; nobad=$?
# The listing must be real (it names package.json), or "none of these names" would pass on an empty listing.
echo "$inside" | grep -qx 'package.json' && [ "$nobad" -ne 0 ]; ok $? "the image has no data/, sparta/, agent/, test/, docs/ or .env" "$(echo "$inside" | tr '\n' ' ')"
[ "$(docker run --rm --entrypoint sh "$TAG" -c 'ls /app/scripts')" = "ws-admin.mjs" ]; ok $? "the only script in the image is ws-admin.mjs"

docker run --name "$NAME-bad" "$TAG" >/dev/null 2>&1
code="$(docker inspect -f '{{.State.ExitCode}}' "$NAME-bad")"
docker logs "$NAME-bad" 2>&1 | grep -q "HOSTED=1 refused to start"; refused=$?
[ "$code" = 1 ] && [ $refused = 0 ]; ok $? "a misconfigured container exits 1 and lists its problems" "exit=$code"

docker volume create "$VOL" >/dev/null
docker run -d --name "$NAME" -p "127.0.0.1:$PORT:8080" -v "$VOL:/data" \
  -e ALIGN_HOSTS=align.test -e ALIGN_SECRET="$(openssl rand -hex 24)" -e ALIGN_SIGNUP_CODES=image-invite-0001 -e ALIGN_DELETE_BY=2026-11-06 \
  -e ALIGN_PRODUCT_PASSCODE="$(openssl rand -hex 8)" -e ALIGN_SECURITY_PASSCODE="$(openssl rand -hex 8)" -e ALIGN_LEADERSHIP_PASSCODE="$(openssl rand -hex 8)" \
  "$TAG" >/dev/null
EDGE=(-H 'host: align.test' -H 'x-forwarded-proto: https' -H 'fly-client-ip: 192.0.2.1')
B="http://127.0.0.1:$PORT"
for _ in $(seq 1 30); do curl -s -o /dev/null "${EDGE[@]}" "$B/api/workspaces/config" && break; sleep 1; done
st() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

[ "$(st "${EDGE[@]}" "$B/api/workspaces/config")" = 200 ]; ok $? "configured: the tester config answers"
[ "$(st -H 'host: evil.example' -H 'x-forwarded-proto: https' -H 'fly-client-ip: 192.0.2.1' "$B/api/workspaces/config")" = 421 ]; ok $? "a wrong Host -> 421"
[ "$(st -H 'host: align.test' -H 'x-forwarded-proto: http' -H 'fly-client-ip: 192.0.2.1' "$B/api/workspaces/config")" = 403 ]; ok $? "plain http -> 403"
[ "$(st -H 'host: align.test' -H 'x-forwarded-proto: https' "$B/api/workspaces/config")" = 403 ]; ok $? "no Fly-Client-IP -> 403"
[ "$(st "${EDGE[@]}" "$B/")" = 307 ]; ok $? "/ -> 307 to /new"
ns="$(st "${EDGE[@]}" -H 'content-type: application/json' -d '{"role":"product","passcode":"product-demo"}' "$B/api/session")"
[ "$ns" = 404 ]; ok $? "Northstar sign-in -> 404" "$ns"
closed="$(for p in /api/mcp /api/policy/security /api/evidence/x /api/sessions /api/sessions/events /api/simulations /api/directives /api/org/push; do st "${EDGE[@]}" "$B$p"; echo; done | sort -u | tr '\n' ' ')"
[ "$closed" = "404 " ]; ok $? "MCP, policy, evidence, sessions, capture, simulations, directives, org push -> 404" "$closed"

proc="$(docker exec "$NAME" sh -c 'grep -m1 "^Name" /proc/1/status | cut -f2; grep -m1 "^Uid" /proc/1/status | cut -f2')"
echo "$proc" | head -1 | grep -q '^next-server' && [ "$(echo "$proc" | tail -1)" = 1000 ]; ok $? "PID 1 is the server itself, as the node user (uid 1000)" "$(echo "$proc" | tr '\n' ' ')"
modes="$(docker exec "$NAME" sh -c 'stat -c "%a %U" /data/.pid')"
[ "$modes" = "600 node" ]; ok $? "the pid file is on the volume, 0600, owned by node" "$modes"

echo
[ $fails = 0 ] && echo "test-image: all checks passed" || echo "test-image: $fails check(s) failed"
[ $fails = 0 ]
