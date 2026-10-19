/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import React from "react";
import { fireEvent, render, screen } from "test-utils-rtl";
import { describe, expect, it, vi } from "vitest";

import SchedulePickerDialog from "./SchedulePickerDialog";

/** A time `ms` from now, in the form a datetime-local input takes. */
function inputValueIn(ms: number): string {
    const date = new Date(Date.now() + ms);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

describe("<SchedulePickerDialog />", () => {
    it("schedules at the chosen time, without a text field", () => {
        const onFinished = vi.fn();
        render(<SchedulePickerDialog onFinished={onFinished} />);
        expect(screen.queryByRole("textbox")).toBeNull();

        const when = inputValueIn(2 * 60 * 60 * 1000);
        fireEvent.change(screen.getByLabelText("Send at"), { target: { value: when } });
        fireEvent.click(screen.getByRole("button", { name: "Schedule" }));

        expect(onFinished).toHaveBeenCalledWith(true, new Date(when).getTime(), undefined);
    });

    it("does not allow a time in the past", () => {
        render(<SchedulePickerDialog onFinished={vi.fn()} />);

        fireEvent.change(screen.getByLabelText("Send at"), { target: { value: inputValueIn(-60 * 60 * 1000) } });

        expect(screen.getByRole("alert")).toHaveTextContent("Choose a time in the future.");
        expect(screen.getByRole("button", { name: "Schedule" })).toBeDisabled();
    });

    describe("when editing", () => {
        it("starts from the current time and text, and returns the edited text", () => {
            const onFinished = vi.fn();
            const sendAt = new Date(inputValueIn(3 * 60 * 60 * 1000)).getTime();
            render(<SchedulePickerDialog sendAt={sendAt} text="hello" onFinished={onFinished} />);

            expect(screen.getByLabelText("Message")).toHaveValue("hello");
            fireEvent.change(screen.getByLabelText("Message"), { target: { value: "  hello there " } });
            fireEvent.click(screen.getByRole("button", { name: "Save" }));

            expect(onFinished).toHaveBeenCalledWith(true, sendAt, "hello there");
        });

        it("needs some text unless it is optional", () => {
            const { rerender } = render(<SchedulePickerDialog text="" onFinished={vi.fn()} />);
            expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

            rerender(<SchedulePickerDialog text="" textLabel="Caption" textOptional onFinished={vi.fn()} />);
            expect(screen.getByLabelText("Caption")).toBeInTheDocument();
            expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
        });
    });
});
