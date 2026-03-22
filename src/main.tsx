import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerProviders } from "./services/providers/init";

// Register AI providers (Tauri/WebLLM) before React renders
registerProviders();

createRoot(document.getElementById("root")!).render(<App />);
