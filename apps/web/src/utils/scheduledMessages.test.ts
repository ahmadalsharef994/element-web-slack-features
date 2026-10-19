/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import { type MatrixClient } from "matrix-js-sdk/src/matrix";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getScheduledFileName, getScheduledText, ScheduledMessages } from "./scheduledMessages";
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

    it("lists everything in every room in time order", () => {
        queue.schedule("!r:x", null, content, now + 2_000);
        queue.schedule("!r:y", null, content, now + 1_000);
        queue.schedule("!r:x", null, content, now + 500);
        expect(queue.getGroups().map((g) => [g.roomId, g.sendAt])).toEqual([
            ["!r:x", now + 500],
            ["!r:y", now + 1_000],
            ["!r:x", now + 2_000],
        ]);
    });

    describe("messages scheduled together", () => {
        const photo = (name: string, caption?: string): RoomMessageEventContent =>
            ({
                msgtype: "m.image",
                body: caption ?? name,
                ...(caption ? { filename: name } : {}),
                url: `mxc://x/${name}`,
            }) as unknown as RoomMessageEventContent;

        beforeEach(() => {
            queue.schedule("!r:x", null, photo("a.png", "holiday"), now + 60_000, "batch");
            queue.schedule("!r:x", null, photo("b.png"), now + 60_000, "batch");
            queue.schedule("!r:x", null, content, now + 120_000);
        });

        it("lists them as one", () => {
            const [batch, single] = queue.getGroups();
            expect(batch.id).toBe("batch");
            expect(batch.messages.map((m) => getScheduledFileName(m.content))).toEqual(["a.png", "b.png"]);
            expect(single.messages).toHaveLength(1);
        });

        it("sends them in order at the scheduled time", async () => {
            await vi.advanceTimersByTimeAsync(61_000);
            expect(vi.mocked(client.sendMessage).mock.calls.map((c) => (c[2] as { url: string }).url)).toEqual([
                "mxc://x/a.png",
                "mxc://x/b.png",
            ]);
            expect(queue.getGroups()).toHaveLength(1);
        });

        it("sends them all on request", async () => {
            queue.sendNow("batch");
            await vi.advanceTimersByTimeAsync(0);
            expect(client.sendMessage).toHaveBeenCalledTimes(2);
            expect(queue.getGroups()).toHaveLength(1);
        });

        it("cancels them all", async () => {
            queue.cancel("batch");
            await vi.advanceTimersByTimeAsync(200_000);
            expect(client.sendMessage).toHaveBeenCalledTimes(1);
            expect(client.sendMessage).toHaveBeenCalledWith("!r:x", null, content);
        });

        it("keeps them together when sending fails and is retried", async () => {
            vi.mocked(client.sendMessage).mockRejectedValueOnce(new Error("offline"));
            await vi.advanceTimersByTimeAsync(61_000);
            expect(queue.getGroups().find((g) => g.id === "batch")?.messages).toHaveLength(1);
        });

        it("moves them all to a new time", async () => {
            queue.update("batch", { sendAt: now + 300_000 });
            await vi.advanceTimersByTimeAsync(200_000);
            expect(client.sendMessage).toHaveBeenCalledTimes(1); // only the single message

            await vi.advanceTimersByTimeAsync(101_000);
            expect(client.sendMessage).toHaveBeenCalledTimes(3);
        });

        it("changes the caption on the first photo only", () => {
            queue.update("batch", { text: "new caption" });
            const [first, second] = queue.getGroups()[0].messages;
            expect(first.content).toMatchObject({ body: "new caption", filename: "a.png" });
            expect(second.content).toMatchObject({ body: "b.png" });
        });

        it("takes the caption off a photo when it is emptied", () => {
            queue.update("batch", { text: "" });
            const [first] = queue.getGroups()[0].messages;
            expect(first.content.body).toBe("a.png");
            expect(first.content).not.toHaveProperty("filename");
            expect(getScheduledText(first.content)).toBe("");
        });

        it("adds a caption to a photo that had none", () => {
            const withoutCaption = queue.schedule("!r:x", null, photo("c.png"), now + 500_000);
            queue.update(withoutCaption.id, { text: "nice" });
            expect(queue.getGroups().at(-1)?.messages[0].content).toMatchObject({ body: "nice", filename: "c.png" });
        });
    });

    describe("editing text", () => {
        it("keeps what else the message carried", () => {
            const { id } = queue.schedule(
                "!r:x",
                null,
                {
                    "msgtype": "m.text",
                    "body": "old",
                    "m.relates_to": { "m.in_reply_to": { event_id: "$e" } },
                } as unknown as RoomMessageEventContent,
                now + 1_000,
            );
            queue.update(id, { text: "new" });
            expect(queue.getGroups()[0].messages[0].content).toEqual({
                "msgtype": "m.text",
                "body": "new",
                "m.relates_to": { "m.in_reply_to": { event_id: "$e" } },
            });
        });

        it("builds the HTML again from the Markdown that was typed", () => {
            const { id } = queue.schedule(
                "!r:x",
                null,
                {
                    msgtype: "m.text",
                    body: "old",
                    format: "org.matrix.custom.html",
                    formatted_body: "<b>old</b>",
                } as unknown as RoomMessageEventContent,
                now + 1_000,
            );
            queue.update(id, { text: "*new*" });
            expect(queue.getGroups()[0].messages[0].content).toMatchObject({
                body: "*new*",
                formatted_body: "<em>new</em>",
            });

            queue.update(id, { text: "plain" });
            expect(queue.getGroups()[0].messages[0].content).not.toHaveProperty("formatted_body");
        });
    });
});
