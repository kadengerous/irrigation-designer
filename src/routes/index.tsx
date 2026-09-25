import { useEffect, useState } from "react";
import { useProject } from "@/lib/project-store";
import { text } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { DesignerApp } from "@/components/designer/designer-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const unsubscribe = useProject.persist.onFinishHydration(() => setReady(true));
    if (useProject.persist.hasHydrated()) setReady(true);
    return unsubscribe;
  }, []);
  return ready ? <DesignerApp /> : <main className="flex min-h-screen items-center justify-center" role="status">{text("loading")}</main>;
}
