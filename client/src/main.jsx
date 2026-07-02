import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import RootErrorBoundary from "./RootErrorBoundary.jsx";
import "./index.css";
import "./styles/cyber.css";
import "./styles/ui-preferences.css";
import { UiPrefsProvider } from "./context/UiPrefsContext.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <BrowserRouter>
        <UiPrefsProvider>
          <App />
        </UiPrefsProvider>
      </BrowserRouter>
    </RootErrorBoundary>
  </React.StrictMode>
);
