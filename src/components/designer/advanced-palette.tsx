import { useEffect, useRef, useState, type RefObject } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  Check,
  Palette,
  SlidersHorizontal,
  Clock,
  Bookmark,
  Layers,
  X,
  Plus,
  Trash2,
} from "lucide-react";
import { ALL_FACE_TEXTURES, FACE_FILLS, faceTexture } from "@/lib/cad/types";
import { useProject } from "@/lib/project-store";
import { tr } from "@/lib/i18n";
import { useFloatingPlacement } from "./floating-workspace";

type ColorData = { saved: string[]; recent: string[] };
const HEX = /^#[0-9a-f]{6}$/i;
// Requests are serialized so closing/reopening or rapid Pencil choices cannot overwrite newer colors.
let pending: Promise<unknown> = Promise.resolve();
const request = (data?: ColorData): Promise<ColorData> => {
  const operation = pending
    .catch(() => {})
    .then(async () => {
      const response = await fetch("/api/workspace-palette", {
        method: data ? "PUT" : "GET",
        credentials: "same-origin",
        headers: data ? { "content-type": "application/json" } : undefined,
        body: data ? JSON.stringify(data) : undefined,
      });
      if (!response.ok) throw new Error("storage");
      return response.json() as Promise<ColorData>;
    });
  pending = operation;
  return operation;
};
const families = [
  {
    name: "Синий",
    color: "#4c7fc7",
    shades: ["#d6e8f5", "#c5ddf2", "#86b8e4", "#4c7fc7", "#28558a"],
  },
  {
    name: "Жёлтый",
    color: "#e7bf32",
    shades: ["#f3ecd4", "#efe3c0", "#fde8c8", "#facc15", "#e7bf32"],
  },
  {
    name: "Розовый",
    color: "#c16b95",
    shades: ["#ead9e8", "#f0c9c9", "#c16b95", "#ef4444", "#7f1d1d"],
  },
  {
    name: "Зелёный",
    color: "#79aa58",
    shades: ["#e4f0c8", "#c8e6b0", "#c9d9b8", "#b8e0d2", "#79aa58"],
  },
  {
    name: "Фиолетовый",
    color: "#9272b9",
    shades: ["#dcccec", "#bda7d5", "#9272b9", "#8b5cf6", "#624584"],
  },
  {
    name: "Земля",
    color: "#aa8060",
    shades: ["#f3d4b8", "#d8d4cc", "#aa8060", "#8b5a3c", "#6b5344"],
  },
];

export function AdvancedPalette({
  anchor,
  title,
  color,
  onChange,
  orientation,
  onOrientationChange,
  onClose,
}: {
  anchor: RefObject<HTMLButtonElement | null>;
  title: string;
  color: string;
  onChange: (c: string) => void;
  orientation: 0 | 90;
  onOrientationChange?: (r: 0 | 90) => void;
  onClose: () => void;
}) {
  const locale = useProject((s) => s.locale),
    t = (key: string) => tr(locale, key);
  const ref = useRef<HTMLDivElement>(null);
  const box = useFloatingPlacement(
    ref,
    (b) => {
      const r = anchor.current?.getBoundingClientRect();
      return { x: r ? r.left - 430 : b.x + 24, y: r ? r.top : b.y + 24 };
    },
    80,
  );
  const [mode, setMode] = useState("visual"),
    [family, setFamily] = useState(0),
    [hex, setHex] = useState(HEX.test(color) ? color : "#4c7fc7");
  const [data, setData] = useState<ColorData>({ saved: [], recent: [] }),
    [ready, setReady] = useState(false),
    [error, setError] = useState(false),
    [saving, setSaving] = useState(false);
  const current = useRef(data),
    alive = useRef(true),
    revision = useRef(0);
  current.current = data;
  useEffect(() => {
    alive.current = true;
    request()
      .then((d) => {
        if (alive.current) {
          current.current = d;
          setData(d);
          setReady(true);
        }
      })
      .catch(() => {
        if (alive.current) setError(true);
      });
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (HEX.test(color)) setHex(color);
  }, [color]);
  const persist = (next: ColorData) => {
    current.current = next;
    setData(next);
    const version = ++revision.current;
    setSaving(true);
    setError(false);
    request(next)
      .then(() => {
        if (alive.current && revision.current === version) {
          setSaving(false);
          setReady(true);
        }
      })
      .catch(() => {
        if (alive.current && revision.current === version) {
          setError(true);
          setSaving(false);
        }
      });
  };
  const choose = (value: string) => {
    onChange(value);
    if (HEX.test(value) && ready)
      persist({
        ...current.current,
        recent: [value, ...current.current.recent.filter((c) => c !== value)].slice(0, 24),
      });
  };
  const selectedHex = HEX.test(color) ? color : hex;
  const swatch = (value: string) => (
    <button
      key={value}
      type="button"
      className="palette-tone"
      aria-label={value}
      aria-pressed={color === value}
      style={{ background: value }}
      onClick={() => choose(value)}
    >
      {color === value && <Check size={18} />}
    </button>
  );
  return (
    <Popover.Content
      ref={ref}
      className="layer-color-popover adaptive-palette"
      data-floating-priority="80"
      data-natural-width="420"
      data-natural-height="490"
      aria-label={`${t("paletteColors")}: ${title}`}
      side="left"
      style={{
        position: "fixed",
        left: box?.x ?? 0,
        top: box?.y ?? 0,
        width: box?.width ?? 420,
        height: box?.height ?? 490,
        visibility: box && box.width > 0 ? "visible" : "hidden",
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <header className="advanced-palette-heading">
        <span>{title}</span>
        <Popover.Close className="palette-close" aria-label="Закрыть">
          <X size={19} />
        </Popover.Close>
      </header>
      <nav className="palette-mode-bar" aria-label="Способ выбора заливки">
        {[
          ["visual", Palette, "Палитра"],
          ["custom", SlidersHorizontal, "Оттенок"],
          ["recent", Clock, "Недавние"],
          ["saved", Bookmark, "Мои цвета"],
          ["material", Layers, "Материалы"],
        ].map(([id, Icon, label]) => {
          const Glyph = Icon as typeof Palette;
          return (
            <button
              key={id as string}
              type="button"
              aria-label={label as string}
              aria-pressed={mode === id}
              onClick={() => setMode(id as string)}
            >
              <Glyph size={19} />
              <span>{label as string}</span>
            </button>
          );
        })}
      </nav>
      <div className="advanced-palette-body">
        {mode === "visual" && (
          <>
            <div className="palette-landscape">
              {families.map((f, index) => (
                <button
                  key={f.name}
                  type="button"
                  aria-label={f.name}
                  aria-pressed={f.shades.includes(color)}
                  style={{ background: f.color }}
                  onClick={() => {
                    setFamily(index);
                    choose(f.color);
                  }}
                >
                  <span>{f.name}</span>
                  {f.shades.includes(color) && <Check size={22} />}
                </button>
              ))}
            </div>
            <div className="palette-tone-row" aria-label="Оттенки выбранного цвета">
              {families[family].shades.map(swatch)}
            </div>
            <div className="palette-tone-row" aria-label="Нейтральные цвета">
              {FACE_FILLS.filter((c) =>
                ["#ffffff", "#8a8a86", "#5c5c5a", "#1a1a18"].includes(c),
              ).map(swatch)}
            </div>
          </>
        )}
        {mode === "custom" && (
          <div className="precise-color">
            <label>
              Свой оттенок
              <input type="color" value={selectedHex} onChange={(e) => choose(e.target.value)} />
            </label>
            <label>
              HEX
              <input
                type="text"
                value={hex}
                maxLength={7}
                spellCheck={false}
                aria-invalid={!HEX.test(hex)}
                onChange={(e) => setHex(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && HEX.test(hex)) choose(hex);
                }}
              />
            </label>
            <button type="button" disabled={!HEX.test(hex)} onClick={() => choose(hex)}>
              Применить оттенок
            </button>
            <div className="palette-color-preview" style={{ background: selectedHex }} />
          </div>
        )}
        {(mode === "recent" || mode === "saved") && (
          <>
            <p className="palette-help">
              {mode === "recent" ? "Последние выбранные цвета" : "Ваши сохранённые оттенки"}
            </p>
            <div className="palette-user-colors">
              {data[mode === "recent" ? "recent" : "saved"].map((c) => (
                <div key={c}>
                  {swatch(c)}
                  {mode === "saved" && (
                    <button
                      type="button"
                      className="palette-remove"
                      aria-label={`Удалить ${c}`}
                      onClick={() =>
                        persist({
                          ...current.current,
                          saved: current.current.saved.filter((v) => v !== c),
                        })
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {!data[mode === "recent" ? "recent" : "saved"].length && (
              <p className="palette-empty">
                {ready ? "Здесь пока нет цветов" : "Загрузка цветов…"}
              </p>
            )}
          </>
        )}
        {mode === "material" && (
          <>
            {onOrientationChange && (
              <div className="material-orientation">
                <button
                  type="button"
                  aria-pressed={orientation === 0}
                  onClick={() => onOrientationChange(0)}
                >
                  ↔ {t("materialHorizontal")}
                </button>
                <button
                  type="button"
                  aria-pressed={orientation === 90}
                  onClick={() => onOrientationChange(90)}
                >
                  ↕ {t("materialVertical")}
                </button>
              </div>
            )}
            <div className="advanced-materials">
              {ALL_FACE_TEXTURES.map((texture) => (
                <button
                  key={texture.id}
                  type="button"
                  aria-pressed={color === texture.id}
                  onClick={() => choose(texture.id)}
                >
                  <i
                    style={{
                      backgroundImage: `url(${texture.src})`,
                      transform: `rotate(${(texture.baseRotation ?? 0) + orientation}deg)`,
                    }}
                  />
                  <span>{t(texture.id)}</span>
                  {color === texture.id && <Check size={20} />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <footer className="advanced-palette-footer">
        <button
          type="button"
          className="palette-no-fill"
          aria-pressed={color === "transparent"}
          onClick={() => choose("transparent")}
        >
          {t("noFill")}
        </button>
        <button
          type="button"
          disabled={
            !ready || !HEX.test(color) || data.saved.includes(color) || data.saved.length >= 48
          }
          onClick={() => persist({ ...current.current, saved: [...current.current.saved, color] })}
        >
          <Plus size={17} /> Сохранить цвет
        </button>
        <button type="button" onClick={onClose}>
          Готово
        </button>
      </footer>
      <div className="palette-storage-status" role="status">
        {error ? (
          <>
            <span>Не удалось сохранить или загрузить цвета.</span>
            <button
              type="button"
              onClick={() => {
                setError(false);
                if (ready) persist(current.current);
                else
                  request()
                    .then((d) => {
                      current.current = d;
                      setData(d);
                      setReady(true);
                    })
                    .catch(() => setError(true));
              }}
            >
              Повторить
            </button>
          </>
        ) : saving ? (
          "Сохраняем…"
        ) : faceTexture(color) ? (
          t(color)
        ) : HEX.test(color) ? (
          color.toUpperCase()
        ) : (
          t("noFill")
        )}
      </div>
    </Popover.Content>
  );
}
