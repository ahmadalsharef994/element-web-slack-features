/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { rejectToastIfExists } from "@element-hq/element-web-playwright-common";

import { test, expect } from "../../element-web-test";
import { getSampleFilePath } from "../../sample-files";

test.describe("Schedule send", () => {
    test.use({ displayName: "Janet" });

    test.beforeEach(async ({ page, app, user }) => {
        await app.client.createRoom({ name: "Later Room" });
        await app.viewRoomByName("Later Room");
        await rejectToastIfExists(page, "Notifications");
        await expect(
            page
                .locator(".mx_GenericEventListSummary[data-layout='group'] .mx_GenericEventListSummary_summary")
                .getByText(`${user.displayName} created and configured the room.`),
        ).toBeVisible();
    });

    test("keeps a message for later, which can then be edited or cancelled", async ({ page }) => {
        const composer = page.getByRole("textbox", { name: "Send an unencrypted message…" });
        await composer.pressSequentially("see you tomorrow");
        await page.getByRole("button", { name: "Schedule send" }).click();
        await page.getByRole("menuitem", { name: "In 1 hour" }).click();

        // It is kept instead of being sent
        await expect(composer).toHaveText("");
        await expect(page.getByText("see you tomorrow")).not.toBeVisible();

        // The list is reachable with an empty composer, and lists it with its room
        await page.getByRole("button", { name: "Schedule send" }).click();
        await page.getByRole("menuitem", { name: "Scheduled messages (1)" }).click();
        const dialog = page.getByRole("dialog", { name: "Scheduled messages" });
        await expect(dialog.getByText("see you tomorrow")).toBeVisible();
        await expect(dialog.getByText(/^Later Room · /)).toBeVisible();

        // Edit the text
        await dialog.getByRole("button", { name: "Edit" }).click();
        const editor = page.getByRole("dialog", { name: "Edit scheduled message" });
        await editor.getByLabel("Message").fill("see you in an hour");
        await editor.getByRole("button", { name: "Save" }).click();
        await expect(dialog.getByText("see you in an hour")).toBeVisible();
        await expect(dialog.getByText("see you tomorrow")).not.toBeVisible();

        // Cancel it
        await dialog.getByRole("button", { name: "Cancel" }).click();
        await expect(dialog.getByText("Nothing is scheduled.")).toBeVisible();
    });

    test("keeps several photos with one caption together, and sends them on request", async ({ page, app }) => {
        await app.setComposerInputFiles("room", [getSampleFilePath("riot.png"), getSampleFilePath("element.png")]);

        // Both photos are in the one dialog, with a single caption
        const upload = page.getByRole("dialog", { name: "Upload files" });
        await expect(upload.getByText("riot.png")).toBeVisible();
        await expect(upload.getByText("element.png")).toBeVisible();
        await upload.getByLabel("Add a caption (optional)").fill("our logos");
        await upload.getByRole("button", { name: "Schedule" }).click();
        await page.getByRole("dialog", { name: "Schedule message" }).getByRole("button", { name: "Schedule" }).click();

        // Nothing was sent yet
        await expect(page.locator(".mx_ImageBody")).toHaveCount(0);

        // They are one entry in the list
        await page.getByRole("button", { name: "Schedule send" }).click();
        await page.getByRole("menuitem", { name: "Scheduled messages (1)" }).click();
        const dialog = page.getByRole("dialog", { name: "Scheduled messages" });
        await expect(dialog.getByRole("listitem")).toHaveCount(1);
        await expect(dialog.getByText("our logos")).toBeVisible();
        await expect(dialog.getByText("riot.png, element.png")).toBeVisible();

        // Sending now delivers both photos
        await dialog.getByRole("button", { name: "Send now" }).click();
        await page.getByRole("button", { name: "Close dialog" }).click();
        await expect(page.locator(".mx_ImageBody")).toHaveCount(2);
    });
});
