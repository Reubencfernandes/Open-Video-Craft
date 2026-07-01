import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { DisplayBorder } from "./DisplayBorder";
import { RecorderController } from "./RecorderController";
import "./styles.css";

const view = new URLSearchParams(window.location.search).get("view") ?? "main";
document.documentElement.dataset.view = view;

const component =
  view === "controller" ? (
    <RecorderController />
  ) : view === "display-border" ? (
    <DisplayBorder />
  ) : (
    <App />
  );

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{component}</React.StrictMode>
);
