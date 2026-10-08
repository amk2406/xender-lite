# Xender Lite

Xender Lite is a lightweight Windows file-sharing application for local network transfers. It lets users browse shared content, connect to nearby devices, and send files through a local Web UI and desktop WebView experience.

## Version

**v2.0.0**

## Highlights

* Local file browser with quick access to common folders
* LAN-friendly device discovery and transfer flow
* Web-based local dashboard for files, devices, settings, and logs
* Real-time communication with Socket.IO
* QR code-based connectivity for simple device pairing
* Desktop WebView app shell for Windows
* Custom app settings and persistent local configuration
* Recent-file tracking and app data storage in the Windows user profile
* Windows installer/uninstaller workflow

## Features

* File browsing and media preview support
* Image, video, and audio handling
* File upload/download transfer support
* Local WebUI with dedicated pages for files, devices, settings, and logs
* LAN sharing and local device communication
* Socket.IO realtime events and connection status updates
* QR code network connection helper
* Windows WebView application experience
* Application settings and data persistence
* Installer and uninstaller support

## Requirements

* Windows 10 or later (Windows 11 recommended)
* Node.js 22 or compatible version
* Local network access for LAN sharing

## Installation

Clone or download the project, then install dependencies:

```bash
npm install
```

Start the app:

```bash
npm start
```

For local development and log monitoring:

```bash
npm run dev
```

You can also run the packaged Windows executable when available.

## Project Structure

```text
xender-lite/
├── modules/
├── res/
├── static/
├── views/
├── app.js
├── package.json
├── package-lock.json
├── README.md
├── CHANGELOG.md
├── LICENSE.txt
└── .gitignore
```

## Data and Storage

Application data such as configuration, recent files, logs, and app cache are stored in the user's local application data directory:

```text
%LOCALAPPDATA%\Xender Lite\
```

## Status

Xender Lite v2.0.0 introduces the updated desktop + local WebUI release with refined app settings, device handling, and improved Windows-focused networking workflow.

## License

See the `LICENSE.txt` file for license information.

## Credits

Developed by **Abdulhamid Muhammad Kabir** and the Xender Lite community.
