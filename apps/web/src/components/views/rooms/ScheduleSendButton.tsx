/*
Copyright 2026 Ahmad

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { useEffect, useState, type JSX } from "react";
import { TimeIcon } from "@vector-im/compound-design-tokens/assets/web/icons";

import { _t } from "../../../languageHandler";
import AccessibleButton from "../elements/AccessibleButton";
import { aboveLeftOf, useContextMenu } from "../../structures/ContextMenu";
import IconizedContextMenu, {
    IconizedContextMenuOption,
    IconizedContextMenuOptionList,
} from "../context_menus/IconizedContextMenu";
import Modal from "../../../Modal";
import SchedulePickerDialog from "../dialogs/SchedulePickerDialog";
import ScheduledMessagesDialog from "../dialogs/ScheduledMessagesDialog";
import { scheduledMessages, ScheduledMessages } from "../../../utils/scheduledMessages";

interface IProps {
    roomId: string;
    /** Called with the time to send the composer's message at, as a timestamp in ms. */
    onSchedule: (sendAt: number) => void;
}

/** Tomorrow at 9:00 in the user's time zone. */
function tomorrowMorning(): number {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(9, 0, 0, 0);
    return date.getTime();
}

/** A button beside Send that lets people choose a later time to send the message. */
export function ScheduleSendButton({ roomId, onSchedule }: IProps): JSX.Element {
    const [menuDisplayed, button, openMenu, closeMenu] = useContextMenu<HTMLDivElement>();
    const [scheduledCount, setScheduledCount] = useState(() => scheduledMessages.getForRoom(roomId).length);
    useEffect(() => {
        const update = (): void => setScheduledCount(scheduledMessages.getForRoom(roomId).length);
        scheduledMessages.on(ScheduledMessages.UPDATE, update);
        return () => {
            scheduledMessages.off(ScheduledMessages.UPDATE, update);
        };
    }, [roomId]);

    const pickCustomTime = async (): Promise<void> => {
        const { finished } = Modal.createDialog(SchedulePickerDialog);
        const [confirmed, sendAt] = await finished;
        if (confirmed && sendAt) onSchedule(sendAt);
    };

    let menu: JSX.Element | undefined;
    if (menuDisplayed && button.current) {
        const choose = (action: () => void) => (): void => {
            closeMenu();
            action();
        };
        menu = (
            <IconizedContextMenu
                {...aboveLeftOf(button.current.getBoundingClientRect())}
                onFinished={closeMenu}
                compact
            >
                <IconizedContextMenuOptionList first>
                    <IconizedContextMenuOption
                        label={_t("schedule_send|in_one_hour")}
                        onClick={choose(() => onSchedule(Date.now() + 60 * 60 * 1000))}
                    />
                    <IconizedContextMenuOption
                        label={_t("schedule_send|tomorrow_morning")}
                        onClick={choose(() => onSchedule(tomorrowMorning()))}
                    />
                    <IconizedContextMenuOption
                        label={_t("schedule_send|custom_time")}
                        onClick={choose(() => void pickCustomTime())}
                    />
                </IconizedContextMenuOptionList>
                {scheduledCount > 0 && (
                    <IconizedContextMenuOptionList>
                        <IconizedContextMenuOption
                            label={_t("schedule_send|manage", { count: scheduledCount })}
                            onClick={choose(() => void Modal.createDialog(ScheduledMessagesDialog, { roomId }))}
                        />
                    </IconizedContextMenuOptionList>
                )}
            </IconizedContextMenu>
        );
    }

    return (
        <>
            <AccessibleButton
                className="mx_MessageComposer_scheduleSend mx_AddedByAhmad_inline"
                onClick={openMenu}
                title={_t("schedule_send|button_title")}
                ref={button}
                data-testid="schedulesendbtn"
                aria-haspopup="menu"
                aria-expanded={menuDisplayed}
            >
                <TimeIcon />
            </AccessibleButton>
            {menu}
        </>
    );
}
