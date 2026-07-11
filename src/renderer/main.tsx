/**
 * Renderer entry point: picks which view to mount (launcher, floating
 * recorder, editor, or permission guide) from the ?view= query param.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { EditorView } from "./EditorView";
import { PermissionGuideOverlay } from "./PermissionGuideOverlay";
import { RecorderController } from "./RecorderController";
import "tailwindcss/index.css";
import "./styles.css";

const view = new URLSearchParams(window.location.search).get("view") ?? "main";
const isTransparentView = view === "controller" || view === "permission-guide";
document.documentElement.dataset.view = view;
document.documentElement.className = isTransparentView
  ? "h-full w-full overflow-hidden bg-transparent"
  : "h-full w-full overflow-hidden bg-[#121317]";
document.body.className =
  isTransparentView
    ? "m-0 h-full w-full overflow-hidden bg-transparent"
    : view === "editor"
      ? "m-0 h-full w-full overflow-hidden bg-[#121317]"
      : "m-0 min-w-[960px] bg-[#121317]";

const root = document.getElementById("root") as HTMLElement;
root.className = "h-full w-full";

const component =
  view === "controller" ? (
    <RecorderController />
  ) : view === "permission-guide" ? (
    <PermissionGuideOverlay />
  ) : view === "editor" ? (
    <EditorView />
  ) : (
    <App />
  );

createRoot(root).render(<React.StrictMode>{component}</React.StrictMode>);
