import React from "react";
import { createRoot } from "react-dom/client";
import { installMobileStorageBridge } from "./storage-bridge.js";
import { installMobileNativeBridge } from "./native-bridge.js";
import ZeemaxBizLedger from "./BizLedger.jsx";

// Both bridges must exist before ZeemaxBizLedger mounts and makes its
// first window.storage.get() call — installing them is synchronous (the
// bridges themselves are async internally), so this ordering is safe.
installMobileStorageBridge();
installMobileNativeBridge();

const root = createRoot(document.getElementById("root"));
root.render(<ZeemaxBizLedger />);
