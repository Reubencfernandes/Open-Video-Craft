import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { DisplayBorder } from "./DisplayBorder";
import { EditorView } from "./EditorView";
import { RecorderController } from "./RecorderController";
import "tailwindcss/index.css";

const view = new URLSearchParams(window.location.search).get("view") ?? "main";
document.documentElement.dataset.view = view;
document.documentElement.className = "h-full w-full overflow-hidden bg-[#121317]";
document.body.className =
  view === "controller" || view === "display-border"
    ? "m-0 h-full w-full overflow-hidden bg-transparent"
    : view === "editor"
      ? "m-0 h-full w-full overflow-hidden bg-[#121317]"
      : "m-0 min-w-[960px] bg-[#121317]";

const root = document.getElementById("root") as HTMLElement;
root.className = "h-full w-full";

const component =
  view === "controller" ? (
    <RecorderController />
  ) : view === "display-border" ? (
    <DisplayBorder />
  ) : view === "editor" ? (
    <EditorView />
  ) : (
    <App />
  );

createRoot(root).render(<React.StrictMode>{component}</React.StrictMode>);
