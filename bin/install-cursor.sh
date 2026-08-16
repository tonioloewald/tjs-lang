#!/bin/bash
#
# Install TJS + AsyncJS syntax highlighting for Cursor.
#
# Usage: npx ajs-install-cursor [--force] [--uninstall]
#    or: ./node_modules/.bin/ajs-install-cursor
#
# The real work lives in install-editor-extension.sh — this file only names the editor and
# its extensions directory.

set -e

if [[ "$OSTYPE" == "darwin"* ]] || [[ "$OSTYPE" == "linux-gnu"* ]]; then
  EXT_DIR="$HOME/.cursor/extensions"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "win32" ]]; then
  EXT_DIR="$APPDATA/Cursor/User/extensions"
else
  echo "Unknown OS: $OSTYPE"
  echo "Please manually copy editors/vscode to your Cursor extensions directory"
  exit 1
fi

exec "$(dirname "${BASH_SOURCE[0]}")/install-editor-extension.sh" "Cursor" "$EXT_DIR" "$@"
