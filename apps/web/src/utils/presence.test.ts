/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type MatrixClient } from "matrix-js-sdk/src/matrix";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isPresenceEnabled } from "./presence";
import SettingsStore from "../settings/SettingsStore";
import SdkConfig from "../SdkConfig";

describe("isPresenceEnabled", () => {
    const client = { baseUrl: "https://hs" } as MatrixClient;

    afterEach(() => vi.restoreAllMocks());

    it("is enabled by default", () => {
        vi.spyOn(SettingsStore, "getValue").mockReturnValue(true);
        expect(isPresenceEnabled(client)).toBe(true);
    });

    it("is disabled when the user turns off showing presence", () => {
        vi.spyOn(SettingsStore, "getValue").mockReturnValue(false);
        expect(isPresenceEnabled(client)).toBe(false);
    });

    it("is disabled by config for this homeserver", () => {
        vi.spyOn(SettingsStore, "getValue").mockReturnValue(true);
        vi.spyOn(SdkConfig, "get").mockReturnValue({ "https://hs": false });
        expect(isPresenceEnabled(client)).toBe(false);
    });
});
