import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
// Typography (DESIGN.md): Bricolage Grotesque = display, Geist = body/UI,
// JetBrains Mono = code. Self-hosted variable fonts via Fontsource — same
// files the docs import (web/docs/.vitepress/theme/custom.css).
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/geist";
import "@fontsource-variable/jetbrains-mono";
import { AppShell } from "./ui/AppShell.js";
import "./ui/styles.css";

function App(): React.JSX.Element {
  const [route, setRoute] = useState(() => window.location.hash.replace(/^#\/?/, "") || "catalog");
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash.replace(/^#\/?/, "") || "catalog");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const navigate = useCallback((to: string) => {
    window.location.hash = `#/${to}`;
  }, []);
  return <AppShell route={route} navigate={navigate} />;
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
