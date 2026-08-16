#!/bin/bash
#
# Install (or remove) the TJS + AsyncJS syntax-highlighting extension.
#
# ONE implementation. `install-vscode.sh` and `install-cursor.sh` are three-line wrappers
# that name an editor and call this — they used to be 72-line near-copies differing in an
# editor name and a path, which is how they came to share every bug below.
#
# Usage: install-editor-extension.sh <editor-label> <extensions-dir> [--force] [--uninstall]
#
# Three things this fixes:
#
#   1. The target directory is DERIVED from the extension manifest (`name-version`). It was
#      hard-coded `tosijs-ajs-0.1.0` long after the extension was renamed to `tjs-lang` and
#      grew a whole `.tjs` grammar, so the installed directory name described neither the
#      extension nor its contents.
#
#   2. `rm -rf` refuses to run on a SYMLINK without `--force`. `[ -d ]` is true for a
#      symlink-to-directory, so a developer who had linked the repo into their extensions
#      folder — the normal way to work on the grammar — had that link silently replaced by
#      a frozen copy. The source survived, but live edits stopped appearing, which presents
#      as "the grammar stopped updating" and not as "something deleted my link".
#
#   3. There is an uninstaller. Copying files into a user's editor with no way back is not
#      a complete install story.

set -e

EDITOR_LABEL="$1"
EXT_DIR="$2"
shift 2 || true

FORCE=0
UNINSTALL=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --uninstall) UNINSTALL=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

if [ -z "$EDITOR_LABEL" ] || [ -z "$EXT_DIR" ]; then
  echo "Usage: $0 <editor-label> <extensions-dir> [--force] [--uninstall]" >&2
  exit 2
fi

# Find the real package directory (resolve symlinks for npx compatibility)
SCRIPT_PATH="${BASH_SOURCE[0]}"
while [ -L "$SCRIPT_PATH" ]; do
  SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
  SCRIPT_PATH="$(readlink "$SCRIPT_PATH")"
  [[ $SCRIPT_PATH != /* ]] && SCRIPT_PATH="$SCRIPT_DIR/$SCRIPT_PATH"
done
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"
EXTENSION_SRC="$PACKAGE_DIR/editors/vscode"
MANIFEST="$EXTENSION_SRC/package.json"

if [ ! -d "$EXTENSION_SRC" ]; then
  echo "Error: Extension source not found at $EXTENSION_SRC" >&2
  echo "" >&2
  echo "If you installed via npm/npx, try running from your project directory:" >&2
  echo "  ./node_modules/tjs-lang/bin/install-vscode.sh" >&2
  exit 1
fi

# Read name and version from the manifest, so the installed directory always describes
# what is actually in it. Plain grep/sed rather than a node/jq dependency: this script has
# to work before anything is installed.
read_field() {
  grep -m1 "\"$1\"[[:space:]]*:" "$MANIFEST" | sed -E 's/.*:[[:space:]]*"([^"]*)".*/\1/'
}
EXT_NAME="$(read_field name)"
EXT_VERSION="$(read_field version)"

if [ -z "$EXT_NAME" ] || [ -z "$EXT_VERSION" ]; then
  echo "Error: could not read name/version from $MANIFEST" >&2
  exit 1
fi

TARGET_DIR="$EXT_DIR/${EXT_NAME}-${EXT_VERSION}"

if [ "$UNINSTALL" = "1" ]; then
  if [ -L "$TARGET_DIR" ]; then
    echo "Removing symlink $TARGET_DIR (the link only; its target is untouched)"
    rm "$TARGET_DIR"
  elif [ -d "$TARGET_DIR" ]; then
    echo "Removing $TARGET_DIR"
    rm -rf "$TARGET_DIR"
  else
    echo "Nothing installed at $TARGET_DIR"
    exit 0
  fi
  echo "Uninstalled. Restart $EDITOR_LABEL."
  exit 0
fi

echo "Installing TJS + AsyncJS syntax highlighting for $EDITOR_LABEL..."
echo "  Source: $EXTENSION_SRC"
echo "  Target: $TARGET_DIR"

mkdir -p "$EXT_DIR"

# A symlink here is almost always a deliberate dev install. Replacing it with a frozen copy
# is not an upgrade, it is a downgrade that looks like nothing happened.
if [ -L "$TARGET_DIR" ]; then
  if [ "$FORCE" != "1" ]; then
    echo "" >&2
    echo "Refusing to replace a SYMLINK:" >&2
    echo "  $TARGET_DIR -> $(readlink "$TARGET_DIR")" >&2
    echo "" >&2
    echo "That looks like a development install. Overwriting it with a copy would stop" >&2
    echo "your edits from showing up, without any error to explain why." >&2
    echo "" >&2
    echo "  Keep the link:  nothing to do — it already points at the source." >&2
    echo "  Replace it:     re-run with --force" >&2
    echo "  Remove it:      re-run with --uninstall" >&2
    exit 1
  fi
  echo "  Replacing symlink (--force)..."
  rm "$TARGET_DIR"
elif [ -d "$TARGET_DIR" ]; then
  echo "  Removing previous install..."
  rm -rf "$TARGET_DIR"
fi

cp -r "$EXTENSION_SRC" "$TARGET_DIR"

# Older installs — a previous version of this extension, or the `tosijs-ajs-*` name it
# used before it was renamed — are still loaded by the editor alongside the new one.
# REPORT them; do not delete. Removing a directory we cannot prove we created is exactly
# the move to avoid, and the old name in particular could belong to something else.
for leftover in "$EXT_DIR"/"$EXT_NAME"-* "$EXT_DIR"/tosijs-ajs-*; do
  [ -e "$leftover" ] || continue
  [ "$leftover" = "$TARGET_DIR" ] && continue
  echo ""
  echo "Note: an older install is still present and will also be loaded:"
  echo "  $leftover"
  echo "Remove it by hand, or: $0 '$EDITOR_LABEL' '$EXT_DIR' --uninstall (this version only)"
done

echo ""
echo "Installation complete!"
echo ""
echo "Please restart $EDITOR_LABEL to enable syntax highlighting."
echo ""
echo "Features:"
echo "  - Syntax highlighting for .tjs and .ajs files"
echo "  - Embedded highlighting in tjs\`...\` and ajs\`...\` template literals"
echo "  - Error highlighting for forbidden syntax in AJS (new, class, async, etc.)"
echo ""
echo "To remove: $0 '$EDITOR_LABEL' '$EXT_DIR' --uninstall"
