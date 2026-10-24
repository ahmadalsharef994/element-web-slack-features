/*
Copyright 2024-2025 New Vector Ltd.
Copyright 2017 Karl Glatz <karl@glatz.biz>
Copyright 2017 OpenMarket Ltd

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { app, Tray, Menu, nativeImage } from "electron";
import { v5 as uuidv5 } from "uuid";

import { _t } from "./language-helper.js";
import { getBuildConfig } from "./build-config.js";
import { getIconPath } from "./icon.js";
import { getConfig } from "./config.js";

// This hardcoded uuid is an arbitrary v4 uuid generated on https://www.uuidgenerator.net/version4
const UUID_NAMESPACE = "9fc9c6a0-9ffe-45c9-9cd7-5639ae38b232";

let trayIcon: Tray | null = null;

export function hasTray(): boolean {
    return trayIcon !== null;
}

export function destroy(): void {
    if (trayIcon) {
        trayIcon.destroy();
        trayIcon = null;
    }
}

function toggleWin(): void {
    if (global.mainWindow?.isVisible() && !global.mainWindow.isMinimized() && global.mainWindow.isFocused()) {
        global.mainWindow.hide();
    } else {
        if (global.mainWindow?.isMinimized()) global.mainWindow.restore();
        if (!global.mainWindow?.isVisible()) global.mainWindow?.show();
        global.mainWindow?.focus();
    }
}

export async function create(): Promise<void> {
    // no trays on darwin
    if (process.platform === "darwin" || trayIcon) return;
    const iconPath = await getIconPath();
    const defaultIcon = nativeImage.createFromPath(iconPath);

    const buildConfig = getBuildConfig();
    if (process.platform === "win32" && app.isPackaged && buildConfig.windowsCertSubjectName) {
        // Providing a GUID lets Windows be smarter about maintaining user's tray preferences
        // https://github.com/electron/electron/pull/21891
        // We generate the GUID in a custom arbitrary namespace and use the subject name & userData path
        // to differentiate different app builds on the same system.
        const guid = uuidv5(`${buildConfig.windowsCertSubjectName}:${app.getPath("userData")}`, UUID_NAMESPACE);
        trayIcon = new Tray(defaultIcon, guid);
    } else {
        trayIcon = new Tray(defaultIcon);
    }

    trayIcon.setToolTip(getConfig().brand);
    initApplicationMenu();
    trayIcon.on("click", toggleWin);

    // The web app's favicon (Element's green logo, with unread badges) is deliberately not applied here:
    // the tray and window keep the fork's own icon.
    global.mainWindow?.webContents.on("page-title-updated", function (ev, title) {
        trayIcon?.setToolTip(title);
    });
}

export function initApplicationMenu(): void {
    if (!trayIcon) {
        return;
    }

    const contextMenu = Menu.buildFromTemplate([
        {
            label: _t("action|show_hide"),
            click: toggleWin,
        },
        { type: "separator" },
        {
            label: _t("action|quit"),
            click: function (): void {
                app.quit();
            },
        },
    ]);

    trayIcon.setContextMenu(contextMenu);
}
