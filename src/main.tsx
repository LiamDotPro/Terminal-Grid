import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { IS_MAC } from "./lib/hotkeys";
import "./index.css";

// Key labels switch to the system font on macOS, where ⌘ ⌥ ⌃ ⇧ live.
if (IS_MAC) document.documentElement.dataset.platform = "mac";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
