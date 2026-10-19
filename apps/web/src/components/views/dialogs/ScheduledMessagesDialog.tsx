/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { useEffect, useState, type JSX } from "react";

import { _t } from "../../../languageHandler";
import BaseDialog from "./BaseDialog";
import SchedulePickerDialog from "./SchedulePickerDialog";
import AccessibleButton from "../elements/AccessibleButton";
import Modal from "../../../Modal";
import { MatrixClientPeg } from "../../../MatrixClientPeg";
import { formatFullDate } from "../../../DateUtils";
import {
    getScheduledFileName,
    getScheduledText,
    scheduledMessages,
    ScheduledMessages,
    type ScheduledGroup,
} from "../../../utils/scheduledMessages";

interface IProps {
    onFinished: () => void;
}

/** Lists everything scheduled, in every room, with a way to edit, cancel or send each one now. */
export default function ScheduledMessagesDialog({ onFinished }: IProps): JSX.Element {
    const [groups, setGroups] = useState(() => scheduledMessages.getGroups());
    useEffect(() => {
        const update = (): void => setGroups(scheduledMessages.getGroups());
        scheduledMessages.on(ScheduledMessages.UPDATE, update);
        return () => {
            scheduledMessages.off(ScheduledMessages.UPDATE, update);
        };
    }, []);

    const edit = async (group: ScheduledGroup): Promise<void> => {
        const first = group.messages[0].content;
        const hasFiles = getScheduledFileName(first) !== undefined;
        const { finished } = Modal.createDialog(SchedulePickerDialog, {
            sendAt: group.sendAt,
            text: getScheduledText(first),
            textLabel: hasFiles ? _t("schedule_send|caption_label") : undefined,
            textOptional: hasFiles,
        });
        const [confirmed, sendAt, text] = await finished;
        if (confirmed) scheduledMessages.update(group.id, { sendAt, text });
    };

    return (
        <BaseDialog
            className="mx_ScheduledMessagesDialog"
            title={_t("schedule_send|list_title")}
            onFinished={onFinished}
        >
            <div className="mx_Dialog_content">
                {groups.length === 0 && <p>{_t("schedule_send|list_empty")}</p>}
                <ul className="mx_ScheduledMessagesDialog_list">
                    {groups.map((group) => {
                        const text = getScheduledText(group.messages[0].content);
                        const fileNames = group.messages
                            .map((message) => getScheduledFileName(message.content))
                            .filter((name) => name !== undefined);
                        const roomName = MatrixClientPeg.get()?.getRoom(group.roomId)?.name ?? group.roomId;
                        return (
                            <li key={group.id} className="mx_ScheduledMessagesDialog_item">
                                <div className="mx_ScheduledMessagesDialog_details">
                                    <div className="mx_ScheduledMessagesDialog_time">
                                        {roomName} · {formatFullDate(new Date(group.sendAt))}
                                    </div>
                                    {text && <div className="mx_ScheduledMessagesDialog_body">{text}</div>}
                                    {fileNames.length > 0 && (
                                        <div className="mx_ScheduledMessagesDialog_files">{fileNames.join(", ")}</div>
                                    )}
                                </div>
                                <div className="mx_ScheduledMessagesDialog_actions">
                                    <AccessibleButton kind="primary_outline" onClick={() => void edit(group)}>
                                        {_t("action|edit")}
                                    </AccessibleButton>
                                    <AccessibleButton
                                        kind="primary_outline"
                                        onClick={() => scheduledMessages.sendNow(group.id)}
                                    >
                                        {_t("schedule_send|send_now")}
                                    </AccessibleButton>
                                    <AccessibleButton
                                        kind="danger_outline"
                                        onClick={() => scheduledMessages.cancel(group.id)}
                                    >
                                        {_t("action|cancel")}
                                    </AccessibleButton>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </BaseDialog>
    );
}
