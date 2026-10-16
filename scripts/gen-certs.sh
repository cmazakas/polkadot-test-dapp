#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Generate a dummy CA and a localhost leaf certificate for the HTTPS dev server.

  ./scripts/gen-certs.sh           write to ./certs, refuse to clobber
  ./scripts/gen-certs.sh --force   reissue the leaf (an existing CA is reused)

Environment overrides:
  CERT_DIR    output directory            (default <repo>/certs)
  CA_NAME     CA common name              (default "polkadot-scratch Dummy CA")
  LEAF_NAME   leaf CN and filename stem   (default localhost)
  SANS        subjectAltName list         (default DNS:localhost,IP:127.0.0.1)
  CA_DAYS     CA lifetime in days         (default 3650)
  LEAF_DAYS   leaf lifetime in days       (default 825)

Trust certs/ca.pem in your browser (Brave: brave://settings/security ->
Manage certificates -> Authorities) so https://localhost is not flagged.
Only the CA needs trusting, and --force keeps it, so you trust it once and
can reissue leaf certs freely. Delete ca.pem to start over with a new CA.
EOF
}

# Git Bash / MSYS rewrites arguments that look like absolute paths, which turns
# -subj "/CN=foo" into "C:/Program Files/Git/CN=foo". No-ops elsewhere.
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*'

CERT_DIR="${CERT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/certs}"
CA_NAME="${CA_NAME:-polkadot-scratch Dummy CA}"
LEAF_NAME="${LEAF_NAME:-localhost}"
SANS="${SANS:-DNS:localhost,IP:127.0.0.1}"
CA_DAYS="${CA_DAYS:-3650}"
LEAF_DAYS="${LEAF_DAYS:-825}"

FORCE=0
for arg in "$@"; do
  case "$arg" in
    -f | --force) FORCE=1 ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

command -v openssl >/dev/null || {
  echo "openssl not found on PATH" >&2
  exit 1
}

mkdir -p "$CERT_DIR"
cd "$CERT_DIR"

ca_key=ca-key.pem
ca_cert=ca.pem
leaf_key="${LEAF_NAME}-key.pem"
leaf_cert="${LEAF_NAME}.pem"
leaf_ext="${LEAF_NAME}.v3.ext"

if [[ $FORCE -eq 0 ]]; then
  for f in "$ca_key" "$ca_cert" "$leaf_key" "$leaf_cert"; do
    if [[ -e $f ]]; then
      echo "$CERT_DIR/$f already exists; pass --force to regenerate." >&2
      exit 1
    fi
  done
fi

umask 077

# Reuse an existing CA when only the leaf is being reissued, so a CA you have
# already trusted in the browser stays valid.
if [[ -e $ca_key && -e $ca_cert ]]; then
  echo "reusing CA $ca_cert"
else
  openssl ecparam -name prime256v1 -genkey -noout -out "$ca_key"
  openssl req -new -x509 -key "$ca_key" -out "$ca_cert" \
    -sha256 -days "$CA_DAYS" -subj "/CN=${CA_NAME}" \
    -addext 'basicConstraints = critical, CA:TRUE, pathlen:0' \
    -addext 'keyUsage = critical, keyCertSign, cRLSign'
  echo "wrote $ca_key $ca_cert"
fi

cat >"$leaf_ext" <<EOF
basicConstraints = CA:FALSE
keyUsage = critical, digitalSignature
extendedKeyUsage = serverAuth
subjectAltName = ${SANS}
EOF

# Kept beside the key rather than in $TMPDIR: a native-Windows openssl under
# Git Bash cannot open a /tmp/... path.
csr="${LEAF_NAME}.csr"
trap 'rm -f "$CERT_DIR/$csr"' EXIT

openssl ecparam -name prime256v1 -genkey -noout -out "$leaf_key"
openssl req -new -key "$leaf_key" -out "$csr" -subj "/CN=${LEAF_NAME}"
openssl x509 -req -in "$csr" -CA "$ca_cert" -CAkey "$ca_key" \
  -out "$leaf_cert" -sha256 -days "$LEAF_DAYS" \
  -set_serial "0x$(openssl rand -hex 8)" -extfile "$leaf_ext"

chmod 600 "$ca_key" "$leaf_key"
chmod 644 "$ca_cert" "$leaf_cert" "$leaf_ext"

echo "wrote $leaf_key $leaf_cert $leaf_ext"
echo
openssl x509 -in "$leaf_cert" -noout -subject -issuer -dates -ext subjectAltName
echo
echo "Trust $CERT_DIR/$ca_cert in your browser, then: npm start"
