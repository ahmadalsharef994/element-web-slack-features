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

import { ScheduleSendButton } from "./ScheduleSendButton";
import ScheduledMessagesDialog from "../dialogs/ScheduledMessagesDialog";
import Modal from "../../../Modal";
import { scheduledMessages } from "../../../utils/scheduledMessages";
import { type RoomMessageEventContent } from "../../../../@types/url-preview";

describe("<ScheduleSendButton />", () => {
    beforeEach(() => {
        localStorage.clear();
        scheduledMessages.start({ getSafeUserId: () => "@me:example.org" } as unknown as MatrixClient);
    });

    afterEach(() => {
        scheduledMessages.stop();
        vi.restoreAllMocks();
    });

    const open = (): void => {
        fireEvent.click(screen.getByTestId("schedulesendbtn"));
    };

    it("offers times to send the composer's message at", () => {
        const onSchedule = vi.fn();
        render(<ScheduleSendButton canSchedule onSchedule={onSchedule} />);
        open();

        expect(screen.getByText("Tomorrow at 9:00")).toBeInTheDocument();
        expect(screen.getByText("Pick date and time…")).toBeInTheDocument();
        fireEvent.click(screen.getByText("In 1 hour"));

        expect(onSchedule).toHaveBeenCalledTimes(1);
        expect(onSchedule.mock.calls[0][0]).toBeGreaterThan(Date.now() + 59 * 60 * 1000);
    });

    it("only offers the list when the composer is empty", () => {
        render(<ScheduleSendButton canSchedule={false} onSchedule={vi.fn()} />);
        open();

        expect(screen.queryByText("In 1 hour")).toBeNull();
        expect(screen.getByText("Scheduled messages")).toBeInTheDocument();
    });

    it("shows how many messages are scheduled, and opens them", () => {
        const createDialog = vi
            .spyOn(Modal, "createDialog")
            .mockReturnValue({ finished: Promise.resolve([]) } as never);
        const content = { msgtype: "m.text", body: "hi" } as RoomMessageEventContent;
        const later = Date.now() + 24 * 60 * 60 * 1000;
        scheduledMessages.schedule("!a:x", null, content, later);
        // The photos of one message count once
        scheduledMessages.schedule("!b:x", null, content, later, "batch");
        scheduledMessages.schedule("!b:x", null, content, later, "batch");

        render(<ScheduleSendButton canSchedule={false} onSchedule={vi.fn()} />);
        open();
        fireEvent.click(screen.getByText("Scheduled messages (2)"));

        expect(createDialog).toHaveBeenCalledWith(ScheduledMessagesDialog);
    });
});
