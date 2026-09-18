import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
test("large palette renders five modes, large color families, shades and save control without mutating the project", async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false } });
  try {
    const { AdvancedPalette } = await server.ssrLoadModule(
      "/src/components/designer/advanced-palette.tsx",
    );
    const Popover = await import("@radix-ui/react-popover");
    const { useProject } = await server.ssrLoadModule("/src/lib/project-store.ts");
    const before = useProject.getState();
    const markup = renderToStaticMarkup(
      createElement(
        Popover.Root,
        { open: true },
        createElement(AdvancedPalette, {
          anchor: { current: null },
          title: "Газон",
          color: "#4c7fc7",
          onChange() {
            throw new Error("render mutated color");
          },
          orientation: 0,
          onClose() {},
        }),
      ),
    );
    assert.match(markup, /palette-landscape/);
    assert.match(markup, /data-natural-width="420"/);
    for (const label of [
      "Палитра",
      "Оттенок",
      "Недавние",
      "Мои цвета",
      "Материалы",
      "Сохранить цвет",
      "Готово",
    ])
      assert.ok(markup.includes(label));
    assert.equal((markup.match(/class="palette-tone"/g) ?? []).length, 9);
    assert.equal(useProject.getState(), before);
  } finally {
    await server.close();
  }
});
