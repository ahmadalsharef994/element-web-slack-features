# Installing Element Fork

Download the installer for your computer from the
[latest release](https://github.com/ahmadalsharef994/element-web-slack-features/releases/latest), under **Assets**.

| Your computer                      | Download                                  |
| ---------------------------------- | ----------------------------------------- |
| Windows                            | the file ending in `Setup.exe`            |
| Mac with Apple chip (M1 or newer)  | the `.dmg` file ending in `mac-arm64.dmg` |
| Mac with Intel chip                | the `.dmg` file ending in `mac-x64.dmg`   |
| Linux (Ubuntu, Debian, Mint)       | the `.deb` file                           |

Not sure which Mac you have? Apple menu → **About This Mac**. "Chip: Apple M…" means Apple chip, "Processor: Intel" means Intel.

The app is not signed with a paid certificate, so your computer will warn you once. The warning is expected for this build.

## Windows

1. Double-click the `Setup.exe` file.
2. If Windows shows "Windows protected your PC", click **More info**, then **Run anyway**.
3. Element Fork starts by itself when the install finishes.

## Mac

1. Open the `.dmg` file and drag **Element Fork** into **Applications**.
2. The first time, macOS may say the app is "damaged" or from an unidentified developer. To open it anyway, open
   **Terminal** and run:

    ```sh
    xattr -cr "/Applications/Element Fork.app"
    ```

    Then open the app again. You only need to do this once.

## Linux

Double-click the `.deb` file and press **Install**, or run `sudo apt install ./<downloaded file>.deb`. Start it from the
app menu as "Element Fork".

## Signing in

Sign in with your normal Matrix account, or create one on the sign-in screen.
