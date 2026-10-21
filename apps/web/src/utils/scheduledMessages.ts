/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/src/logger";
import { type MatrixClient, MsgType, TypedEventEmitter } from "matrix-js-sdk/src/matrix";

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

/**
 * Keeps messages scheduled for later and sends them when their time comes.
 *
 * The queue lives in this browser and only sends while Element is open. Sending while it is closed
 * would need delayed events (MSC4140) on servers that support them.
 */
export class ScheduledMessages extends TypedEventEmitter<"update", { update: () => void }> {
    public static readonly UPDATE = "update";

    private client?: MatrixClient;
    private messages: ScheduledMessage[] = [];
    private timers = new Map<string, ReturnType<typeof setTimeout>>();

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
        this.emit(ScheduledMessages.UPDATE);
    }

    public stop(): void {
        this.timers.forEach(clearTimeout);
        this.timers.clear();
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
        return message;
    }

    /** Cancel a scheduled message and everything scheduled with it. */
    public cancel(groupId: string): void {
        this.remove((m) => groupIdOf(m) === groupId);
    }

    /** Send a scheduled message and everything scheduled with it straight away instead of waiting. */
    public sendNow(groupId: string): void {
        this.messages.filter((m) => groupIdOf(m) === groupId).forEach((m) => void this.send(m));
    }

    /**
     * Change when a scheduled message is sent, and/or its text (the caption, for photos and files).
     * Applies to everything scheduled with it.
     */
    public update(groupId: string, changes: { sendAt?: number; text?: string }): void {
        const { sendAt, text } = changes;
        const group = this.messages.filter((m) => groupIdOf(m) === groupId);
        if (sendAt !== undefined) group.forEach((m) => (m.sendAt = sendAt));
        // The text lives on the first event: the message itself, or the first photo
        if (text !== undefined && group.length > 0) group[0].content = withText(group[0].content, text);
        this.save();
        group.forEach(this.arm);
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
        this.emit(ScheduledMessages.UPDATE);
    }

    private arm = (message: ScheduledMessage): void => {
        clearTimeout(this.timers.get(message.id));
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
