#!/bin/bash
#
# Copyright 2026 Ahmad
#
# SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
# Please see LICENSE files in the repository root for full details.
#
# Builds Element Fork for Linux and installs the .deb.
# Usage: scripts/build-deb.sh [--no-install]

set -euo pipefail

if [[ $EUID -eq 0 ]]; then
    echo "Run this without sudo: root has no pnpm. The script asks for your password when it installs." >&2
    exit 1
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
# The NX TUI waits for a key press when it finishes, so print plain output instead
export NX_TUI=false

cd "$root/apps/web"
pnpm build
cp ../desktop/element.io/release/config.json webapp/config.json

cd "$root/apps/desktop"
rm -f webapp.asar
pnpm exec asar p ../web/webapp webapp.asar
pnpm exec nx build --skip-nx-cache

version="$(node -p 'require("./package.json").version')"
deb="$root/apps/desktop/dist/element-desktop-fork_${version}_amd64.deb"

if [[ "${1:-}" == "--no-install" ]]; then
    echo "Built $deb"
else
    sudo apt install --reinstall "$deb"
fi
