import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthenticatedApp } from "./auth";
import "./styles.css";

const root = document.getElementById("root");
if (root) createRoot(root).render(<StrictMode><AuthenticatedApp /></StrictMode>);
