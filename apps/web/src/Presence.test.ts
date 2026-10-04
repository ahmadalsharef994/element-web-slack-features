/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { SetPresence } from "matrix-js-sdk/src/matrix";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Presence from "./Presence";
import dis from "./dispatcher/dispatcher";
import { Action } from "./dispatcher/actions";
import { MatrixClientPeg } from "./MatrixClientPeg";
import SettingsStore from "./settings/SettingsStore";

describe("Presence", () => {
    let setSyncPresence: ReturnType<typeof vi.fn>;
    let sharePresence: boolean;
    let onSettingChange: () => void;

    beforeEach(() => {
        setSyncPresence = vi.fn().mockResolvedValue(undefined);
        sharePresence = true;
        vi.spyOn(MatrixClientPeg, "safeGet").mockReturnValue({
            isGuest: () => false,
            setSyncPresence,
        } as unknown as ReturnType<typeof MatrixClientPeg.safeGet>);
        vi.spyOn(SettingsStore, "getValue").mockImplementation(((name: string) =>
            name === "sharePresence" ? sharePresence : undefined) as typeof SettingsStore.getValue);
        vi.spyOn(SettingsStore, "watchSetting").mockImplementation((_name, _room, callback) => {
            onSettingChange = callback as () => void;
            return "ref";
        });
        vi.spyOn(SettingsStore, "unwatchSetting").mockImplementation(() => {});
        void Presence.start();
    });

    afterEach(() => {
        Presence.stop();
        vi.restoreAllMocks();
    });

    it("sends online on user activity", () => {
        dis.dispatch({ action: Action.UserActivity }, true);
        expect(setSyncPresence).toHaveBeenCalledWith(SetPresence.Online);
    });

    it("sends offline instead of online when presence is not shared", () => {
        sharePresence = false;
        dis.dispatch({ action: Action.UserActivity }, true);
        expect(setSyncPresence).toHaveBeenCalledWith(SetPresence.Offline);
        expect(setSyncPresence).not.toHaveBeenCalledWith(SetPresence.Online);
    });

    it("sends the new state as soon as the setting changes", () => {
        dis.dispatch({ action: Action.UserActivity }, true);
        setSyncPresence.mockClear();

        sharePresence = false;
        onSettingChange();
        expect(setSyncPresence).toHaveBeenCalledWith(SetPresence.Offline);

        setSyncPresence.mockClear();
        sharePresence = true;
        onSettingChange();
        expect(setSyncPresence).toHaveBeenCalledWith(SetPresence.Online);
    });
});
