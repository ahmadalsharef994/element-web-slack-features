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
    /** `sendAt` is the chosen time as a timestamp in ms, when confirmed. */
    onFinished: (confirmed: boolean, sendAt?: number) => void;
}

/** The value `<input type="datetime-local">` expects, in local time. */
function toInputValue(date: Date): string {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
    return local.toISOString().slice(0, 16);
}

/** Asks for the date and time to send a message at. */
export default function SchedulePickerDialog({ onFinished }: IProps): JSX.Element {
    const [value, setValue] = useState(() => toInputValue(new Date(Date.now() + 60 * 60 * 1000)));
    const sendAt = new Date(value).getTime();
    const valid = Number.isFinite(sendAt) && sendAt > Date.now();

    return (
        <BaseDialog
            className="mx_SchedulePickerDialog"
            title={_t("schedule_send|picker_title")}
            onFinished={() => onFinished(false)}
            fixedWidth={false}
        >
            <div className="mx_Dialog_content">
                <Field
                    type="datetime-local"
                    label={_t("schedule_send|picker_label")}
                    value={value}
                    min={toInputValue(new Date())}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
                />
                {!valid && <p role="alert">{_t("schedule_send|picker_past")}</p>}
            </div>
            <DialogButtons
                primaryButton={_t("schedule_send|picker_confirm")}
                primaryDisabled={!valid}
                onPrimaryButtonClick={() => onFinished(true, sendAt)}
                onCancel={() => onFinished(false)}
            />
        </BaseDialog>
    );
}
