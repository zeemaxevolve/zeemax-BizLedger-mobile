# Zeemax Biz Ledger — Android App

The same Zeemax Biz Ledger app used on desktop, wrapped for Android with
[Capacitor](https://capacitorjs.com). Business logic and document
templates are unchanged — `src/BizLedger.jsx` is a copy of the desktop
app's source file.

**Works fully offline**, exactly like the desktop version. To move data
between phone and desktop, use **Settings → Export Backup** on one
device and **Settings → Merge Backup…** on the other.

## Getting the real .apk file

Same situation as before: I can't compile the actual `.apk` in this
sandbox (no access to Google's Maven repo or Gradle's servers). Two
ways to get it:

### Option A — GitHub Actions (recommended)
1. Create a free GitHub repo, upload everything in this `mobile`
   folder into it.
2. Go to the **Actions** tab — the workflow runs automatically, or
   click **"Run workflow"**.
3. Wait ~3–5 minutes for the green checkmark.
4. Download `zeemax-biz-ledger-debug-apk` from the Artifacts section,
   transfer to your phone, install (allow "install unknown apps"
   once, when prompted).

### Option B — Build locally with Android Studio
```bash
npm install
npm run build
npx cap sync android
npx cap open android
```
Then click ▶ Run in Android Studio.

## Project layout
Same structure as the earlier Zeemax ERP mobile build — `src/storage-bridge.js` and
`src/native-bridge.js` are the proven, tested versions from that project, unchanged.
`src/BizLedger.jsx` is this app's actual business logic (customers, sales documents,
receipts — no products/inventory).
