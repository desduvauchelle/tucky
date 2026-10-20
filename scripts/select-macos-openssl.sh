#!/usr/bin/env bash
# llama.cpp's bundled cpp-httplib uses the OpenSSL 3 X509 API. Do not let a
# moving Homebrew default silently select the incompatible OpenSSL 4 API.
set -euo pipefail
if ! brew list --versions openssl@3 >/dev/null 2>&1; then
  HOMEBREW_NO_AUTO_UPDATE=1 brew install openssl@3
fi
OPENSSL_PREFIX="$(brew --prefix openssl@3)"
case "$("$OPENSSL_PREFIX/bin/openssl" version)" in
  "OpenSSL 3."*) ;;
  *) echo "Expected OpenSSL 3 at $OPENSSL_PREFIX" >&2; exit 1 ;;
esac
printf 'OPENSSL_ROOT_DIR=%s\nOPENSSL_DIR=%s\nCMAKE_PREFIX_PATH=%s\n' \
  "$OPENSSL_PREFIX" "$OPENSSL_PREFIX" "$OPENSSL_PREFIX" >> "${GITHUB_ENV:?}"
echo "Selected supported OpenSSL 3 for the native build."
