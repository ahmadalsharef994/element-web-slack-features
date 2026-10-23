/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import { MatrixError, type MatrixClient } from "matrix-js-sdk/src/matrix";
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

    describe("when the server can hold messages", () => {
        const notFound = (): MatrixError => new MatrixError({ errcode: "M_NOT_FOUND" }, 404);
        let delayCount: number;

        beforeEach(() => {
            queue.stop();
            delayCount = 0;
            Object.assign(client, {
                doesServerSupportUnstableFeature: vi.fn().mockResolvedValue(true),
                getRoom: vi.fn().mockReturnValue({}),
                isRoomEncrypted: vi.fn().mockReturnValue(false),
                _unstable_sendDelayedEvent: vi.fn().mockImplementation(async () => ({ delay_id: `d${++delayCount}` })),
                _unstable_cancelScheduledDelayedEvent: vi.fn().mockResolvedValue({}),
                _unstable_sendScheduledDelayedEvent: vi.fn().mockResolvedValue({}),
                _unstable_getDelayedEvents: vi.fn().mockResolvedValue({ scheduled: [] }),
            });
            queue.start(client);
        });

        const flush = (): Promise<void> => vi.advanceTimersByTimeAsync(0);

        it("hands the message to the server and does not send it from here", async () => {
            const message = queue.schedule("!r:x", "$thread", content, now + 60_000);
            await flush();

            expect(client._unstable_sendDelayedEvent).toHaveBeenCalledWith(
                "!r:x",
                { delay: 60_000 },
                "$thread",
                "m.room.message",
                content,
            );
            expect(message.delayId).toBe("d1");

            await vi.advanceTimersByTimeAsync(61_000);
            expect(client.sendMessage).not.toHaveBeenCalled();
        });

        it("keeps the events of one message in order", async () => {
            queue.schedule("!r:x", null, content, now + 60_000, "batch");
            queue.schedule("!r:x", null, content, now + 60_000, "batch");
            await flush();

            const delays = vi.mocked(client._unstable_sendDelayedEvent).mock.calls.map((c) => c[1]);
            expect(delays).toEqual([{ delay: 60_000 }, { delay: 60_500 }]);
        });

        it.each([
            ["the room is encrypted", () => vi.mocked(client.isRoomEncrypted).mockReturnValue(true)],
            ["the room is not known", () => vi.mocked(client.getRoom).mockReturnValue(null)],
            [
                "the server does not support it",
                () => vi.mocked(client.doesServerSupportUnstableFeature).mockResolvedValue(false),
            ],
            [
                "the server refuses",
                () => vi.mocked(client._unstable_sendDelayedEvent).mockRejectedValue(new Error("too long")),
            ],
        ])("sends it from here when %s", async (_, setUp) => {
            setUp();
            queue.schedule("!r:x", null, content, now + 60_000);
            await vi.advanceTimersByTimeAsync(61_000);

            expect(client.sendMessage).toHaveBeenCalledWith("!r:x", null, content);
        });

        it("does not bother the server with a message due in seconds", async () => {
            queue.schedule("!r:x", null, content, now + 5_000);
            await flush();
            expect(client._unstable_sendDelayedEvent).not.toHaveBeenCalled();
        });

        it("cancels on the server", async () => {
            const { id } = queue.schedule("!r:x", null, content, now + 60_000);
            await flush();

            await queue.cancel(id);

            expect(client._unstable_cancelScheduledDelayedEvent).toHaveBeenCalledWith("d1");
            expect(queue.getAll()).toEqual([]);
        });

        it("treats a message the server already sent as cancelled", async () => {
            const { id } = queue.schedule("!r:x", null, content, now + 60_000);
            await flush();
            vi.mocked(client._unstable_cancelScheduledDelayedEvent).mockRejectedValue(notFound());

            await queue.cancel(id);
            expect(queue.getAll()).toEqual([]);
        });

        it("keeps the message listed when the server cannot be reached to cancel it", async () => {
            const { id } = queue.schedule("!r:x", null, content, now + 60_000);
            await flush();
            vi.mocked(client._unstable_cancelScheduledDelayedEvent).mockRejectedValue(new Error("offline"));

            await expect(queue.cancel(id)).rejects.toThrow("offline");
            expect(queue.getAll()).toHaveLength(1);
            expect(queue.getAll()[0].delayId).toBe("d1");
        });

        it("asks the server to send it now", async () => {
            const { id } = queue.schedule("!r:x", null, content, now + 60_000);
            await flush();

            await queue.sendNow(id);

            expect(client._unstable_sendScheduledDelayedEvent).toHaveBeenCalledWith("d1");
            expect(client.sendMessage).not.toHaveBeenCalled();
            expect(queue.getAll()).toEqual([]);
        });

        it("replaces the server's copy when the time changes", async () => {
            const { id } = queue.schedule("!r:x", null, content, now + 60_000);
            await flush();

            await queue.update(id, { sendAt: now + 120_000 });
            await flush();

            expect(client._unstable_cancelScheduledDelayedEvent).toHaveBeenCalledWith("d1");
            expect(client._unstable_sendDelayedEvent).toHaveBeenLastCalledWith(
                "!r:x",
                { delay: 120_000 },
                null,
                "m.room.message",
                content,
            );
            expect(queue.getAll()[0].delayId).toBe("d2");
        });

        it("changes nothing when the server cannot be reached to take the message back", async () => {
            const { id } = queue.schedule("!r:x", null, content, now + 60_000);
            await flush();
            vi.mocked(client._unstable_cancelScheduledDelayedEvent).mockRejectedValue(new Error("offline"));

            await expect(queue.update(id, { sendAt: now + 120_000 })).rejects.toThrow("offline");
            expect(queue.getAll()[0]).toMatchObject({ sendAt: now + 60_000, delayId: "d1" });
        });

        it("cancels the server's copy of a message cancelled while it was being handed over", async () => {
            const { id } = queue.schedule("!r:x", null, content, now + 60_000);
            await queue.cancel(id);
            await flush();

            expect(client._unstable_cancelScheduledDelayedEvent).toHaveBeenCalledWith("d1");
            expect(queue.getAll()).toEqual([]);
        });

        it("forgets a message once the server has sent it", async () => {
            queue.schedule("!r:x", null, content, now + 60_000);
            await flush();
            expect(queue.getAll()).toHaveLength(1);

            await vi.advanceTimersByTimeAsync(60_000 + 16_000);

            expect(queue.getAll()).toEqual([]);
            expect(client.sendMessage).not.toHaveBeenCalled();
        });

        it("keeps a message the server still holds", async () => {
            queue.schedule("!r:x", null, content, now + 60_000);
            await flush();
            vi.mocked(client._unstable_getDelayedEvents).mockResolvedValue({
                scheduled: [
                    {
                        delay_id: "d1",
                        room_id: "!r:x",
                        type: "m.room.message",
                        content,
                        delay: 60_000,
                        running_since: now,
                    },
                ],
            } as never);

            await vi.advanceTimersByTimeAsync(60_000 + 16_000);
            expect(queue.getAll()).toHaveLength(1);
        });

        it("lists messages scheduled from another device", async () => {
            vi.mocked(client._unstable_getDelayedEvents).mockResolvedValue({
                scheduled: [
                    {
                        delay_id: "other",
                        room_id: "!r:y",
                        type: "m.room.message",
                        content: { ...content, "m.relates_to": { rel_type: "m.thread", event_id: "$t" } },
                        delay: 60_000,
                        running_since: now,
                    },
                    // Not a message, so not ours to list
                    {
                        delay_id: "call",
                        room_id: "!r:y",
                        type: "m.call.member",
                        state_key: "k",
                        content: {},
                        delay: 1,
                        running_since: now,
                    },
                ],
            } as never);

            queue.stop();
            queue.start(client);
            await flush();

            expect(queue.getAll()).toMatchObject([
                { roomId: "!r:y", threadId: "$t", sendAt: now + 60_000, delayId: "other" },
            ]);
        });

        it("keeps what it has when the server cannot be asked", async () => {
            queue.schedule("!r:x", null, content, now + 60_000);
            await flush();
            vi.mocked(client._unstable_getDelayedEvents).mockRejectedValue(new Error("offline"));

            await vi.advanceTimersByTimeAsync(60_000 + 16_000);
            expect(queue.getAll()).toHaveLength(1);
        });

        it("hands over messages kept in the browser once the server can hold them", async () => {
            vi.mocked(client.doesServerSupportUnstableFeature).mockResolvedValue(false);
            queue.schedule("!r:x", null, content, now + 60_000);
            await flush();
            expect(client._unstable_sendDelayedEvent).not.toHaveBeenCalled();
            queue.stop();

            vi.mocked(client.doesServerSupportUnstableFeature).mockResolvedValue(true);
            queue.start(client);
            await flush();

            expect(client._unstable_sendDelayedEvent).toHaveBeenCalledTimes(1);
            expect(queue.getAll()[0].delayId).toBe("d1");
        });
    });
});
