# Element Web → Slack-like fork: engineering brief

## 1. Repo orientation

1. **Layout**: pnpm/nx monorepo. App code in `apps/web/src` (legacy class components + MVVM view models in `apps/web/src/viewmodels`); dumb views/CSS modules in `packages/shared-components`; sanitizer/HTML policy in `packages/shared-utils/src/html`; runtime Module API in `packages/module-api`. Example runtime modules in `modules/banner`. Rules in `AGENTS.md`, architecture in `docs/MVVM.md`.
2. **Run**: already a git clone of element-hq/element-web (HEAD b2dd6d5) — branch, don't re-clone. `pnpm install` at root; copy `apps/web/config.sample.json` → `apps/web/config.json`, set `"show_labs_settings": true` (+ optional `"features": {...}`); `cd apps/web && pnpm start` (webpack-dev-server, :8080; nx target in `apps/web/project.json`).
3. **Add a setting/labs flag**: declare the key in the `Settings` interface and `SETTINGS` object in `apps/web/src/settings/Settings.tsx` (labs: `IFeature` with `isFeature: true`, `labsGroup`, `LEVELS_DEVICE_ONLY_SETTINGS_WITH_CONFIG_PRIORITISED`, `default: false`; user pref: `LEVELS_ACCOUNT_SETTINGS`). Surface via `<SettingsFlag>` in `apps/web/src/components/views/settings/tabs/user/PreferencesUserSettingsTab.tsx` or automatically in `LabsUserSettingsTab.tsx`. Read with `SettingsStore.getValue()` / `useSettingValue()` (`apps/web/src/hooks/useSettings.ts`). Document labs flags in `docs/labs.md` (process: `docs/feature-flags.md`). Server-gated flags use `apps/web/src/settings/controllers/ServerSupportUnstableFeatureController.ts`.
4. **i18n**: add `_t`/`_td` strings, then `pnpm i18n` regenerates `apps/web/src/i18n/strings/en_EN.json` (shared-components has its own strings dir).
5. **Quality**: `pnpm lint` (oxlint/oxfmt — not eslint/prettier), `pnpm vitest run <path>` with co-located `*.test.ts(x)`, copyright header on every new file, `pnpm lint:knip` fails on unused exports.

---

## 2. Hide last seen / presence

**Current state**: Own presence is sent by `apps/web/src/Presence.ts` (Online on `Action.UserActivity`, Unavailable after 3 min) via `setSyncPresence()` → `set_presence` on every `/sync`. Started in `apps/web/src/Lifecycle.ts:1075` unless `lowBandwidth` is on. No `SettingsStore` key hides presence in either direction; the only display gate is config `enable_presence_by_hs_url`, read in three behaviourally identical places.

**Files**:

- `apps/web/src/Presence.ts`, `apps/web/src/Lifecycle.ts`, `apps/web/src/MatrixClientPeg.ts`
- `apps/web/src/settings/Settings.tsx` (template: `sendTypingNotifications` :926)
- `apps/web/src/components/views/settings/tabs/user/PreferencesUserSettingsTab.tsx` (`PRESENCE_SETTINGS` :124)
- `apps/web/src/utils/presence.ts`, `apps/web/src/stores/MemberListStore.ts` (:143-149), `apps/web/src/components/viewmodels/right_panel/user_info/UserInfoHeaderViewModel.ts` (:72, :100-102)
- Render sites: `apps/web/src/components/viewmodels/memberlist/MemberListViewModel.ts`, `apps/web/src/components/views/rooms/MemberList/tiles/RoomMemberTileView.tsx`, `apps/web/src/components/views/right_panel/user_info/UserInfoHeaderView.tsx`, `apps/web/src/components/views/rooms/PresenceLabel.tsx`, `apps/web/src/components/views/avatars/WithPresenceIndicator.tsx`, `apps/web/src/components/viewmodels/avatars/RoomAvatarViewModel.ts`, `apps/web/src/components/views/avatars/DecoratedRoomAvatarView.tsx`, `apps/web/src/components/views/avatars/DecoratedRoomAvatar.tsx`, `apps/web/src/components/views/rooms/RoomHeader/RoomHeader.tsx`
- Tests: `apps/web/src/components/views/avatars/WithPresenceIndicator.test.tsx`, `apps/web/src/stores/MemberListStore.test.ts`, `apps/web/src/components/viewmodels/right_panel/user_info/UserInfoHeaderViewModel.test.ts`

**Steps**:

1. _Hide own_: add `sharePresence` (boolean, `LEVELS_ACCOUNT_SETTINGS`, default true) in `Settings.tsx`. In `Presence.ts` `setState()`, when false send `SetPresence.Offline` via `setSyncPresence` instead of Online/Unavailable; `watchSetting("sharePresence")` in `start()` to force a send on toggle (the `newState === this.state` early return otherwise swallows it); unwatch in `stop()`.
2. Add key to `PRESENCE_SETTINGS`; add string; `pnpm i18n`.
3. _Hide others_: add `showPresence` (boolean, default true). Make `utils/presence.ts isPresenceEnabled()` return false when off, then replace the duplicate checks in `MemberListStore.isPresenceEnabled()` and `UserInfoHeaderViewModel` with that helper — covers member list, user-info "Online for X", DM avatars (new + legacy).
4. Reactivity: use `useSettingValue("showPresence")` in `MemberListViewModel.ts` (:186 useMemo) and `usePresence` in `WithPresenceIndicator.tsx`.
5. Tests: extend the three test files; add a `Presence.test.ts` asserting `setSyncPresence("offline")`.
6. Optional hard switch: `opts.disablePresence = !sharePresence` in `MatrixClientPeg.ts` (~:288) with `ReloadOnChangeController`.

**Difficulty**: small. **Server dependency**: none (spec'd `set_presence=offline`). Caveat: server still tracks `last_active_ago` from API calls and other devices publish their own presence; only Synapse `presence.enabled=false` fully hides.

**Gotchas**: sliding-sync SDK `setPresence` is a no-op (already sends nothing). Sending Offline sorts you to the bottom of member lists; Unavailable reads as "Away". `PresenceIconView.tsx` throws on unknown presence strings. Snapshot `PreferencesUserSettingsTab.test.tsx.snap` needs updating. `lowBandwidth` is not a usable hide switch (kills encryption/avatars too).

---

## 3. Schedule messages (send later)

**Current state**: No UI, setting, slash command, or string. The js-sdk (42.3.0) fully exposes MSC4140 delayed events (`_unstable_sendDelayedEvent`, `_unstable_getDelayedEvents`, `_unstable_cancel/restart/sendScheduledDelayedEvent`, `UNSTABLE_MSC4140_DELAYED_EVENTS`, `doesServerSupportUnstableFeature`). Only consumer is the widget bridge `apps/web/src/stores/widgets/ElementWidgetDriver.ts` (:394-505). Two composer send paths both end in `doMaybeLocalRoomAction(... mxClient.sendMessage ...)`.

**Files**:

- `apps/web/src/components/views/rooms/SendMessageComposer.tsx` (send at :487-489; `shouldSend = false` branch :415)
- `apps/web/src/components/views/rooms/wysiwyg_composer/utils/message.ts` (:137-139)
- `apps/web/src/components/views/rooms/MessageComposer.tsx` (`SendButton` :78-88, `sendMessage` :403)
- `apps/web/src/components/views/rooms/MessageComposerButtons.tsx` (overflow menu :148-158)
- `apps/web/src/slash-commands/SlashCommands.tsx`, `apps/web/src/slash-commands/command.ts`, `apps/web/src/editor/commands.tsx`
- `apps/web/src/ContentMessages.ts` (uploads :587-680), `apps/web/src/components/views/rooms/EditMessageComposer.tsx` (:372)
- `apps/web/src/settings/Settings.tsx`, `apps/web/src/settings/controllers/ServerSupportUnstableFeatureController.ts`
- `apps/web/src/utils/StorageAccess.ts`, `apps/web/src/hooks/useLocalStorageState.ts`, `apps/web/src/stores/AsyncStoreWithClient.ts`, `apps/web/src/stores/OwnBeaconStore.ts` (pattern), `apps/web/src/Lifecycle.ts` (:1047)
- `apps/web/src/components/views/context_menus/IconizedContextMenu.tsx`, `apps/web/src/components/structures/ContextMenu.tsx` (`useContextMenu` :578), `apps/web/src/DateUtils.ts`
- `apps/web/src/test/test-utils/test-utils.ts` (:316-320 stubs the `_unstable_*` methods except `_unstable_getDelayedEvents`)
- SDK reference: `apps/web/node_modules/matrix-js-sdk/lib/client.d.ts`, `lib/@types/requests.d.ts`, `lib/client.js`

**Steps**:

1. Labs flag `feature_scheduled_messages` (`LabGroup.Messaging`). Do not gate on server support; choose backend at send time.
2. Add `sendAt?: number` to `SendMessageComposer.sendMessage()` params and WYSIWYG `SendMessageParams`; when set, call new `apps/web/src/utils/scheduledMessages.ts scheduleMessage(client, roomId, threadId, content, sendAt)` instead of `sendMessage`. Keep clear-composer/history/`message_sent` behaviour.
3. Server path: if `doesServerSupportUnstableFeature(UNSTABLE_MSC4140_DELAYED_EVENTS)` **and** `!room.hasEncryptionStateEvent()` → `_unstable_sendDelayedEvent(roomId, { delay }, threadId, EventType.RoomMessage, content)` (shape from `ElementWidgetDriver.ts:436-443`). List/cancel/send-now via `_unstable_getDelayedEvents("scheduled")` filtered by `room_id`.
4. Client-only fallback (E2EE rooms / no MSC4140): `ScheduledMessagesStore extends AsyncStoreWithClient`, entries `{id, roomId, threadId, content, sendAt}` persisted with `idbSave("account", "mx_scheduled_messages", list)` (reuse existing table, no DB version bump). On `onReady()` send overdue, `setTimeout` the rest (clamp to 2^31-1 ms, re-arm). Start from `Lifecycle.ts` next to `ActiveWidgetStore.instance.start()`. Fires only while a tab is open.
5. UI (cheapest first): (a) `/schedule <time> <msg>` in `SlashCommands.tsx` with `isEnabled` on the flag, `runFn` calls `scheduleMessage` and returns `success()` with no content; (b) right-click/long-press `SendButton` → `IconizedContextMenu` presets (1h, tomorrow 9:00, Custom via `Modal.createDialog` + native `<input type="datetime-local">`); (c) entry in `MessageComposerButtons.tsx` overflow menu.
6. Management: room banner or right-panel card merging server `scheduled` list + local store with Cancel/Send now; format with `DateUtils.formatRelativeTime`.
7. Tests: co-located vitest, `vi.useFakeTimers()`; add `_unstable_getDelayedEvents` mock.

**Difficulty**: medium. **Server dependency**: server path needs MSC4140 (Synapse `experimental_features.msc4140_enabled`, `max_event_delay_duration` cap — unverified in repo). Fallback needs nothing.

**Gotchas**: SDK sends delayed events **unencrypted** (`client.js:1872-1875` skips `encryptEventIfNeeded`) — never use in E2EE rooms. No local echo for delayed events (`addPendingEvent` skipped). Both composers plus `EditMessageComposer`/`ContentMessages` have separate `sendMessage` calls. `attachUrlPreviews` runs after clearing the composer; preview may be stale when fired. Replies/thread relations are baked in at compose time. Logout clears local storage (local schedule lost) but server-side delayed events still fire. `_unstable_getDelayedEvents` is paginated (`next_batch`) and cross-room.

---

## 4. Better tables in messages

**Current state**: Rendering already works: `packages/shared-utils/src/html/sanitizeHtmlParams.ts` `MATRIX_FORMATTING_TAGS` (:50-56) allows table/thead/tbody/tr/th/td/caption; github-markdown-css (imported per theme, e.g. `apps/web/res/themes/light/css/light.pcss:9`) styles them. Composing fails: `apps/web/src/Markdown.ts` wraps commonmark 0.31.2 (no GFM, no plugin API), so a pipe table is a paragraph, `isPlainText()` (:238-276) returns true, and no `formatted_body` is sent. No th/td attributes survive (`MATRIX_ALLOWED_ATTRIBUTES` :64-71). Editing/quoting flattens tables (`editor/deserialize.ts` has no TABLE case). Zero tests cover tables.

**Files**:

- `apps/web/src/Markdown.ts` (constructor :122-124, `repairLinks` :139-235, `isPlainText` :238-276, `toHTML` :289-370, `ALLOWED_HTML_TAGS` :16, `isAllowedHtmlTag` :21-38)
- `apps/web/src/editor/serialize.ts` (:66-160, gate at :134), `apps/web/src/editor/deserialize.ts` (`parseNode` :181-300)
- `packages/shared-utils/src/html/sanitizeHtmlParams.ts`, `packages/shared-utils/src/html/sanitizeHtml.ts`, `apps/web/src/Linkify.ts`, `apps/web/src/HtmlUtils.tsx` (`checkBlockNode` :535-566)
- CSS: `apps/web/res/css/views/rooms/_EventTile.pcss` (:131-200, :476-487, `overflow-x: hidden` :140), `apps/web/res/themes/dark/css/_dark.pcss` (:263-271), `apps/web/res/themes/legacy-dark/css/_legacy-dark.pcss` (:235-243)
- `apps/web/src/utils/renderMarkdown.ts` (gains tables for free)
- Tests: `apps/web/src/Markdown.test.ts`, `apps/web/src/HtmlUtils.test.tsx`, `packages/shared-utils/src/html/sanitizeHtml.test.ts`

**Steps**:

1. In `Markdown.ts` add a `repairTables()` AST pass after `repairLinks`: for a top-level `paragraph` whose text/softbreak children form header + `|---|:--:|` delimiter + body rows, build an `html_block` node with `<table><thead>…</thead><tbody>…</tbody></table>` (render cell inline markdown via a second `commonmark.Parser`), `insertBefore`/`unlink`. Mark the node (e.g. private flag).
2. `isPlainText()`: return false for the marked node. Optionally extend `isAllowedHtmlTag` to table tags (regex `^<\/?(.*)>$` only matches single tags, so multi-line literals need a separate check).
3. `toHTML()`: the `html_block` renderer (:346) escapes unknown tags — pass the marked node's literal through raw; the sanitizer re-validates anyway.
4. Sanitizer: add `th: ["align","colspan","rowspan","scope"]`, `td: ["align","colspan","rowspan"]` to `MATRIX_ALLOWED_ATTRIBUTES` (must be in shared-utils — `additionalAllowedAttributes` only accepts `data-*`). Add a test.
5. CSS in `_EventTile.pcss` `.mx_EventTile_content .markdown-body`: `table { display:block; max-width:100%; overflow-x:auto }`, borders via Compound tokens (`$quinary-content`, `--cpd-color-bg-subtle-secondary`); delete the hard-coded `#080808` overrides in `_dark.pcss`/`_legacy-dark.pcss`.
6. `deserialize.ts`: add `case "TABLE"` emitting pipe rows + delimiter after THEAD so edits round-trip.
7. Tests in `Markdown.test.ts` (table → HTML, align attrs, `isPlainText` false, inline md in cells, lone `|` stays plain), `HtmlUtils.test.tsx` (formatted_body table keeps structure, strips `style`/`onclick`).
8. Skip the rich text editor: `@vector-im/matrix-wysiwyg` 2.40.0 `ACTION_TYPES` has no table action and the package is pnpm-patched.

**Difficulty**: medium. **Server dependency**: none (tables are in the spec's HTML subset).

**Gotchas**: `hardSoftBreaks` renders soft breaks as `<br />` — rows arrive as sibling nodes, not lines. `transformFormatting` strips `style`; use `align` attribute. markdown-it/marked exist only transitively — adding one means a real dependency and rewriting `repairLinks`/`isPlainText`/`toPlaintext`. Verify horizontal scroll in IRC/bubble layouts (`_EventTile.pcss:40-130`).

---

## 5. Better Markdown support

**Current state**: CIDER composer → `SendMessageComposer.createMessageContent` (:77-115) → `editor/serialize.ts htmlSerializeIfNeeded` (:54-164) → `Markdown.ts`. Only `sub/sup/del/s/u/br` raw HTML survives. Headings, lists, code, quotes, `data-mx-maths` (labs `feature_latex_maths`), spoilers all work. Missing: `~~strike~~` (toolbar emits raw `<del>`), tables, task lists, footnotes, live preview, always-visible toolbar. Render-time: `HtmlUtils.tsx` (:288-477) → sanitizer → `CodeBlock.tsx` / `renderer/spoiler.tsx`. WYSIWYG lab uses the Rust `plainToRich`, not `Markdown.ts`.

**Files**:

- `apps/web/src/Markdown.ts`, `apps/web/src/@types/commonmark.ts`, `apps/web/src/editor/serialize.ts`, `apps/web/src/editor/deserialize.ts` (DEL/S :207-210), `apps/web/src/editor/operations.ts` (`formatRange` :23-58, Strikethrough :46)
- `apps/web/src/components/views/rooms/MessageComposerFormatBar.tsx` (Formatting enum :24-31), `apps/web/src/components/views/rooms/BasicMessageComposer.tsx` (format bar gate :488-490, keyboard :583-599, `onFormatAction` :796, `render` :809)
- `apps/web/src/accessibility/KeyboardShortcuts.ts` (:35-43, :346-380), `apps/web/src/KeyBindingsDefaults.ts`
- `apps/web/src/HtmlUtils.tsx`, `packages/shared-utils/src/html/sanitizeHtmlParams.ts`, `apps/web/src/Linkify.ts`
- `apps/web/src/renderer/spoiler.tsx` (renderer pattern), `apps/web/src/viewmodels/message-body/EventContentBodyViewModel.ts` (:158-159), `apps/web/src/components/views/messages/CodeBlock.tsx`
- `apps/web/src/components/views/rooms/wysiwyg_composer/utils/createMessageContent.ts` (:71-74), `apps/web/src/components/views/rooms/wysiwyg_composer/components/FormattingButtons.tsx`
- `apps/web/res/css/_common.pcss` (`.markdown-body` :349+), `packages/shared-components/src/room/timeline/event-tile/body/EventContentBodyView/EventContentBody.module.css`
- Tests: `apps/web/src/Markdown.test.ts`, `apps/web/src/editor/serialize.test.ts`, `apps/web/src/editor/deserialize.test.ts`, `apps/web/src/editor/roundtrip.test.ts`, `apps/web/src/HtmlUtils.test.tsx`, `apps/web/src/utils/renderMarkdown.test.ts`, `apps/web/playwright/e2e/composer/CIDER.spec.ts`

**Steps**:

1. **Strikethrough `~~`**: AST pass in `Markdown.ts` splitting `text` nodes on `~~…~~` into `html_inline` `<del>`/`</del>` (already allowed, so `isPlainText`/`toHTML` untouched). Switch `operations.ts:46` and `deserialize.ts` DEL/S to emit `~~`; keep accepting `<del>` input. Add `FormatStrikethrough` keybinding. Tests in Markdown/serialize/roundtrip.
2. **Tables**: see section 4.
3. **Task lists**: commonmark already yields `<li>[ ] task</li>`. `<input>` is not spec-permitted, so render client-side: new `apps/web/src/renderer/task-list.tsx` (copy `spoiler.tsx`) matching `li` starting with `[ ]`/`[x]`, registered in `EventContentBodyViewModel.ts:158-159` and `TextualBodyFactory.tsx:103-109`. Interoperable HTML stays as-is.
4. **Heading button**: add `Formatting.Heading` + `formatRangeAsHeading` prefixing `# ` (use `rangeStartsAtBeginningOfLine` :139). No parser change.
5. **Live preview** (optional): in `BasicMessageComposer.render` a debounced `<div className="markdown-body">` fed by `sanitizeHtml(new Markdown(mdSerialize(model)).toHTML(), sanitizeHtmlParams)` (same as `utils/renderMarkdown.ts`), behind setting `MessageComposerInput.showMarkdownPreview` in `PreferencesUserSettingsTab.tsx` COMPOSER_SETTINGS (:126-133).
6. **Always-visible toolbar**: setting to dock `MessageComposerFormatBar` below the input (`BasicMessageComposer.tsx:488-490` currently selection-only); `formatRange` already selects the word at caret. Or ship `feature_wysiwyg_composer` on via config `features`.
7. Skip footnotes and outgoing autolinks (render-time `linkifyHtml` already handles display) unless asked.

**Difficulty**: medium. **Server dependency**: none.

**Gotchas**: `isPlainText()` gates whether `formatted_body` is sent at all — new syntax must make it false. LaTeX pre-pass in `serialize.ts:70-131` patches `<code>` by index (:146-148); run table pre-processing before it. New AST passes must call `walker.resumeAt` correctly. Parser changes do not affect the WYSIWYG lab. `surroundWith` (`BasicMessageComposer.tsx:51-57`) already wraps with `~`.

---

## 6. Slack-like UX enhancements

**Current state**: Already present: threads (`apps/web/src/components/structures/ThreadPanel.tsx`, `ThreadView.tsx`, `apps/web/src/components/views/spaces/threads-activity-centre/ThreadsActivityCentre.tsx`), reactions (hard-coded `QUICK_REACTIONS` in `packages/shared-components/src/core/EmojiPicker/QuickReactions.tsx:22`), editing (`EditMessageComposer.tsx`), pins (`apps/web/src/utils/PinningUtils.ts`, `PinnedMessagesCard.tsx`), mark-unread (`apps/web/src/utils/notifications.ts` :146/:162, MSC2867), keyword push rules (`apps/web/src/components/views/settings/Notifications.tsx` :582/:636, `apps/web/src/notifications/ContentRules.ts`), URL previews (incl. composer preview `apps/web/src/viewmodels/composer/MessageComposerUrlPreviewViewModel.ts`), uploads (`apps/web/src/ContentMessages.ts`), search (`apps/web/src/Searching.ts` :682), custom status (MSC4426, `apps/web/src/utils/userStatus.ts`, `feature_user_status` default true, needs MSC4429 server), slash commands (`apps/web/src/slash-commands/SlashCommands.tsx` :70/:864/:905). **Gaps**: DND/snooze, saved messages, remind-me, draft sync (drafts are localStorage `mx_cider_state_*`, thread drafts never restored `SendMessageComposer.tsx:541-544`), custom keybindings, always-visible format bar, status presets/expiry, message search in Spotlight. Note: `feature_hidebold` is **not** a labs flag — it is `IBaseSetting<boolean>` (`Settings.tsx:242`), the inverted twin of `Notifications.showbold`.

**Files**:

- Registry/UI: `apps/web/src/settings/Settings.tsx`, `apps/web/src/settings/SettingLevel.ts`, `apps/web/src/settings/handlers/ConfigSettingsHandler.ts`, `apps/web/src/components/views/settings/tabs/user/LabsUserSettingsTab.tsx`, `docs/labs.md`, `docs/feature-flags.md`, `docs/config.md` (`setting_defaults` :110-114, modules :597)
- Right panel: `apps/web/src/stores/right-panel/RightPanelStorePhases.ts`, `apps/web/src/components/structures/RightPanel.tsx` (:155-282), `apps/web/src/components/views/right_panel/RoomSummaryCardView.tsx`
- Message actions: `packages/shared-components/src/room/timeline/event-tile/actions/ActionBarView/ActionBarView.tsx` (`ActionBarAction` :92-108), `apps/web/src/viewmodels/room/EventTileActionBarViewModel.ts` (:144, :187), `apps/web/src/components/views/context_menus/MessageContextMenu.tsx`
- Notifications: `apps/web/src/Notifier.ts` (`isEnabled` :436, `isSyncing` :520), `apps/web/src/utils/device/snoozeBulkUnverifiedDeviceReminder.ts` (timestamp pattern), `apps/web/src/notifications/StandardActions.ts`, `apps/web/src/RoomNotifs.ts`
- Drafts: `apps/web/src/components/views/rooms/SendMessageComposer.tsx` (:74, :528-580), `apps/web/src/components/views/rooms/MessageComposer.tsx` (:69, :171-213), `apps/web/src/DraftCleaner.ts`
- Keybindings: `apps/web/src/accessibility/KeyboardShortcuts.ts`, `apps/web/src/KeyBindingsDefaults.ts` (:150), `apps/web/src/KeyBindingsManager.ts` (:99), `apps/web/src/components/views/settings/tabs/user/KeyboardUserSettingsTab.tsx`, `apps/web/src/components/views/settings/KeyboardShortcut.tsx`
- Status: `apps/web/src/utils/userStatus.ts`, `apps/web/src/viewmodels/menus/UserMenuViewModel.ts` (:152), `packages/shared-components/src/status/SetStatusView.tsx`, `apps/web/src/slash-commands/status.ts`
- Reactions: `packages/shared-components/src/core/EmojiPicker/QuickReactions.tsx`, `apps/web/src/emojipicker/EmojiPickerWithRecents.tsx`, `apps/web/src/emojipicker/recent.ts`
- Search: `apps/web/src/Searching.ts`, `apps/web/src/components/structures/RoomSearchView.tsx`, `apps/web/src/components/views/rooms/RoomSearchAuxPanel.tsx`, `apps/web/src/components/views/dialogs/spotlight/SpotlightDialog.tsx`
- Module API: `packages/module-api/src/api/index.ts`, `custom-components.ts`, `composer.ts`, `urlpreview.ts`, `settings.ts` (read-only), `packages/module-api/README.md`, `modules/banner`, `apps/web/build_config.sample.yaml` (copy to `build_config.yaml`, not in repo)

**Steps (prioritised)**:

- **P1 DND/snooze**: `notificationsSnoozedUntil` (number, device-level) in `Settings.tsx`; guard popup/audio in `Notifier.ts` around :436/:520 with `Date.now() < snoozedUntil`; snooze menu (30m/1h/tomorrow/off) via `UserMenuViewModel.ts` + a shared-components view next to `packages/shared-components/src/status/`; optional cross-device: toggle `.m.rule.master` push rule (`StandardActions.ts`).
- **P1 Saved messages**: account data `io.element.saved_messages` `{events:[{room_id,event_id}]}`; add `ActionBarAction.Save` + `resolveActions` + `MessageContextMenu` entry; new `RightPanelPhases.SavedMessages` + `SavedMessagesCard` modelled on `PinnedMessagesCard.tsx`/`apps/web/src/hooks/usePinnedEvents.ts` (`client.fetchRoomEvent`); menu item in `RoomSummaryCardView.tsx`. Behind `feature_saved_messages`.
- **P1 Draft sync**: mirror `saveStoredEditorState` (:572) / WYSIWYG (:200) into room account data (`io.element.draft`, debounced); read in `restoreStoredEditorState` (:540) when local empty; drop the thread `return null` (:541-544); extend `DraftCleaner.ts`.
- **P2 Custom keybindings**: `KeyBindings.custom` device setting; second `IKeyBindingsProvider` pushed into `KeyBindingsManager.bindingsProviders` (:99) returning overrides first, computed lazily (`ctrlEnterToSend` changes bindings at lookup); make `KeyboardUserSettingsTab.tsx` rows editable.
- **P2 Status presets/expiry**: preset chips + expiry picker in `SetStatusView.tsx`; schedule `clearAllUserStatus` from `userStatus.ts`; `/status clear` + duration in `status.ts`. Needs MSC4429 server.
- **P2 Format bar / quick reactions**: see section 5 step 6; make `QUICK_REACTIONS` a prop fed from an ACCOUNT setting resolved in `EmojiPickerWithRecents.tsx` (or "most used" from `recent.ts`).
- **P3 Remind-me**: account data `io.element.reminders` + startup/sync check store (pattern `apps/web/src/stores/ReleaseAnnouncementStore.ts`) raising a toast via `apps/web/src/stores/ToastStore.ts`; fires only while a client runs.
- **P3 Message search in Spotlight**: add a "Messages" section calling `eventSearch` with `SearchScope.All`, navigate via `ViewRoom` + `event_id`. Encrypted search needs Seshat (desktop).
- **P3 Keyword inline highlight**: wrap matches from `ContentRules.parseContentRules(client.pushRules)` in `apps/web/src/viewmodels/room/timeline/event-tile/EventTileHighlightState.ts` / `HtmlUtils.tsx`.
- **Without forking**: banner/renderer/preview/upload-option additions can be runtime modules against `packages/module-api` loaded via config `modules: [...]`. The Module API cannot add settings, slash commands, keybindings, action-bar buttons or right-panel cards — those need `apps/web` edits.

**Difficulty**: large (sum of mediums). **Server dependency**: mostly none — account data + push rules are standard. Custom status needs MSC4429/MSC4426; bundled previews MSC4095; search `/search` (unencrypted only).

**Gotchas**: Two composers (CIDER + WYSIWYG) and two timelines (legacy `EventTile.tsx` + `feature_new_timeline` MVVM) — wire or gate both. New UI must be MVVM: view in `packages/shared-components`, VM in `apps/web/src/viewmodels` (not the deprecated `apps/web/src/components/viewmodels`). Labs flags are device-level and overridden by config `features`. `Notifier` flags `notificationsEnabled`/`deviceNotificationsEnabled`/`audioNotificationsEnabled` drive the browser permission flow — hook `Notifier`, don't toggle them. Mark-unread must write both stable and `com.famedly.marked_unread` types. macOS keybindings differ (`isKeyComboMatch onMac`). Labs features need a Playwright happy-path before leaving labs; 80% coverage diff enforced in CI.

---

## 7. Recommended order of attack

1. **Hide presence** (small, client-only, one afternoon) — immediate privacy win, exercises the settings/i18n/test loop.
2. **Strikethrough `~~` + heading button** (small) — warms up `Markdown.ts` AST-pass pattern needed for tables.
3. **DND/snooze** (small) — single guard in `Notifier.ts` + menu.
4. **Pipe tables** (medium) — parser pass, sanitizer attrs, CSS, deserialize round-trip, tests.
5. **Task-list renderer + configurable quick reactions** (small each).
6. **Scheduled messages** — slash command + local store first (works everywhere incl. E2EE), MSC4140 path second, send-button menu/management UI last.
7. **Saved messages, draft sync** (medium, account-data based).
8. **Custom keybindings, status presets/expiry, Spotlight message search, remind-me** (P2/P3).
9. Decide late: ship WYSIWYG lab by default vs. docked CIDER toolbar; live preview only if users ask.

## 8. Licensing

Repo is tri-licensed `AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial` (`LICENSE-AGPL-3.0`, `LICENSE-GPL-3.0`, `LICENSE-COMMERCIAL` at root; `README.md:107-113`). Without a commercial licence: any fork you **distribute** (binaries, Desktop builds) must ship its full source under GPL/AGPL, and under AGPL any fork you **host** for others over a network must offer the complete modified source to its users (AGPL §13). Keep the existing per-file license headers and `LICENSE-*` files, add your own copyright line (not "Element Creations Ltd.", per `AGENTS.md`), and don't rebrand as Element — trademarks aren't covered by the licence. Runtime modules loaded via config `modules` are a separate work only if genuinely separate; anything compiled into `apps/web` is derivative.
