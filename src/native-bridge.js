import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { STORE_FILE, readStoreFile } from "./storage-bridge.js";

/* ============================================================
   MOBILE NATIVE BRIDGE
   Provides the same window.zeemaxNative shape the app already
   calls on desktop — exportBackup / pickMergeFile / importBackup —
   adapted to what's actually available on Android:

   - Export: there's no desktop-style "Save As" dialog on Android, so
     export writes a backup file into the app's Cache directory, then
     hands it to the OS Share sheet — the person picks where it goes
     (Drive, email, WhatsApp, a USB-connected computer, anywhere).
   - Merge / Import: there's no native "Open" dialog either, so both
     use a hidden HTML file input, which Android already renders as
     its own native file/document picker — no extra plugin needed.

   window.zeemaxNative.openDataFolder is deliberately NOT implemented
   here — there's no equivalent "reveal in Explorer" concept on a
   sandboxed mobile OS, so that button simply doesn't render on mobile
   (the Settings UI checks for this before showing it).
   ============================================================ */

function pickJSONFile() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.style.display = "none";
    input.onchange = () => {
      const file = input.files && input.files[0];
      document.body.removeChild(input);
      if (!file) { resolve({ canceled: true }); return; }
      const reader = new FileReader();
      reader.onload = () => resolve({ canceled: false, text: reader.result, name: file.name });
      reader.onerror = () => resolve({ canceled: false, error: "Could not read that file." });
      reader.readAsText(file);
    };
    // If the person backs out of the picker with no selection, most
    // browsers/webviews don't fire a cancel event reliably — this is a
    // known platform limitation, not something worth working around with
    // fragile focus-tracking hacks.
    document.body.appendChild(input);
    input.click();
  });
}

function parseBackupText(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: "That file isn't valid JSON — it doesn't look like a Zeemax Biz Ledger backup." };
  }
  // "bizledger_db" is the current key. "toplist_db" is accepted too, since
  // backups exported before the rename (or from very early installs) still
  // use it — same as the app's own load-time migration falls back to it.
  const raw = parsed.bizledger_db || parsed.toplist_db;
  if (!raw) {
    return { error: "That file doesn't contain recognizable Zeemax Biz Ledger data." };
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { error: "That backup's data is corrupted and can't be read." };
  }
  return { data };
}

export function installMobileNativeBridge() {
  window.zeemaxNative = {
    async exportBackup() {
      const store = await readStoreFile();
      const fileName = `zeemax-bizledger-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const json = JSON.stringify(store);
      await Filesystem.writeFile({ path: fileName, directory: Directory.Cache, data: json, encoding: Encoding.UTF8 });
      const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
      await Share.share({
        title: "Zeemax Biz Ledger Backup",
        text: "Zeemax Biz Ledger data backup — merge this into another device from Settings.",
        url: uri,
        dialogTitle: "Save or send your backup",
      });
      return { canceled: false, filePath: fileName };
    },

    async pickMergeFile() {
      const picked = await pickJSONFile();
      if (picked.canceled) return { canceled: true };
      if (picked.error) return { canceled: false, error: picked.error };
      const { data, error } = parseBackupText(picked.text);
      if (error) return { canceled: false, error };
      return { canceled: false, data, sourcePath: picked.name };
    },

    async importBackup() {
      const picked = await pickJSONFile();
      if (picked.canceled) return { canceled: true };
      if (picked.error) return { canceled: false, error: picked.error };
      let parsed;
      try {
        parsed = JSON.parse(picked.text);
      } catch {
        return { canceled: false, error: "That file isn't valid JSON — it doesn't look like a Zeemax Biz Ledger backup." };
      }
      if (typeof parsed !== "object" || parsed === null || !("bizledger_db" in parsed || "toplist_db" in parsed)) {
        return { canceled: false, error: "That file doesn't contain recognizable Zeemax Biz Ledger data." };
      }
      // Safety copy of current data before overwriting, same principle as desktop
      try {
        const current = await Filesystem.readFile({ path: STORE_FILE, directory: Directory.Data, encoding: Encoding.UTF8 });
        await Filesystem.writeFile({ path: `${STORE_FILE}.before-import-${Date.now()}.bak`, directory: Directory.Data, data: current.data, encoding: Encoding.UTF8 });
      } catch { /* nothing to back up on a brand new install */ }
      await Filesystem.writeFile({ path: STORE_FILE, directory: Directory.Data, data: picked.text, encoding: Encoding.UTF8 });
      return { canceled: false, restoredFrom: picked.name };
    },

    /** Shares a real, already-generated PDF (base64) through Android's
     *  native Share sheet — WhatsApp, email, Drive, etc. all appear as
     *  targets, with the actual formatted document attached, not just a
     *  text summary. This is the mobile equivalent of desktop's direct
     *  file download, since there's no "Downloads folder" concept to
     *  save straight to in the same way. */
    async sharePDF(base64Data, fileName) {
      await Filesystem.writeFile({ path: fileName, directory: Directory.Cache, data: base64Data });
      const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
      // A plain file share, with no `text`. Capacitor packs the file and any
      // text into one intent; WhatsApp showed no caption from it anyway, and a
      // lone PDF is the simplest, most standard thing to hand to the share sheet.
      await Share.share({
        title: fileName,
        url: uri,
        dialogTitle: "Share this document",
      });
      return { canceled: false, filePath: fileName };
    },

    /** Shares one file, with two knobs used by the temporary Sharing test: which
     *  folder the file is saved in first, and whether the file name is also sent
     *  as the share's "subject". */
    async shareFile({ base64, fileName, location = "cache", withTitle = true }) {
      const directory = location === "external" ? Directory.External : Directory.Cache;
      await Filesystem.writeFile({ path: fileName, directory, data: base64 });
      const { uri } = await Filesystem.getUri({ path: fileName, directory });
      const options = { url: uri, dialogTitle: "Share this document" };
      if (withTitle) options.title = fileName;
      await Share.share(options);
      return { canceled: false, filePath: fileName, uri };
    },

    /** One share sheet, two files: a picture of page 1 and the PDF itself.
     *  WhatsApp always shows a picture, so the chat has a visible preview of
     *  the document even when it can't draw a preview of the PDF on its own.
     *  If this phone's share sheet turns the two-file share down, it falls
     *  back to sharing just the PDF — never worse than a plain PDF share. */
    async sharePDFWithPreview(pdfBase64, pdfName, imageBase64, imageName) {
      await Filesystem.writeFile({ path: pdfName, directory: Directory.Cache, data: pdfBase64 });
      const { uri: pdfUri } = await Filesystem.getUri({ path: pdfName, directory: Directory.Cache });
      try {
        await Filesystem.writeFile({ path: imageName, directory: Directory.Cache, data: imageBase64 });
        const { uri: imageUri } = await Filesystem.getUri({ path: imageName, directory: Directory.Cache });
        await Share.share({ title: pdfName, files: [imageUri, pdfUri], dialogTitle: "Share this document" });
        return { canceled: false, filePath: pdfName, withPreview: true };
      } catch (err) {
        if (/cancel/i.test(String((err && err.message) || ""))) return { canceled: true };
        await Share.share({ title: pdfName, url: pdfUri, dialogTitle: "Share this document" });
        return { canceled: false, filePath: pdfName, withPreview: false };
      }
    },

    platform: "android",
    bridgeBuild: "2026-10-24-c", // must match APP_BUILD in BizLedger.jsx — Settings compares the two
  };
}
