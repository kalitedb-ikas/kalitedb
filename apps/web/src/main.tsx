import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { App } from "./app/app";
import { AuthProvider } from "./lib/auth";
import { firebaseAnalyticsPromise } from "./lib/firebase";
import { initDarkMode } from "./lib/use-dark-mode";
import "./styles/index.css";

initDarkMode();

const queryClient = new QueryClient();

void firebaseAnalyticsPromise;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
