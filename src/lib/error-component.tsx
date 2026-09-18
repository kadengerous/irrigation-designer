import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main
      className={
        "flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center " +
        "bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50"
      }
    >
      <span className="text-red-500" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">Не удалось открыть приложение</h1>
      <p className="max-w-md text-sm break-words text-zinc-500 dark:text-zinc-400">
        {error.message || "Произошла ошибка загрузки."}
      </p>
      <button type="button" className="rounded-lg bg-sky-700 px-5 py-3 text-white" onClick={() => {
        const url = new URL(window.location.href);
        url.searchParams.set("reload", String(Date.now()));
        window.location.replace(url.href);
      }}>Повторить загрузку</button>
      <p className="max-w-md text-sm text-zinc-500">Не очищайте данные сайта: там могут храниться сохранённые проекты.</p>
    </main>
  );
}
