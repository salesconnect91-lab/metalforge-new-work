import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import LanguageRuntime from "./components/LanguageRuntime";
import { installUnifiedDocumentOutput } from "./lib/unifiedDocumentOutput";
import "./index.css";
import "./contrast.css";
import "./reportPrint.css";
import "./invoicePrintFix.css";
import "./accountingStatements.css";

installUnifiedDocumentOutput();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <LanguageRuntime />
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
