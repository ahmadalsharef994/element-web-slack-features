/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { useState, type JSX } from "react";

import { _t } from "../../../languageHandler";
import BaseDialog from "./BaseDialog";
import DialogButtons from "../elements/DialogButtons";
import Field from "../elements/Field";

interface IProps {
    /** The time to start from, as a timestamp in ms. Defaults to an hour from now. */
    sendAt?: number;
    /** Shows a field for the text, starting with this, so a scheduled message can be edited. */
    text?: string;
    /** Label of the text field. Defaults to "Message". */
    textLabel?: string;
    /** Whether the text can be left empty. Defaults to false. */
    textOptional?: boolean;
    /** `sendAt` is the chosen time as a timestamp in ms and `text` the edited text, when confirmed. */
    onFinished: (confirmed: boolean, sendAt?: number, text?: string) => void;
}

/** The value `<input type="datetime-local">` expects, in local time. */
function toInputValue(date: Date): string {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
    return local.toISOString().slice(0, 16);
}

/** Asks for the date and time to send a message at, and when editing one, for its text too. */
export default function SchedulePickerDialog({
    sendAt: initialSendAt,
    text: initialText,
    textLabel,
    textOptional,
    onFinished,
}: IProps): JSX.Element {
    const editing = initialText !== undefined;
    // Read once, as a time that passes while the dialog is open is still sent, straight away
    const [openedAt] = useState(() => Date.now());
    const [value, setValue] = useState(() => toInputValue(new Date(initialSendAt ?? openedAt + 60 * 60 * 1000)));
    const [text, setText] = useState(initialText ?? "");
    const sendAt = new Date(value).getTime();
    const timeValid = Number.isFinite(sendAt) && sendAt > openedAt;
    const valid = timeValid && (!editing || textOptional || text.trim() !== "");

    return (
        <BaseDialog
            className="mx_SchedulePickerDialog"
            title={editing ? _t("schedule_send|edit_title") : _t("schedule_send|picker_title")}
            onFinished={() => onFinished(false)}
            fixedWidth={false}
        >
            <div className="mx_Dialog_content">
                {editing && (
                    <Field
                        element="textarea"
                        label={textLabel ?? _t("schedule_send|text_label")}
                        value={text}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
                        autoFocus={true}
                    />
                )}
                <Field
                    type="datetime-local"
                    label={_t("schedule_send|picker_label")}
                    value={value}
                    min={toInputValue(new Date(openedAt))}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
                />
                {!timeValid && <p role="alert">{_t("schedule_send|picker_past")}</p>}
            </div>
            <DialogButtons
                primaryButton={editing ? _t("action|save") : _t("schedule_send|picker_confirm")}
                primaryDisabled={!valid}
                onPrimaryButtonClick={() => onFinished(true, sendAt, editing ? text.trim() : undefined)}
                onCancel={() => onFinished(false)}
            />
        </BaseDialog>
    );
}
