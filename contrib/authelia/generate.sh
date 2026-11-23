#!/bin/sh
set -eu

GENERATED_DIR="${1:-/generated}"
ISSUER_HOST="authelia.localhost"
CA_VALIDITY="10y"
LEAF_VALIDITY="5y"
PRIVATE_FILES="authelia.key oidc_jwks.pem session_secret storage_encryption_key oidc_hmac_secret oidc_client_secret_digest"
READABLE_FILES="ca.crt authelia.crt authelia-chain.crt oidc_client_secret"
OUTPUTS="$PRIVATE_FILES $READABLE_FILES"

all_present() {
  for name in $OUTPUTS; do
    [ -s "$GENERATED_DIR/$name" ] || return 1
  done
}

random_hex() {
  head -c 32 /dev/urandom | od -An -vtx1 | tr -d ' \n'
}

if all_present; then
  exit 0
fi

mkdir -p "$GENERATED_DIR"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/ca" "$work/out"

authelia crypto certificate rsa generate \
  --common-name "Warpdrive Dev CA" --ca --duration "$CA_VALIDITY" \
  --directory "$work/ca" > /dev/null
authelia crypto certificate rsa generate \
  --common-name "$ISSUER_HOST" --sans "$ISSUER_HOST" --duration "$LEAF_VALIDITY" \
  --path.ca "$work/ca" --directory "$work/out" \
  --file.certificate authelia.crt --file.private-key authelia.key \
  --bundles chain --file.bundle.chain authelia-chain.crt > /dev/null
authelia crypto pair rsa generate \
  --directory "$work/out" --file.private-key oidc_jwks.pem --file.public-key oidc_jwks.pub > /dev/null
cp "$work/ca/ca.public.crt" "$work/out/ca.crt"

for name in session_secret storage_encryption_key oidc_hmac_secret oidc_client_secret; do
  printf '%s' "$(random_hex)" > "$work/out/$name"
done

authelia crypto hash generate pbkdf2 \
  --password "$(cat "$work/out/oidc_client_secret")" --no-confirm \
  | sed -n 's/^Digest: //p' | tr -d '\n' > "$work/out/oidc_client_secret_digest"

for name in $OUTPUTS; do
  if [ ! -s "$work/out/$name" ]; then
    echo "generate.sh: failed to generate $name" >&2
    exit 1
  fi
done

for name in $OUTPUTS; do
  mv -f "$work/out/$name" "$GENERATED_DIR/$name"
done
for name in $PRIVATE_FILES; do
  chmod 0600 "$GENERATED_DIR/$name"
done
for name in $READABLE_FILES; do
  chmod 0644 "$GENERATED_DIR/$name"
done

if [ "$(id -u)" -eq 0 ]; then
  chown -R "$(stat -c '%u:%g' "$GENERATED_DIR")" "$GENERATED_DIR"
fi

echo "authelia-init: generated the dev certificates and secrets in $GENERATED_DIR"
