import { createFileRoute } from "@tanstack/react-router";
import { DesignerApp } from "@/components/designer/designer-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <DesignerApp />;
}
