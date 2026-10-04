/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { _td } from "@element-hq/web-shared-components";

import { UserFriendlyError } from "../languageHandler";
import { Command } from "./command";
import { CommandCategories } from "./interface";
import { reject, success } from "./utils";
import SettingsStore from "../settings/SettingsStore";
import { SettingLevel } from "../settings/SettingLevel";
import { TimelineRenderingType } from "../contexts/RoomContext";

const DEFAULT_SNOOZE_MS = 60 * 60 * 1000;

/** Snooze duration in ms for args like "30", "30m", "2h"; 0 for "off"; undefined if not understood. */
function parseDuration(args: string): number | undefined {
    if (args === "off") return 0;
    if (!args) return DEFAULT_SNOOZE_MS;
    const match = /^(\d+)\s*(m|min|h)?$/i.exec(args);
    if (!match) return undefined;
    // A bare number counts as minutes
    const unitMs = match[2]?.toLowerCase() === "h" ? 60 * 60 * 1000 : 60 * 1000;
    return Number(match[1]) * unitMs;
}

export const snoozeCommand = new Command({
    command: "snooze",
    args: "[<minutes>|<hours>h|off]",
    description: _td("slash_command|snooze|description"),
    runFn: function (_cli, _roomId, _threadId, args) {
        const duration = parseDuration(args?.trim() ?? "");
        if (duration === undefined) {
            return reject(new UserFriendlyError("slash_command|snooze|invalid_args"));
        }
        return success(
            SettingsStore.setValue(
                "notificationsSnoozedUntil",
                null,
                SettingLevel.DEVICE,
                duration && Date.now() + duration,
            ),
        );
    },
    category: CommandCategories.actions,
    renderingTypes: [TimelineRenderingType.Room],
});
