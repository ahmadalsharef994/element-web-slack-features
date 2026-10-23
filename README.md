<p align="center">
  <img src="apps/desktop/build/icon.png" alt="Element Fork logo" width="120" />
</p>

<h1 align="center">Element Fork</h1>

<p align="center">
  A Matrix client for web and Linux desktop, with the everyday conveniences of a team chat app:
  schedule send, snooze, hidden presence, richer formatting and tables.
</p>

Element Fork is Ahmad's fork of [Element Web and Desktop](https://github.com/element-hq/element-web). It stays close to
upstream and adds a small set of features on top, each marked in the UI so you can tell it apart from stock Element.

## Features

| Feature                                 | What it does                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| Schedule send                           | Send a message or files later. List, edit, send now or cancel queued messages.           |
| Upload captions                         | Add a caption to uploads and send several files from one dialog.                         |
| Snooze notifications                    | Pause notifications on this device from the user menu or with `/snooze`.                 |
| Hide online status                      | Hide your own presence, and other people's, from Settings → Preferences.                 |
| Richer formatting                       | Heading and list buttons in the format bar, an optional always-visible toolbar.          |
| Markdown tables and `~~strikethrough~~` | Send, align and edit pipe tables; strike text through.                                   |
| Better search                           | Ctrl+K finds people and public rooms without a filter; `name@server` resolves to a user. |
| Sand theme                              | A warm light theme, under Settings → Appearance.                                         |
| Built-in PDF viewer toggle              | Turn the PDF viewer off even when the lab is on.                                         |

The full list, with the files each feature touches, is in [docs/fork/ADDED_BY_AHMAD.md](docs/fork/ADDED_BY_AHMAD.md).

> [!NOTE]
> Features added by this fork carry an "added by Ahmad" marker in the UI (an accent border, an outline or a note in the
> label).

## Getting started

You need Node.js 22.18 or newer and [pnpm](https://pnpm.io/).

```sh
pnpm install
cp apps/web/config.sample.json apps/web/config.json   # set "show_labs_settings": true if you want labs
cd apps/web && pnpm start                             # http://localhost:8080
```

### Linux desktop app

```sh
scripts/build-deb.sh               # build the web app and the .deb, then install it
scripts/build-deb.sh --no-install  # only build; the .deb lands in apps/desktop/dist/
```

Run it as your normal user. It asks for your password only when it installs the package.

## Development

This is a pnpm + nx monorepo (`apps/web`, `apps/desktop`, `packages/*`).

| Task            | Command                                        |
| --------------- | ---------------------------------------------- |
| Lint everything | `pnpm lint`                                    |
| Format          | `pnpm lint:fmt:fix`                            |
| Typecheck       | `pnpm -r --workspace-concurrency=1 lint:types` |
| Unit tests      | `pnpm test:unit`                               |
| Regenerate i18n | `pnpm i18n`                                    |

Contributor rules (MVVM structure, copyright headers, tests) are in [AGENTS.md](AGENTS.md) and
[CONTRIBUTING.md](CONTRIBUTING.md). Plans for future features are in [docs/fork/ENHANCEMENT_PLAN.md](docs/fork/ENHANCEMENT_PLAN.md).

## Staying in sync with upstream

The fork keeps upstream files where they are, so upstream changes merge cleanly.

```sh
git remote add upstream https://github.com/element-hq/element-web.git
git fetch upstream
git merge upstream/develop
```

## Download

Installers for Windows (`.exe`), Linux (`.deb`) and Mac (`.dmg`) are on the
[latest release](https://github.com/ahmadalsharef994/element-web-slack-features/releases/latest) page. Steps for
non-developers are in [docs/fork/INSTALL.md](docs/fork/INSTALL.md).

## Upstream and licence

Element Fork is built on Element by New Vector Ltd (Element). The original README is kept at
[docs/fork/UPSTREAM_README.md](docs/fork/UPSTREAM_README.md).

Upstream is multi-licensed. This fork is distributed under the **GNU Affero General Public License v3.0 only**
([LICENSE-AGPL-3.0](LICENSE-AGPL-3.0)); the GPL-3.0 text ([LICENSE-GPL-3.0](LICENSE-GPL-3.0)) is kept because upstream
files offer it too. The paid Element Commercial Licence is a private agreement with Element and is **not** granted to
users of this fork. Upstream copyright notices stay in every file, and new files carry Ahmad's. See [NOTICE](NOTICE).

The complete source of every release, including this fork's changes, is this repository. If you receive a build,
you can get the matching source from the release's tag.
