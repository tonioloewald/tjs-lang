#!/bin/bash
#
# Install TJS + AsyncJS syntax highlighting for VS Code.
#
# Usage: npx ajs-install-vscode [--force] [--uninstall]
#    or: ./node_modules/.bin/ajs-install-vscode
#
# The real work lives in install-editor-extension.sh — this file only names the editor and
# its extensions directory. The two used to be 72-line near-copies, which is how they came
# to share a hard-coded target name and a `rm -rf` that ate developers' symlinks.

set -e

if [[ "$OSTYPE" == "darwin"* ]] || [[ "$OSTYPE" == "linux-gnu"* ]]; then
  EXT_DIR="$HOME/.vscode/extensions"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "win32" ]]; then
  EXT_DIR="$APPDATA/Code/User/extensions"
else
  echo "Unknown OS: $OSTYPE"
  echo "Please manually copy editors/vscode to your VS Code extensions directory"
  exit 1
fi

exec "$(dirname "${BASH_SOURCE[0]}")/install-editor-extension.sh" "VS Code" "$EXT_DIR" "$@"
