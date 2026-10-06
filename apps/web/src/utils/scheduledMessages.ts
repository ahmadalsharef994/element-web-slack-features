/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { EventEmitter } from "events";
import { logger } from "matrix-js-sdk/src/logger";
import { type MatrixClient } from "matrix-js-sdk/src/matrix";

import { type RoomMessageEventContent } from "../../@types/url-preview";

/** A message the user has asked to send later. */
export interface ScheduledMessage {
    id: string;
    roomId: string;
    threadId: string | null;
    content: RoomMessageEventContent;
    /** When to send, as a timestamp in ms. */
    sendAt: number;
}

/** Longest delay `setTimeout` accepts; longer waits are done in several steps. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;
/** How long to wait before trying again when sending fails, e.g. while offline. */
const RETRY_DELAY_MS = 60 * 1000;

/**
 * Keeps messages scheduled for later and sends them when their time comes.
 *
 * ponytail: the queue lives in this browser and only sends while Element is open. For sending
 * while closed, use delayed events (MSC4140) on servers that support them.
 */
export class ScheduledMessages extends EventEmitter {
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

    public getForRoom(roomId: string): ScheduledMessage[] {
        return this.getAll().filter((m) => m.roomId === roomId);
    }

    public schedule(
        roomId: string,
        threadId: string | null,
        content: RoomMessageEventContent,
        sendAt: number,
    ): ScheduledMessage {
        const message = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            roomId,
            threadId,
            content,
            sendAt,
        };
        this.messages.push(message);
        this.save();
        this.arm(message);
        return message;
    }

    public cancel(id: string): void {
        clearTimeout(this.timers.get(id));
        this.timers.delete(id);
        this.messages = this.messages.filter((m) => m.id !== id);
        this.save();
    }

    /** Send a scheduled message straight away instead of waiting. */
    public sendNow(id: string): void {
        const message = this.messages.find((m) => m.id === id);
        if (message) void this.send(message);
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
        this.cancel(message.id);
        try {
            await client.sendMessage(message.roomId, message.threadId, message.content);
        } catch (e) {
            logger.warn("Failed to send scheduled message, will try again", e);
            this.schedule(message.roomId, message.threadId, message.content, Date.now() + RETRY_DELAY_MS);
        }
    }
}

export const scheduledMessages = new ScheduledMessages();
