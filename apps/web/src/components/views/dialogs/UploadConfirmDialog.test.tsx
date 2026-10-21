/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import React from "react";
import { fireEvent, render, waitFor } from "test-utils-rtl";
import { secureRandomString } from "matrix-js-sdk/src/randomstring";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

import UploadConfirmDialog from "./UploadConfirmDialog.tsx";
import Modal from "../../../Modal";

/**
 * The shared media preview tile hides the image until it has loaded it once out of band, which jsdom
 * never does: it fires neither `load` nor `error` for a real element. Stub the loader so the preview
 * settles into its loaded state.
 */
class MockImage {
    public onload: (() => void) | null = null;
    public onerror: ((error: unknown) => void) | null = null;
    public naturalWidth = 320;
    public naturalHeight = 240;
    private internalSrc = "";

    public get src(): string {
        return this.internalSrc;
    }

    public set src(value: string) {
        this.internalSrc = value;
        setTimeout(() => this.onload?.(), 0);
    }
}

/**
 * The video and audio tiles probe their source the same way, through a detached element that
 * happy-dom never loads either. Resolve the probe as soon as a source is set.
 */
function mockMediaElement(element: HTMLElement): void {
    Object.defineProperties(element, {
        videoWidth: { configurable: true, value: 320 },
        videoHeight: { configurable: true, value: 240 },
        src: {
            configurable: true,
            get: () => element.getAttribute("src") ?? "",
            set: (value: string) => {
                element.setAttribute("src", value);
                setTimeout(() => (element as HTMLMediaElement).onloadedmetadata?.(new Event("loadedmetadata")), 0);
            },
        },
    });
}

describe("<UploadConfirmDialog />", () => {
    const originalImage = window.Image;
    const createElement = document.createElement.bind(document);

    beforeEach(() => {
        window.Image = MockImage as unknown as typeof window.Image;
        vi.spyOn(document, "createElement").mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
            const element = createElement(tagName, options);
            if (tagName === "video" || tagName === "audio") mockMediaElement(element);
            return element;
        }) as typeof document.createElement);
    });

    afterEach(() => {
        window.Image = originalImage;
        vi.mocked(document.createElement).mockRestore();
    });

    it("should display image preview", async () => {
        const url = "blob:null/1234-5678-9101-1121";
        vi.spyOn(URL, "createObjectURL").mockReturnValue(url);

        const file = new File([secureRandomString(1024 * 124)], "image.png", { type: "image/png" });
        const { asFragment, getByRole } = render(<UploadConfirmDialog files={[file]} onFinished={vi.fn()} />);

        // The preview labels the image with the file name.
        await waitFor(() => expect(getByRole("img", { name: "image.png" })).toHaveAttribute("src", url));
        expect(asFragment()).toMatchSnapshot();
    });
    it.each([
        ["video", "video/mp4", "clip.mp4"],
        ["audio", "audio/ogg", "voice.ogg"],
    ])("should display %s preview", async (tag, type, name) => {
        const url = "blob:null/1234-5678-9101-1121";
        vi.spyOn(URL, "createObjectURL").mockReturnValue(url);

        const file = new File([secureRandomString(1024 * 124)], name, { type });
        const { container } = render(<UploadConfirmDialog files={[file]} onFinished={vi.fn()} />);

        await waitFor(() => expect(container.querySelector(tag)).toHaveAttribute("src", url));
    });

    it("should display a file with no media preview", () => {
        const file = new File(["hello"], "notes.txt", { type: "text/plain" });
        const { container, getByText } = render(<UploadConfirmDialog files={[file]} onFinished={vi.fn()} />);

        expect(getByText("notes.txt")).toBeInTheDocument();
        expect(container.querySelector("img, video, audio")).toBeNull();
    });

    it("should pass the trimmed caption when uploading", () => {
        const onFinished = vi.fn();
        const file = new File(["hello"], "notes.txt", { type: "text/plain" });
        const { getByLabelText, getByText } = render(<UploadConfirmDialog files={[file]} onFinished={onFinished} />);

        fireEvent.change(getByLabelText("Add a caption (optional)"), { target: { value: "  hi  " } });
        fireEvent.click(getByText("Upload"));

        expect(onFinished).toHaveBeenCalledWith(true, "hi");
    });

    it("should upload with the caption when pressing Enter in the caption field", () => {
        const onFinished = vi.fn();
        const file = new File(["hello"], "notes.txt", { type: "text/plain" });
        const { getByLabelText } = render(<UploadConfirmDialog files={[file]} onFinished={onFinished} />);

        const input = getByLabelText("Add a caption (optional)");
        fireEvent.change(input, { target: { value: "hello" } });
        fireEvent.keyDown(input, { key: "Enter" });

        expect(onFinished).toHaveBeenCalledWith(true, "hello");
    });

    it("should not pass a caption when the field is empty", () => {
        const onFinished = vi.fn();
        const file = new File(["hello"], "notes.txt", { type: "text/plain" });
        const { getByText } = render(<UploadConfirmDialog files={[file]} onFinished={onFinished} />);

        fireEvent.click(getByText("Upload"));

        expect(onFinished).toHaveBeenCalledWith(true, undefined);
    });

    it("should preview every file and caption them together", () => {
        const onFinished = vi.fn();
        // Two files with the same name, as when pasting images
        const files = [
            new File(["a"], "image.png", { type: "image/png" }),
            new File(["b"], "image.png", { type: "image/png" }),
            new File(["c"], "notes.txt", { type: "text/plain" }),
        ];
        const { getAllByText, getByText, getByLabelText } = render(
            <UploadConfirmDialog files={files} onFinished={onFinished} />,
        );

        expect(getAllByText("image.png")).toHaveLength(2);
        expect(getByText("notes.txt")).toBeInTheDocument();

        fireEvent.change(getByLabelText("Add a caption (optional)"), { target: { value: "holiday" } });
        fireEvent.click(getByText("Upload"));
        expect(onFinished).toHaveBeenCalledTimes(1);
        expect(onFinished).toHaveBeenCalledWith(true, "holiday");
    });

    describe("scheduling", () => {
        const file = new File(["hello"], "notes.txt", { type: "text/plain" });

        it("should mark the schedule button as added by Ahmad", () => {
            const { getByRole } = render(<UploadConfirmDialog files={[file]} onFinished={vi.fn()} />);

            const button = getByRole("button", { name: "Schedule" });
            expect(button).toHaveClass("mx_AddedByAhmad_inline");
            expect(button).toHaveAttribute("title", "New, added by Ahmad");
        });

        it("should pass the chosen time and the caption", async () => {
            vi.spyOn(Modal, "createDialog").mockReturnValue({ finished: Promise.resolve([true, 1234]) } as any);
            const onFinished = vi.fn();
            const { getByLabelText, getByText } = render(
                <UploadConfirmDialog files={[file]} onFinished={onFinished} />,
            );

            fireEvent.change(getByLabelText("Add a caption (optional)"), { target: { value: "later" } });
            fireEvent.click(getByText("Schedule"));

            await waitFor(() => expect(onFinished).toHaveBeenCalledWith(true, "later", 1234));
        });

        it("should keep the dialog open when no time is chosen", async () => {
            const createDialog = vi
                .spyOn(Modal, "createDialog")
                .mockReturnValue({ finished: Promise.resolve([false]) } as any);
            const onFinished = vi.fn();
            const { getByText } = render(<UploadConfirmDialog files={[file]} onFinished={onFinished} />);

            fireEvent.click(getByText("Schedule"));

            await waitFor(() => expect(createDialog).toHaveBeenCalled());
            expect(onFinished).not.toHaveBeenCalled();
        });
    });
});
