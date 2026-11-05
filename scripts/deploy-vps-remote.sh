#!/usr/bin/env bash
set -euo pipefail
umask 077

infra_dir="/home/senna/Projects/infra"
state_dir="$infra_dir/.runtime/good-apollo"
env_file="$infra_dir/.env.runtime"

read -r action image_tag commit extra <<< "${SSH_ORIGINAL_COMMAND:-}"
if [[ "$action" != "deploy" || -n "${extra:-}" ||
      ! "$image_tag" =~ ^gag-commerce:[A-Za-z0-9][A-Za-z0-9._-]{5,80}$ ||
      ! "$commit" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Rejected command. Use the reviewed local deploy script from clean main." >&2
  exit 2
fi

mkdir -p "$state_dir/backups"
exec 9>"$state_dir/deploy.lock"
if ! flock -n 9; then
  echo "Another Good Apollo release is already running." >&2
  exit 3
fi

work_dir="$(mktemp -d "$state_dir/build.XXXXXXXX")"
cleanup() {
  if [[ -n "${old_container:-}" ]]; then
    docker rm -f "$old_container" >/dev/null 2>&1 || true
  fi
  rm -rf "$work_dir"
}
trap cleanup EXIT

archive="$work_dir/source.tar"
source_dir="$work_dir/source"
mkdir "$source_dir"
cat > "$archive"
archive_bytes="$(wc -c < "$archive" | tr -d ' ')"
if (( archive_bytes > 262144000 )); then
  echo "Source archive exceeds the 250 MiB limit." >&2
  exit 4
fi

if tar -tf "$archive" | awk 'BEGIN{bad=0} /^\// || /(^|\/)\.\.($|\/)/ {bad=1} END{exit !bad}'; then
  echo "Source archive contains an unsafe path." >&2
  exit 4
fi
tar -xf "$archive" --no-same-owner --no-same-permissions -C "$source_dir"
for required in Dockerfile .dockerignore prisma/migrations certs/shared-postgres-ca.crt; do
  if [[ ! -e "$source_dir/$required" ]]; then
    echo "Source archive is missing $required." >&2
    exit 4
  fi
done

cd "$infra_dir"
compose=(docker compose --env-file "$env_file" \
  -f docker-compose.yaml \
  -f docker-compose.mautic-delivery.yaml \
  -f docker-compose.good-apollo.yaml)

old_tag="$(awk -F= '$1=="GOOD_APOLLO_IMAGE_TAG" {print substr($0,index($0,"=")+1)}' "$env_file")"
old_tag="gag-commerce:$old_tag"
if [[ ! "$old_tag" =~ ^gag-commerce:[A-Za-z0-9][A-Za-z0-9._-]{5,80}$ ]]; then
  echo "Could not read exactly one valid current Good Apollo image tag." >&2
  exit 5
fi
if [[ "$(awk -F= '$1=="GOOD_APOLLO_IMAGE_TAG" {n++} END{print n+0}' "$env_file")" != "1" ]]; then
  echo "The Good Apollo image tag must occur exactly once in the private runtime file." >&2
  exit 5
fi
if ! docker image inspect "$old_tag" >/dev/null 2>&1; then
  echo "Current image $old_tag is not present locally; refusing a release without rollback." >&2
  exit 5
fi
if docker image inspect "$image_tag" >/dev/null 2>&1; then
  echo "Image tag $image_tag already exists; refusing to overwrite a release." >&2
  exit 5
fi

# This deploy path accepts UI/application releases only. Schema changes require
# the separate, reviewed migration and backup procedure.
old_container="$(docker create "$old_tag")"
mkdir "$work_dir/old-migrations"
docker cp "$old_container:/app/prisma/migrations/." "$work_dir/old-migrations/"
docker rm "$old_container" >/dev/null
old_container=""
if ! diff -qr "$work_dir/old-migrations" "$source_dir/prisma/migrations" >/dev/null; then
  echo "Prisma migrations differ from production. Use the reviewed migration release path." >&2
  exit 6
fi

docker build --platform linux/amd64 \
  --label "org.opencontainers.image.revision=$commit" \
  --tag "$image_tag" "$source_dir"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
env_backup="$state_dir/backups/env-runtime-before-$timestamp"
cp -p "$env_file" "$env_backup"
chmod 600 "$env_backup"

set_image_tag() {
  local value="$1"
  GOOD_APOLLO_TAG="$value" GOOD_APOLLO_ENV_FILE="$env_file" python3 - <<'PY'
import os
import pathlib
import re
import stat
import tempfile

path = pathlib.Path(os.environ["GOOD_APOLLO_ENV_FILE"])
tag = os.environ["GOOD_APOLLO_TAG"]
if not re.fullmatch(r"gag-commerce:[A-Za-z0-9][A-Za-z0-9._-]{5,80}", tag):
    raise SystemExit("Invalid image tag")
data = path.read_text()
pattern = re.compile(r"(?m)^GOOD_APOLLO_IMAGE_TAG=.*$")
if len(pattern.findall(data)) != 1:
    raise SystemExit("Expected one GOOD_APOLLO_IMAGE_TAG setting")
updated = pattern.sub("GOOD_APOLLO_IMAGE_TAG=" + tag.removeprefix("gag-commerce:"), data, count=1)
fd, temporary = tempfile.mkstemp(prefix=".good-apollo-env.", dir=path.parent)
try:
    with os.fdopen(fd, "w") as output:
        output.write(updated)
        output.flush()
        os.fsync(output.fileno())
    os.chmod(temporary, stat.S_IMODE(path.stat().st_mode))
    os.replace(temporary, path)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
PY
}

rollback() {
  echo "Restoring previous image $old_tag" >&2
  set_image_tag "$old_tag"
  if "${compose[@]}" up -d --no-deps --force-recreate good-apollo-web; then
    echo "Previous image restored. Runtime config backup: $env_backup" >&2
  else
    echo "Automatic rollback failed. Runtime config backup: $env_backup" >&2
    return 1
  fi
}

set_image_tag "$image_tag"
# Consume the full service list: grep -q can close the pipe early and make
# Compose fail under pipefail even when the service was found.
if ! "${compose[@]}" config --services | grep -Fx good-apollo-web >/dev/null; then
  rollback
  echo "Good Apollo Compose service validation failed." >&2
  exit 7
fi
if ! "${compose[@]}" up -d --no-deps --force-recreate good-apollo-web; then
  rollback
  exit 8
fi

home_status=""
admin_status=""
for _ in $(seq 1 24); do
  home_status="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' https://goodapollogoods.com/ || true)"
  admin_status="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' https://goodapollogoods.com/admin/sign-in/ || true)"
  if [[ "$home_status" == "200" && "$admin_status" == "200" ]]; then
    break
  fi
  sleep 5
done

runtime_flags="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' good-apollo-web)"
sales="$(printf '%s\n' "$runtime_flags" | awk -F= '$1=="SALES_ENABLED"{print $2}')"
newsletter="$(printf '%s\n' "$runtime_flags" | awk -F= '$1=="NEWSLETTER_ENABLED"{print $2}')"
if [[ "$home_status" != "200" || "$admin_status" != "200" ||
      "$sales" != "false" || "$newsletter" != "false" ]]; then
  rollback
  echo "Post-deploy checks failed (home=$home_status admin=$admin_status sales=$sales newsletter=$newsletter)." >&2
  exit 9
fi

echo "Deployed $image_tag from $commit. Home/admin returned HTTP 200; sales and newsletter remain disabled."
echo "Rollback image: $old_tag. Runtime config backup: $env_backup"
