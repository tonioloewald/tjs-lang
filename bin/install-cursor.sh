#!/bin/bash
#
# Install AsyncJS syntax highlighting for Cursor
#
# Usage: npx ajs-install-cursor
#    or: ./node_modules/.bin/ajs-install-cursor

set -e

# Find the real package directory (resolve symlinks for npx compatibility)
SCRIPT_PATH="${BASH_SOURCE[0]}"
# Follow symlinks to get the real path
while [ -L "$SCRIPT_PATH" ]; do
  SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
  SCRIPT_PATH="$(readlink "$SCRIPT_PATH")"
  # Handle relative symlinks
  [[ $SCRIPT_PATH != /* ]] && SCRIPT_PATH="$SCRIPT_DIR/$SCRIPT_PATH"
done
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"
EXTENSION_SRC="$PACKAGE_DIR/editors/vscode"

# Determine Cursor extensions directory
if [[ "$OSTYPE" == "darwin"* ]]; then
  CURSOR_EXT_DIR="$HOME/.cursor/extensions"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  CURSOR_EXT_DIR="$HOME/.cursor/extensions"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "win32" ]]; then
  CURSOR_EXT_DIR="$APPDATA/Cursor/User/extensions"
else
  echo "Unknown OS: $OSTYPE"
  echo "Please manually copy $EXTENSION_SRC to your Cursor extensions directory"
  exit 1
fi

TARGET_DIR="$CURSOR_EXT_DIR/tosijs-ajs-0.1.0"

echo "Installing AsyncJS syntax highlighting for Cursor..."
echo "  Source: $EXTENSION_SRC"
echo "  Target: $TARGET_DIR"

# Check source exists
if [ ! -d "$EXTENSION_SRC" ]; then
  echo "Error: Extension source not found at $EXTENSION_SRC"
  echo ""
  echo "If you installed via npm/npx, try running from your project directory:"
  echo "  ./node_modules/tjs-lang/bin/install-cursor.sh"
  exit 1
fi

# Create extensions directory if needed
mkdir -p "$CURSOR_EXT_DIR"

# Remove old version if exists
if [ -d "$TARGET_DIR" ]; then
  echo "  Removing old version..."
  rm -rf "$TARGET_DIR"
fi

# Copy extension
cp -r "$EXTENSION_SRC" "$TARGET_DIR"

echo ""
echo "Installation complete!"
echo ""
echo "Please restart Cursor to enable AsyncJS syntax highlighting."
echo ""
echo "Features:"
echo "  - Syntax highlighting for .ajs files"
echo "  - Embedded highlighting in ajs\`...\` template literals"
echo "  - Error highlighting for forbidden syntax (new, class, async, etc.)"
