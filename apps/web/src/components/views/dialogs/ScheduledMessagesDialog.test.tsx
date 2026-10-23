/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import React from "react";
import { fireEvent, render, screen } from "test-utils-rtl";
import { type MatrixClient } from "matrix-js-sdk/src/matrix";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ScheduledMessagesDialog from "./ScheduledMessagesDialog";
import SchedulePickerDialog from "./SchedulePickerDialog";
import ErrorDialog from "./ErrorDialog";
import Modal from "../../../Modal";
import { MatrixClientPeg } from "../../../MatrixClientPeg";
import { scheduledMessages } from "../../../utils/scheduledMessages";
import { type RoomMessageEventContent } from "../../../../@types/url-preview";

describe("<ScheduledMessagesDialog />", () => {
    const later = Date.now() + 24 * 60 * 60 * 1000;
    const text = { msgtype: "m.text", body: "see you there" } as RoomMessageEventContent;
    const photo = (name: string, caption?: string): RoomMessageEventContent =>
        ({ msgtype: "m.image", body: caption ?? name, ...(caption ? { filename: name } : {}) }) as never;
    let client: MatrixClient;

    beforeEach(() => {
        localStorage.clear();
        client = {
            getSafeUserId: () => "@me:example.org",
            sendMessage: vi.fn().mockResolvedValue({ event_id: "$e" }),
            getRoom: (id: string) => (id === "!team:x" ? { name: "Team" } : null),
        } as unknown as MatrixClient;
        vi.spyOn(MatrixClientPeg, "get").mockReturnValue(client);
        scheduledMessages.start(client);
    });

    afterEach(() => {
        scheduledMessages.stop();
        vi.restoreAllMocks();
    });

    it("says when nothing is scheduled", () => {
        render(<ScheduledMessagesDialog onFinished={vi.fn()} />);
        expect(screen.getByText("Nothing is scheduled.")).toBeInTheDocument();
    });

    it("is marked as added by Ahmad", () => {
        render(<ScheduledMessagesDialog onFinished={vi.fn()} />);
        expect(screen.getByText("Nothing is scheduled.").closest(".mx_Dialog_content")).toHaveClass("mx_AddedByAhmad");
    });

    it("lists messages from every room, with a photo message as one entry", () => {
        scheduledMessages.schedule("!team:x", null, text, later);
        scheduledMessages.schedule("!other:x", null, photo("a.png", "holiday"), later + 1000, "batch");
        scheduledMessages.schedule("!other:x", null, photo("b.png"), later + 1000, "batch");
        render(<ScheduledMessagesDialog onFinished={vi.fn()} />);

        expect(screen.getAllByRole("listitem")).toHaveLength(2);
        expect(screen.getByText("see you there")).toBeInTheDocument();
        expect(screen.getByText(/^Team · /)).toBeInTheDocument();
        // A room the client does not know is shown by its ID
        expect(screen.getByText(/^!other:x · /)).toBeInTheDocument();
        expect(screen.getByText("holiday")).toBeInTheDocument();
        expect(screen.getByText("a.png, b.png")).toBeInTheDocument();
    });

    it("cancels all of a message's photos", () => {
        scheduledMessages.schedule("!team:x", null, photo("a.png"), later, "batch");
        scheduledMessages.schedule("!team:x", null, photo("b.png"), later, "batch");
        render(<ScheduledMessagesDialog onFinished={vi.fn()} />);

        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

        expect(scheduledMessages.getGroups()).toEqual([]);
        expect(screen.getByText("Nothing is scheduled.")).toBeInTheDocument();
    });

    it("sends straight away", () => {
        scheduledMessages.schedule("!team:x", null, text, later);
        render(<ScheduledMessagesDialog onFinished={vi.fn()} />);

        fireEvent.click(screen.getByRole("button", { name: "Send now" }));

        expect(client.sendMessage).toHaveBeenCalledWith("!team:x", null, text);
    });

    it("changes the text and time of a message", async () => {
        scheduledMessages.schedule("!team:x", null, text, later);
        const createDialog = vi
            .spyOn(Modal, "createDialog")
            .mockReturnValue({ finished: Promise.resolve([true, later + 5000, "see you at 5"]) } as never);
        render(<ScheduledMessagesDialog onFinished={vi.fn()} />);

        fireEvent.click(screen.getByRole("button", { name: "Edit" }));

        expect(createDialog).toHaveBeenCalledWith(SchedulePickerDialog, {
            sendAt: later,
            text: "see you there",
            textLabel: undefined,
            textOptional: false,
        });
        expect(await screen.findByText("see you at 5")).toBeInTheDocument();
        expect(scheduledMessages.getGroups()[0].sendAt).toBe(later + 5000);
    });

    it("lets the caption of a photo be empty", () => {
        scheduledMessages.schedule("!team:x", null, photo("a.png"), later);
        const createDialog = vi
            .spyOn(Modal, "createDialog")
            .mockReturnValue({ finished: Promise.resolve([false]) } as never);
        render(<ScheduledMessagesDialog onFinished={vi.fn()} />);

        fireEvent.click(screen.getByRole("button", { name: "Edit" }));

        expect(createDialog).toHaveBeenCalledWith(
            SchedulePickerDialog,
            expect.objectContaining({ text: "", textLabel: "Caption (optional)", textOptional: true }),
        );
        // Closing the editor without saving changes nothing
        expect(scheduledMessages.getGroups()[0].sendAt).toBe(later);
    });

    it("says who will send each message", () => {
        scheduledMessages.schedule("!team:x", null, text, later);
        scheduledMessages.getAll()[0].delayId = "d1";
        scheduledMessages.schedule("!other:x", null, text, later + 1000);
        render(<ScheduledMessagesDialog onFinished={vi.fn()} />);

        expect(screen.getByText("Your homeserver sends this, even if Element is closed.")).toBeInTheDocument();
        expect(screen.getByText("Sent from this device, only while Element is open.")).toBeInTheDocument();
    });

    it("tells the person when the server holding a message cannot be reached", async () => {
        scheduledMessages.schedule("!team:x", null, text, later);
        scheduledMessages.getAll()[0].delayId = "d1";
        Object.assign(client, {
            _unstable_cancelScheduledDelayedEvent: vi.fn().mockRejectedValue(new Error("offline")),
        });
        const createDialog = vi
            .spyOn(Modal, "createDialog")
            .mockReturnValue({ finished: Promise.resolve([]) } as never);
        render(<ScheduledMessagesDialog onFinished={vi.fn()} />);

        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

        await vi.waitFor(() => expect(createDialog).toHaveBeenCalledWith(ErrorDialog, expect.anything()));
        expect(scheduledMessages.getGroups()).toHaveLength(1);
    });
});
