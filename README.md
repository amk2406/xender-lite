# Xender Lite

Xender Lite is a lightweight file-sharing application for Windows that allows users to browse and transfer files over a local network.

## Version

**v1.0.0**

## Features

* File browsing
* Image, video, and audio support
* File transfer
* Local WebUI
* LAN sharing
* Socket.IO realtime communication
* QR code network connection
* Windows WebView application
* Application settings
* Windows installer and uninstaller

## Requirements

* Windows (10 to 11 Recommended)
* Node.js 20 or compatible version
* A local network for LAN sharing

## Installation

Download from the release files,
or the source code if you have nodejs


Install dependencies:

```bash
npm install
# optional if you use the installer setup
```

Start the application:

```bash
npm start
# of test or use the test-app.bat for live view of logs
```
OR
the xender-lite.exe

## Project Structure

```text
xender-lite/
├── modules/
├── node-modules/
├── res/
├── modules/
├── static/
├── view/
├── app.js
├── package.json
├── package-lock.json
├── README.md
├── CHANGELOG.md
└── LICENSE
```

## Data

Application data such as scan databases, cache, and logs are stored in the user's local application data directory.

```text
%LOCALAPPDATA%\xender-lite\
```

## Status

Xender Lite v1.0.0 is the first stable release.

## License

See the `LICENSE` file for license information.

## Credits

Developed by **Xender Lite Community**.
