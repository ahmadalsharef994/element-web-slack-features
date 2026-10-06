/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { useEffect, useState, type JSX } from "react";

import { _t } from "../../../languageHandler";
import BaseDialog from "./BaseDialog";
import AccessibleButton from "../elements/AccessibleButton";
import { formatFullDate } from "../../../DateUtils";
import { scheduledMessages, ScheduledMessages } from "../../../utils/scheduledMessages";

interface IProps {
    roomId: string;
    onFinished: () => void;
}

/** Lists the messages scheduled for a room, with a way to cancel each one or send it now. */
export default function ScheduledMessagesDialog({ roomId, onFinished }: IProps): JSX.Element {
    const [messages, setMessages] = useState(() => scheduledMessages.getForRoom(roomId));
    useEffect(() => {
        const update = (): void => setMessages(scheduledMessages.getForRoom(roomId));
        scheduledMessages.on(ScheduledMessages.UPDATE, update);
        return () => {
            scheduledMessages.off(ScheduledMessages.UPDATE, update);
        };
    }, [roomId]);

    return (
        <BaseDialog
            className="mx_ScheduledMessagesDialog"
            title={_t("schedule_send|list_title")}
            onFinished={onFinished}
        >
            <div className="mx_Dialog_content">
                {messages.length === 0 && <p>{_t("schedule_send|list_empty")}</p>}
                <ul className="mx_ScheduledMessagesDialog_list">
                    {messages.map((message) => (
                        <li key={message.id} className="mx_ScheduledMessagesDialog_item">
                            <div>
                                <div className="mx_ScheduledMessagesDialog_time">
                                    {formatFullDate(new Date(message.sendAt))}
                                </div>
                                <div className="mx_ScheduledMessagesDialog_body">{message.content.body}</div>
                            </div>
                            <AccessibleButton
                                kind="primary_outline"
                                onClick={() => scheduledMessages.sendNow(message.id)}
                            >
                                {_t("schedule_send|send_now")}
                            </AccessibleButton>
                            <AccessibleButton
                                kind="danger_outline"
                                onClick={() => scheduledMessages.cancel(message.id)}
                            >
                                {_t("action|cancel")}
                            </AccessibleButton>
                        </li>
                    ))}
                </ul>
            </div>
        </BaseDialog>
    );
}
