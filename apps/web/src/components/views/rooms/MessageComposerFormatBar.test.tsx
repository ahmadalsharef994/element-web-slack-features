/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// @vitest-environment happy-dom

import React, { createRef } from "react";
import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen } from "test-utils-rtl";

import MessageComposerFormatBar, { Formatting } from "./MessageComposerFormatBar";

describe("MessageComposerFormatBar", () => {
    const selectionRect = new DOMRect(40, 100, 20, 10);

    const renderBar = (docked: boolean): MessageComposerFormatBar => {
        const ref = createRef<MessageComposerFormatBar>();
        render(<MessageComposerFormatBar ref={ref} shortcuts={{}} onAction={vi.fn()} docked={docked} />);
        return ref.current!;
    };

    it("moves next to the selection when floating", () => {
        const bar = renderBar(false);

        act(() => bar.showAt(selectionRect));

        const toolbar = screen.getByRole("toolbar", { name: "Formatting" });
        expect(toolbar).toHaveClass("mx_MessageComposerFormatBar_shown");
        expect(toolbar.style.left).toBe("40px");
    });

    it("stays where it is when docked", () => {
        const bar = renderBar(true);

        act(() => bar.showAt(selectionRect));

        const toolbar = screen.getByRole("toolbar", { name: "Formatting" });
        expect(toolbar).toHaveClass("mx_MessageComposerFormatBar_docked");
        expect(toolbar.style.left).toBe("");
        expect(toolbar.style.top).toBe("");
    });

    it("marks only the buttons added by Ahmad", () => {
        renderBar(true);

        for (const name of ["Heading", "Bulleted list", "Numbered list"]) {
            expect(screen.getByRole("button", { name })).toHaveClass("mx_AddedByAhmad_inline");
        }
        expect(screen.getByRole("button", { name: "Bold" })).not.toHaveClass("mx_AddedByAhmad_inline");
    });

    it.each([
        ["Bulleted list", Formatting.BulletList],
        ["Numbered list", Formatting.NumberedList],
    ])("asks for %s formatting when its button is clicked", (name, formatting) => {
        const onAction = vi.fn();
        render(<MessageComposerFormatBar shortcuts={{}} onAction={onAction} docked />);

        fireEvent.click(screen.getByRole("button", { name }));

        expect(onAction).toHaveBeenCalledWith(formatting);
    });
});
