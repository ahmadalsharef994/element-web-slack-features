/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import { type MatrixClient } from "matrix-js-sdk/src/matrix";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScheduledMessages } from "./scheduledMessages";
import { type RoomMessageEventContent } from "../../@types/url-preview";

describe("ScheduledMessages", () => {
    const now = 1_000_000;
    const content = { msgtype: "m.text", body: "hello later" } as RoomMessageEventContent;
    let client: MatrixClient;
    let queue: ScheduledMessages;

    beforeEach(() => {
        vi.useFakeTimers({ now });
        localStorage.clear();
        client = {
            getSafeUserId: () => "@me:example.org",
            sendMessage: vi.fn().mockResolvedValue({ event_id: "$e" }),
        } as unknown as MatrixClient;
        queue = new ScheduledMessages();
        queue.start(client);
    });

    afterEach(() => {
        queue.stop();
        vi.useRealTimers();
    });

    it("sends the message when its time comes, and not before", async () => {
        queue.schedule("!r:x", null, content, now + 60_000);
        await vi.advanceTimersByTimeAsync(59_000);
        expect(client.sendMessage).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(2_000);
        expect(client.sendMessage).toHaveBeenCalledWith("!r:x", null, content);
        expect(queue.getAll()).toEqual([]);
    });

    it("does not send a cancelled message", async () => {
        const { id } = queue.schedule("!r:x", null, content, now + 1_000);
        queue.cancel(id);
        await vi.advanceTimersByTimeAsync(5_000);
        expect(client.sendMessage).not.toHaveBeenCalled();
    });

    it("sends straight away on request", async () => {
        const { id } = queue.schedule("!r:x", "$thread", content, now + 60_000);
        queue.sendNow(id);
        await vi.advanceTimersByTimeAsync(0);
        expect(client.sendMessage).toHaveBeenCalledWith("!r:x", "$thread", content);
    });

    it("keeps the queue across restarts and sends what became overdue", async () => {
        queue.schedule("!r:x", null, content, now + 1_000);
        queue.schedule("!r:y", null, content, now + 10 * 60_000);
        queue.stop();

        vi.setSystemTime(now + 5_000);
        queue.start(client);
        await vi.advanceTimersByTimeAsync(0);

        expect(client.sendMessage).toHaveBeenCalledTimes(1);
        expect(client.sendMessage).toHaveBeenCalledWith("!r:x", null, content);
        expect(queue.getAll().map((m) => m.roomId)).toEqual(["!r:y"]);
    });

    it("tries again later when sending fails", async () => {
        vi.mocked(client.sendMessage).mockRejectedValueOnce(new Error("offline"));
        queue.schedule("!r:x", null, content, now + 1_000);
        await vi.advanceTimersByTimeAsync(2_000);
        expect(queue.getAll()).toHaveLength(1);

        await vi.advanceTimersByTimeAsync(61_000);
        expect(client.sendMessage).toHaveBeenCalledTimes(2);
        expect(queue.getAll()).toEqual([]);
    });

    it("lists messages by room in time order", () => {
        queue.schedule("!r:x", null, content, now + 2_000);
        queue.schedule("!r:y", null, content, now + 1_000);
        queue.schedule("!r:x", null, content, now + 500);
        expect(queue.getForRoom("!r:x").map((m) => m.sendAt)).toEqual([now + 500, now + 2_000]);
    });
});
