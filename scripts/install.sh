#!/bin/sh
# Shall's installer — https://shall.sh/install serves this file.
# It copies one binary and nothing else: no ~/.shall, no daemon, no sudo.
# The first `shall init` (or any `shall` command) does the rest, lazily.
set -eu

REPO="Nove-Lab/Shall"
INSTALL_DIR="${SHALL_INSTALL_DIR:-$HOME/.local/bin}"

os=$(uname -s)
arch=$(uname -m)
case "$os" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *)
    echo "Shall ships binaries for macOS and Linux. On Windows, run it inside WSL." >&2
    exit 1
    ;;
esac
case "$arch" in
  arm64 | aarch64) arch=arm64 ;;
  x86_64 | amd64) arch=x64 ;;
  *)
    echo "There is no Shall binary for $arch yet." >&2
    exit 1
    ;;
esac
target="shall-$os-$arch"

latest=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" |
  grep '"tag_name"' | head -1 | cut -d '"' -f 4)
if [ -z "$latest" ]; then
  echo "Could not find the latest Shall release — see https://github.com/$REPO/releases" >&2
  exit 1
fi

base="https://github.com/$REPO/releases/download/$latest"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "Downloading shall $latest ($target)..."
curl -fsSL -o "$tmp/$target" "$base/$target"
curl -fsSL -o "$tmp/SHA256SUMS" "$base/SHA256SUMS"

# The checksum file lists every asset; only the line for this target is checked.
if command -v sha256sum >/dev/null 2>&1; then
  checker="sha256sum"
else
  checker="shasum -a 256"
fi
(cd "$tmp" && grep " $target\$" SHA256SUMS | $checker -c - >/dev/null)
echo "Checksum verified."

mkdir -p "$INSTALL_DIR"
install -m 755 "$tmp/$target" "$INSTALL_DIR/shall"
echo "Installed shall $latest to $INSTALL_DIR/shall"

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo ""
    echo "$INSTALL_DIR is not on your PATH. Add it to your shell profile:"
    echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
    ;;
esac

echo ""
echo "Get started:  cd <your project> && shall init"
