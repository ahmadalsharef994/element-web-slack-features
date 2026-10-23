/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/src/logger";
import {
    EventType,
    MatrixError,
    type MatrixClient,
    MsgType,
    THREAD_RELATION_TYPE,
    TypedEventEmitter,
    UNSTABLE_MSC4140_DELAYED_EVENTS,
} from "matrix-js-sdk/src/matrix";

import { type RoomMessageEventContent } from "../../@types/url-preview";
import { htmlSerializeFromMdIfNeeded } from "../editor/serialize";

/** A message the user has asked to send later. */
export interface ScheduledMessage {
    id: string;
    roomId: string;
    threadId: string | null;
    content: RoomMessageEventContent;
    /** When to send, as a timestamp in ms. */
    sendAt: number;
    /** Shared by the events that make up one message, e.g. several photos. Absent when sent alone. */
    batchId?: string;
    /**
     * Set when the homeserver holds this message (a delayed event, MSC4140) and sends it itself,
     * so it goes out even if Element is closed. Without it, only this browser sends it.
     */
    delayId?: string;
}

/** The events scheduled together as one message, e.g. some text and several photos. */
export interface ScheduledGroup {
    id: string;
    roomId: string;
    sendAt: number;
    /** In the order they will be sent. */
    messages: ScheduledMessage[];
}

const MEDIA_MSGTYPES: string[] = [MsgType.Image, MsgType.Video, MsgType.Audio, MsgType.File];

const groupIdOf = (message: ScheduledMessage): string => message.batchId ?? message.id;

/** The name of the file a scheduled photo, video, audio or file message carries, or undefined for text. */
export function getScheduledFileName(content: RoomMessageEventContent): string | undefined {
    if (!MEDIA_MSGTYPES.includes(content.msgtype)) return undefined;
    return (content as { filename?: string }).filename ?? content.body;
}

/** What the person typed: the body of a text message, or the caption of a photo or file. */
export function getScheduledText(content: RoomMessageEventContent): string {
    const fileName = getScheduledFileName(content);
    if (fileName === undefined) return content.body;
    // Without a caption the body is just the file name
    return fileName === content.body ? "" : content.body;
}

/** A copy of the content carrying new text, which for a photo or file is the caption (MSC2530). */
function withText(content: RoomMessageEventContent, text: string): RoomMessageEventContent {
    const { formatted_body, format, filename, ...rest } = content as RoomMessageEventContent & {
        filename?: string;
        formatted_body?: string;
        format?: string;
    };
    const fileName = getScheduledFileName(content);
    if (fileName !== undefined) {
        return (text ? { ...rest, body: text, filename: fileName } : { ...rest, body: fileName }) as typeof content;
    }
    // The body is the Markdown the person typed, so build the HTML again from it.
    // Mention pills become plain names in the HTML; the mentions metadata is kept
    const html = htmlSerializeFromMdIfNeeded(text);
    return (
        html ? { ...rest, body: text, format: "org.matrix.custom.html", formatted_body: html } : { ...rest, body: text }
    ) as typeof content;
}

/** Longest delay `setTimeout` accepts; longer waits are done in several steps. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;
/** How long to wait before trying again when sending fails, e.g. while offline. */
const RETRY_DELAY_MS = 60 * 1000;
/** Messages due sooner than this are not worth handing to the server. */
const MIN_SERVER_DELAY_MS = 10 * 1000;
/** How long after its time to ask the server whether a message it holds went out. */
const SERVER_CHECK_GRACE_MS = 15 * 1000;
/** Gap between the events of one message handed to the server, so they arrive in order. */
const ORDER_GAP_MS = 500;

type ServerScheduledEvent = NonNullable<
    Awaited<ReturnType<MatrixClient["_unstable_getDelayedEvents"]>>["scheduled"]
>[number];

const isNotFound = (e: unknown): boolean => e instanceof MatrixError && e.errcode === "M_NOT_FOUND";

/**
 * Keeps messages scheduled for later and sends them when their time comes.
 *
 * When the homeserver supports delayed events (MSC4140) and the room is not encrypted, the message is
 * handed to the server, which sends it on time even if Element is closed or offline. Otherwise the queue
 * lives in this browser and only sends while Element is open. Servers cannot encrypt, so messages for
 * encrypted rooms always stay in the browser.
 */
export class ScheduledMessages extends TypedEventEmitter<"update", { update: () => void }> {
    public static readonly UPDATE = "update";

    private client?: MatrixClient;
    private messages: ScheduledMessage[] = [];
    private timers = new Map<string, ReturnType<typeof setTimeout>>();
    private serverCheckTimer?: ReturnType<typeof setTimeout>;
    /** Messages being handed to the server right now. */
    private handingOver = new Set<string>();

    private get storageKey(): string {
        return `mx_scheduled_messages_${this.client?.getSafeUserId()}`;
    }

    /** Load this account's queue and start the timers. */
    public start(client: MatrixClient): void {
        this.stop();
        this.client = client;
        try {
            this.messages = JSON.parse(localStorage.getItem(this.storageKey) ?? "[]");
        } catch (e) {
            logger.warn("Could not read scheduled messages", e);
            this.messages = [];
        }
        this.messages.forEach(this.arm);
        this.armServerCheck();
        this.emit(ScheduledMessages.UPDATE);
        // Catch up with the server, then hand it anything it could be holding
        void this.refresh().then(() => this.messages.forEach((m) => void this.handOver(m)));
    }

    public stop(): void {
        this.timers.forEach(clearTimeout);
        this.timers.clear();
        clearTimeout(this.serverCheckTimer);
        this.handingOver.clear();
        this.messages = [];
        this.client = undefined;
    }

    public getAll(): ScheduledMessage[] {
        return [...this.messages].sort((a, b) => a.sendAt - b.sendAt);
    }

    /** Everything scheduled, with the events that belong to one message together, soonest first. */
    public getGroups(): ScheduledGroup[] {
        const groups = new Map<string, ScheduledGroup>();
        for (const message of this.getAll()) {
            const id = groupIdOf(message);
            const group = groups.get(id);
            if (group) group.messages.push(message);
            else groups.set(id, { id, roomId: message.roomId, sendAt: message.sendAt, messages: [message] });
        }
        return [...groups.values()];
    }

    /**
     * Schedule one event. Give the events that make up one message (e.g. several photos) the same
     * `batchId` so they are listed, changed and cancelled together.
     */
    public schedule(
        roomId: string,
        threadId: string | null,
        content: RoomMessageEventContent,
        sendAt: number,
        batchId?: string,
    ): ScheduledMessage {
        const message: ScheduledMessage = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            roomId,
            threadId,
            content,
            sendAt,
            batchId,
        };
        this.messages.push(message);
        this.save();
        this.arm(message);
        void this.handOver(message);
        return message;
    }

    /**
     * Cancel a scheduled message and everything scheduled with it.
     * @throws if the server holds it and could not be reached, in which case it stays scheduled.
     */
    public async cancel(groupId: string): Promise<void> {
        try {
            // Only wait when there is a server to ask, so cancelling a local message takes effect at once
            const pending = this.cancelOnServer(this.group(groupId));
            if (pending) await pending;
        } catch (e) {
            // Forget the ones the server did stop, so only those that could not be cancelled stay listed
            this.remove((m) => groupIdOf(m) === groupId && !m.delayId);
            throw e;
        }
        this.remove((m) => groupIdOf(m) === groupId);
    }

    /**
     * Send a scheduled message and everything scheduled with it straight away instead of waiting.
     * @throws if the server holds it and could not be reached, in which case it stays scheduled.
     */
    public async sendNow(groupId: string): Promise<void> {
        const client = this.client;
        for (const message of this.group(groupId)) {
            if (!message.delayId || !client) {
                void this.send(message);
                continue;
            }
            try {
                await client._unstable_sendScheduledDelayedEvent(message.delayId);
            } catch (e) {
                // Not found means the server has already sent it
                if (!isNotFound(e)) throw e;
            }
            this.remove((m) => m.id === message.id);
        }
    }

    /**
     * Change when a scheduled message is sent, and/or its text (the caption, for photos and files).
     * Applies to everything scheduled with it.
     * @throws if the server holds it and could not be reached, in which case nothing changes.
     */
    public async update(groupId: string, changes: { sendAt?: number; text?: string }): Promise<void> {
        const { sendAt, text } = changes;
        const group = this.group(groupId);
        // The server cannot change a message it holds, so take it back and hand it over again
        try {
            const pending = this.cancelOnServer(group);
            if (pending) await pending;
        } catch (e) {
            // Those the server did stop go back to being sent from here
            this.save();
            group.filter((m) => !m.delayId).forEach(this.arm);
            throw e;
        }
        if (sendAt !== undefined) group.forEach((m) => (m.sendAt = sendAt));
        // The text lives on the first event: the message itself, or the first photo
        if (text !== undefined && group.length > 0) group[0].content = withText(group[0].content, text);
        this.save();
        group.forEach(this.arm);
        group.forEach((m) => void this.handOver(m));
    }

    private group(groupId: string): ScheduledMessage[] {
        return this.messages.filter((m) => groupIdOf(m) === groupId);
    }

    /** Stop the server sending the messages it holds, and mark them as no longer held. Skips the others. */
    private cancelOnServer(messages: ScheduledMessage[]): Promise<void> | undefined {
        if (!messages.some((m) => m.delayId)) return undefined;
        return this.cancelHeld(messages);
    }

    private async cancelHeld(messages: ScheduledMessage[]): Promise<void> {
        const client = this.client;
        for (const message of messages) {
            if (!message.delayId || !client) continue;
            try {
                await client._unstable_cancelScheduledDelayedEvent(message.delayId);
            } catch (e) {
                // Not found means the server has already sent it, so there is nothing left to cancel
                if (!isNotFound(e)) throw e;
            }
            message.delayId = undefined;
        }
    }

    private async canHoldOnServer(client: MatrixClient, roomId: string): Promise<boolean> {
        try {
            return (
                (await client.doesServerSupportUnstableFeature(UNSTABLE_MSC4140_DELAYED_EVENTS)) &&
                // Without the room we cannot tell whether it is encrypted
                !!client.getRoom(roomId) &&
                !client.isRoomEncrypted(roomId)
            );
        } catch (e) {
            logger.warn("Could not check whether the server supports delayed events", e);
            return false;
        }
    }

    /** Ask the server to send a message at its time, if it can, so it goes out even when Element is closed. */
    private async handOver(message: ScheduledMessage): Promise<void> {
        const client = this.client;
        if (!client || message.delayId || this.handingOver.has(message.id)) return;
        this.handingOver.add(message.id);
        try {
            // The person may change the time or text while the server is being asked, so go again if they did
            for (let again = true; again; ) {
                again = false;
                const { sendAt, content } = message;
                if (sendAt - Date.now() < MIN_SERVER_DELAY_MS) return;
                if (!(await this.canHoldOnServer(client, message.roomId))) return;

                const position = this.group(groupIdOf(message)).indexOf(message);
                const delay = sendAt - Date.now() + Math.max(position, 0) * ORDER_GAP_MS;
                const { delay_id } = await client._unstable_sendDelayedEvent(
                    message.roomId,
                    { delay },
                    message.threadId,
                    EventType.RoomMessage,
                    content,
                );

                const changed = message.sendAt !== sendAt || message.content !== content;
                if (!this.messages.includes(message) || changed) {
                    // Cancelled, sent or edited in the meantime: the server's copy is out of date
                    await client._unstable_cancelScheduledDelayedEvent(delay_id).catch((e) => {
                        if (!isNotFound(e)) logger.warn("Could not cancel an out of date delayed event", e);
                    });
                    again = this.messages.includes(message);
                    continue;
                }

                message.delayId = delay_id;
                // The server sends it now, so the timer here must not
                clearTimeout(this.timers.get(message.id));
                this.timers.delete(message.id);
                this.save();
            }
        } catch (e) {
            // The server may be unreachable or refuse (e.g. too long a delay): the browser sends it instead
            logger.warn("Could not hand the scheduled message to the server, keeping it here", e);
        } finally {
            this.handingOver.delete(message.id);
        }
    }

    /**
     * Compare with what the server holds: forget messages it has sent or lost, and list ones scheduled from
     * another device. Does nothing if the server cannot be reached.
     */
    private async refresh(): Promise<void> {
        const client = this.client;
        if (!client || this.handingOver.size > 0) return;
        const onServer: ServerScheduledEvent[] = [];
        try {
            let from: string | undefined;
            do {
                const page = await client._unstable_getDelayedEvents("scheduled", undefined, from);
                onServer.push(...(page.scheduled ?? []));
                from = page.next_batch;
            } while (from);
        } catch (e) {
            // Unsupported or offline: keep what we have
            logger.debug("Could not list the messages the server holds", e);
            return;
        }
        if (this.client !== client || this.handingOver.size > 0) return;

        const held = new Set(onServer.map((item) => item.delay_id));
        const gone = this.messages.filter((m) => m.delayId && !held.has(m.delayId));
        if (gone.length > 0) this.messages = this.messages.filter((m) => !gone.includes(m));

        const known = new Set(this.messages.map((m) => m.delayId));
        const added = onServer.filter((item) => !known.has(item.delay_id)).flatMap((item) => this.fromServer(item));
        this.messages.push(...added);
        if (gone.length > 0 || added.length > 0) this.save();
        else this.armServerCheck();
    }

    /** A message another device scheduled, as listed by the server. Anything else it holds is ignored. */
    private fromServer(item: ServerScheduledEvent): ScheduledMessage[] {
        if (item.type !== EventType.RoomMessage || "state_key" in item) return [];
        if (!("delay" in item) || typeof item.delay !== "number") return [];
        const relation = (item.content as { "m.relates_to"?: { rel_type?: string; event_id?: string } })[
            "m.relates_to"
        ];
        return [
            {
                id: `server-${item.delay_id}`,
                roomId: item.room_id,
                threadId: relation?.rel_type === THREAD_RELATION_TYPE.name ? (relation.event_id ?? null) : null,
                content: item.content as RoomMessageEventContent,
                sendAt: item.running_since + item.delay,
                delayId: item.delay_id,
            },
        ];
    }

    /** Check with the server shortly after the next message it holds is due, to see that it went out. */
    private armServerCheck(): void {
        clearTimeout(this.serverCheckTimer);
        const next = Math.min(...this.messages.filter((m) => m.delayId).map((m) => m.sendAt));
        if (!Number.isFinite(next)) return;
        const wait = Math.max(next - Date.now(), 0) + SERVER_CHECK_GRACE_MS;
        this.serverCheckTimer = setTimeout(() => void this.refresh(), Math.min(wait, MAX_TIMEOUT_MS));
    }

    private remove(match: (message: ScheduledMessage) => boolean): void {
        for (const message of this.messages.filter(match)) {
            clearTimeout(this.timers.get(message.id));
            this.timers.delete(message.id);
        }
        this.messages = this.messages.filter((m) => !match(m));
        this.save();
    }

    private save(): void {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.messages));
        } catch (e) {
            logger.warn("Could not save scheduled messages", e);
        }
        this.armServerCheck();
        this.emit(ScheduledMessages.UPDATE);
    }

    private arm = (message: ScheduledMessage): void => {
        clearTimeout(this.timers.get(message.id));
        // The server sends the ones it holds
        if (message.delayId) return;
        const delay = message.sendAt - Date.now();
        if (delay <= 0) {
            void this.send(message);
            return;
        }
        this.timers.set(
            message.id,
            setTimeout(() => this.arm(message), Math.min(delay, MAX_TIMEOUT_MS)),
        );
    };

    private async send(message: ScheduledMessage): Promise<void> {
        const client = this.client;
        if (!client) return;
        // Take it off the queue first so a slow send cannot fire twice
        this.remove((m) => m.id === message.id);
        try {
            await client.sendMessage(message.roomId, message.threadId, message.content);
        } catch (e) {
            logger.warn("Failed to send scheduled message, will try again", e);
            this.schedule(
                message.roomId,
                message.threadId,
                message.content,
                Date.now() + RETRY_DELAY_MS,
                message.batchId,
            );
        }
    }
}

export const scheduledMessages = new ScheduledMessages();
