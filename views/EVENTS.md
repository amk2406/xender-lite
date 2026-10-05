# Xender-lite — Socket.IO event map (for server rebuild)

All client pages emit / listen as below. Commented-out events in HTML are optional for later.

---

## local/index.html (Home)

| Direction | Event | Payload | Notes |
|-----------|-------|---------|-------|
| C → S | `start-web-server` | — | Start LAN web server |
| C → S | `stop-web-server` | — | Stop LAN web server |
| S → C | `web-server-started` | `{ link?, url?, host?, qr?, dataUrl?, qrCode? }` | UI switches to “Close Web Server”, shows QR + link |
| S → C | `web-server-stopped` / `web-server-closed` | — | UI back to “Start Web” |
| S → C | `qr-code` | `string` dataUrl **or** `{ dataUrl\|url\|qr }` | Update QR image |
| S → C | `lan-link` | `string` **or** `{ link\|url\|ip }` | Update copyable link (client ensures `http://` prefix) |

---

## lan/index.html

| Direction | Event | Payload |
|-----------|-------|---------|
| C → S | `start-live` | — |
| C → S | `save-file` | `{ id }` |
| S → C | `allow-files` | `{ allow: boolean, files?: [] }` |
| S → C | `device-name` | `string` or `{ name }` |
| S → C | `device-ip` | `string` or `{ ip }` |
| S → C | `file-added` / `update-file` | file object |
| S → C | `file-removed` / `file-deleted` | file or id |
| S → C | `save-result` | `{ ok\|success, message?, error? }` |

---

## lan/upload.html (kept fully wired)

| Direction | Event | Payload |
|-----------|-------|---------|
| C → S | `start-live` | — |
| C → S | `upload:started` | `{ id, name, size }` |
| C → S | `upload:progress` | `{ id, name, progress, speed }` |
| C → S | `upload:paused` / `upload:resumed` | `{ id, name }` |
| C → S | `upload:cancelled` | `{ id, name }` |
| C → S | `upload:success` | `{ id, name }` |
| C → S | `upload:error` | `{ id, name, error }` |
| HTTP | `POST /upload-file` | Resumable.js chunks |

---

## local/devices.html

Devices keyed by **name / ssid** (node-wifi style), not numeric id.

| Direction | Event | Payload |
|-----------|-------|---------|
| C → S | `scan-wifi-devices` | — |
| C → S | `get-wifi-devices` | — |
| C → S | `get-connected-devices` | — |
| C → S | `connect-device` | `{ name, ssid, ip?, password? }` (+ optional ack) |
| C → S | `disconnect-device` | `{ name, ssid, ip? }` |
| S → C | `wifi-devices` | `[]` or `{ devices: [] }` |
| S → C | `wifi-device` / `device-found` / `device-updated` | device object |
| S → C | `device-lost` | device or key |
| S → C | `connected-devices` | `[]` or `{ devices: [] }` |
| S → C | `connect-device-result` | `{ ok\|success, device?, error?, code? }` |
| S → C | `device-connect-error` | `{ message\|error }` |
| S → C | `scan-error` / `scan-complete` | `{ message? }` / `{ count? }` |

---

## local/files.html

| Direction | Event | Payload |
|-----------|-------|---------|
| C → S | `get-recent-transfers` | — |
| C → S | `remove-transfer` | `{ path, name }` |
| S → C | `recent-transfers` | `[]` or `{ transfers: [] }` — items `{ name, path, size? }` |
| S → C | `transfer-added` / `recent-transfer` | single item |
| S → C | `transfer-removed` | `{ path?, name? }` |

---

## local/settings.html

| Direction | Event | Payload |
|-----------|-------|---------|
| C → S | `save-theme` | `'light'\|'dark'` |
| C → S | `save-accent` | `'primary'\|'colored'\|'neon'` |
| C → S | `save-web-mode` | `boolean` |
| C → S | `save-auto-organize` | `boolean` |
| C → S | `add-scan-dir` / `remove-scan-dir` | path string |
| C → S | `clear-cache` | `true` |
| S → C | `version` | string |
| S → C | `theme` / `accent` | string |
| S → C | `web-mode` / `auto-organize` | boolean |
| S → C | `scan-dir` | `string[]` |
| S → C | `save-dir` | path string |

---

## local/log.html

| Direction | Event / HTTP | Payload |
|-----------|--------------|---------|
| C → S | `get-log-list` | — |
| C → S | `get-log` | `{ name }` |
| S → C | `log-list` | `string[]` or `{ logs: [] }` |
| S → C | `log-content` | `{ name, content }` or string |
| HTTP | `GET /log?name=…` | text body; **404 → remove from list** |

---

## local/license.html

| Direction | Event / HTTP | Payload |
|-----------|--------------|---------|
| C → S | `get-license-list` | — |
| S → C | `license-list` | `string[]` or `{ modules: ({ name, group? }\|string)[] }` |
| S → C | `license-content` | `{ module, content\|text }` (optional) |
| HTTP | `GET /license?module=express` | text body; **404 → remove name from sidebar** |

---

## Removed

- All `xender-native.js` / `XenderNative` / `xenderNative` usage.
- Connect-to-PC mode toggle.
- Most passive theme/file-changed listeners (left as comments where useful).
