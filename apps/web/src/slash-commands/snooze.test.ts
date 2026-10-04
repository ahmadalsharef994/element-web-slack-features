/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubClient } from "test-utils";

import { snoozeCommand } from "./snooze";
import SettingsStore from "../settings/SettingsStore";
import { SettingLevel } from "../settings/SettingLevel";
import { UserFriendlyError } from "../i18n";

describe("/snooze", () => {
    const now = 1_000_000;
    let client: ReturnType<typeof stubClient>;
    let setValue: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.useFakeTimers({ now });
        client = stubClient();
        setValue = vi.spyOn(SettingsStore, "setValue").mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it.each([
        [undefined, 60 * 60 * 1000],
        ["30", 30 * 60 * 1000],
        ["30m", 30 * 60 * 1000],
        ["2h", 2 * 60 * 60 * 1000],
    ])("snoozes for %s", (args, durationMs) => {
        const result = snoozeCommand.run(client, "!room:example.com", null, args);
        expect(result.error).toBeUndefined();
        expect(setValue).toHaveBeenCalledWith("notificationsSnoozedUntil", null, SettingLevel.DEVICE, now + durationMs);
    });

    it("turns snooze off", () => {
        snoozeCommand.run(client, "!room:example.com", null, "off");
        expect(setValue).toHaveBeenCalledWith("notificationsSnoozedUntil", null, SettingLevel.DEVICE, 0);
    });

    it("rejects durations it does not understand", () => {
        const result = snoozeCommand.run(client, "!room:example.com", null, "soon");
        expect(result.error).toBeInstanceOf(UserFriendlyError);
        expect(setValue).not.toHaveBeenCalled();
    });
});
