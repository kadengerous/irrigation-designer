import { text } from "@/lib/i18n";
import { createRouter } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    defaultErrorComponent: AppErrorComponent,
    defaultNotFoundComponent: () => (
      <main className="grid min-h-screen place-items-center bg-[#e8eef0] p-6 text-[#1b1f24]">
        <div className="text-center">
          <p className="text-lg font-semibold">{text("notFound")}</p>
          <a href="/" className="mt-3 inline-block text-sm text-[#0b6e62] underline">
            {text("home")}
          </a>
        </div>
      </main>
    ),
  });
}
