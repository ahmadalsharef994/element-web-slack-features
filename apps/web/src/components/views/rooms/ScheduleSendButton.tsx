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
    /** Whether the composer has something to send. If not, the button only opens the list. */
    canSchedule: boolean;
    /** Called with the time to send the composer's message at, as a timestamp in ms. */
    onSchedule: (sendAt: number) => void;
}

/** An hour from now. */
function inOneHour(): number {
    return Date.now() + 60 * 60 * 1000;
}

/** Tomorrow at 9:00 in the user's time zone. */
function tomorrowMorning(): number {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(9, 0, 0, 0);
    return date.getTime();
}

/** A button beside Send that lets people choose a later time to send the message, and see what is scheduled. */
export function ScheduleSendButton({ canSchedule, onSchedule }: IProps): JSX.Element {
    const [menuDisplayed, button, openMenu, closeMenu] = useContextMenu<HTMLDivElement>();
    const [scheduledCount, setScheduledCount] = useState(() => scheduledMessages.getGroups().length);
    useEffect(() => {
        const update = (): void => setScheduledCount(scheduledMessages.getGroups().length);
        scheduledMessages.on(ScheduledMessages.UPDATE, update);
        return () => {
            scheduledMessages.off(ScheduledMessages.UPDATE, update);
        };
    }, []);

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
                {canSchedule && (
                    <IconizedContextMenuOptionList first>
                        <IconizedContextMenuOption
                            label={_t("schedule_send|in_one_hour")}
                            onClick={choose(() => onSchedule(inOneHour()))}
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
                )}
                <IconizedContextMenuOptionList first={!canSchedule}>
                    <IconizedContextMenuOption
                        label={
                            scheduledCount > 0
                                ? _t("schedule_send|manage", { count: scheduledCount })
                                : _t("schedule_send|list_title")
                        }
                        onClick={choose(() => void Modal.createDialog(ScheduledMessagesDialog))}
                    />
                </IconizedContextMenuOptionList>
            </IconizedContextMenu>
        );
    }

    return (
        <>
            <AccessibleButton
                className="mx_MessageComposer_scheduleSend mx_AddedByAhmad_inline"
                onClick={openMenu}
                title={_t("schedule_send|button_title")}
                caption={_t("common|added_by_ahmad")}
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
