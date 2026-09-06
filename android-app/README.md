# Hail Android app

Native Android shell for [hailrh.online](https://hailrh.online). Incoming hails ring the phone
with the full-screen system call UI (self-managed `ConnectionService` + high-priority FCM),
even when the app is in the background or killed.

## How it fits together

- The app is a Capacitor WebView that loads `https://hailrh.online` (see
  `capacitor.config.json` → `server.url`). No web assets are bundled; the app always runs the
  currently deployed frontend.
- The backend sends a high-priority FCM **data** message when a call recipient is offline on
  WebSocket (`backend/fcm.js`, triggered from `backend/server.js`).
- `HailFirebaseMessagingService` receives it and starts a self-managed telecom connection
  (`HailConnectionService`), which posts the full-screen incoming-call notification showing
  `IncomingCallActivity`.
- Answer launches the main app with the call's `from`/`callId`; the backend re-delivers the
  ringing call and buffered WebRTC offer when the app reconnects, and the frontend answers
  automatically (`frontend/src/lib/native.js`, `frontend/src/App.jsx`).

## One-time setup

1. **Firebase** — create a project at <https://console.firebase.google.com>, add an Android app
   with package name `online.hailrh.app`, then:
   - put `google-services.json` at `android-app/android/app/google-services.json`
   - in Project settings → Service accounts, generate a private key and set it on the backend:
     `FIREBASE_SERVICE_ACCOUNT=<path to the JSON file>` (or paste the JSON) in `backend/.env`
2. **Backend** — `cd backend && npm install && npm run migrate` (adds the `fcm_tokens` table),
   then restart the server.
3. **This folder** — `cd android-app && npm install` (the `android/` project is already
   generated; `npx cap sync android` re-syncs if config changes).

## Build & run

Open `android-app/android` in Android Studio and Run, or:

```sh
cd android-app/android
./gradlew assembleDebug    # APK in app/build/outputs/apk/debug/
```

## On the phone (first run)

- Grant **microphone** and **notifications** permissions when asked.
- Enable the **Hail calling account** in the system settings screen the app opens once
  (Settings → Calls → Calling accounts). Without it, incoming calls fall back to a
  full-screen notification instead of the telecom-integrated UI.

## Notes

- Use the in-app encrypted wallet: external-wallet hand-off (MetaMask app etc.) doesn't work
  inside a WebView.
- If the app is in the foreground with a live call-server connection, the web UI rings instead
  of the system UI (no double ringing). A backgrounded app whose WebSocket hasn't timed out yet
  may miss the native ring until the server marks it offline (~30–60 s).
- Aggressive OEM battery savers (Xiaomi/Oppo/…) can delay FCM for killed apps; exempt Hail in
  battery settings for reliable ringing.
