/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// @vitest-environment happy-dom

import React, { createRef } from "react";
import { describe, it, expect, vi } from "vitest";
import { act, render, screen } from "test-utils-rtl";

import MessageComposerFormatBar from "./MessageComposerFormatBar";

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

    it("marks only the heading button as added by Ahmad", () => {
        renderBar(true);

        expect(screen.getByRole("button", { name: "Heading" })).toHaveClass("mx_AddedByAhmad_inline");
        expect(screen.getByRole("button", { name: "Bold" })).not.toHaveClass("mx_AddedByAhmad_inline");
    });
});
