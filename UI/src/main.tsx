import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Single-page entry for the dashboard UI.
createRoot(document.getElementById("root")!).render(<App />);
