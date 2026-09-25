import legacy from "./locales/legacy-catalog-facts.json";
/** Read historical catalog facts without storing translated display text in new projects. */
export const LEGACY_FACT_KEYS: Readonly<Record<string,string>> = legacy;
export const CATALOG_MESSAGE_KEYS = new Set(Object.values(legacy));
/** Verified botanical names; scientific names remain available in every language. */
export const PLANT_NAMES: Record<string, readonly [string,string,string]> = {
  "Betula pendula": [
    "Silver birch",
    "ヨーロッパシラカンバ",
    "垂枝桦"
  ],
  "Pinus sylvestris": [
    "Scots pine",
    "ヨーロッパアカマツ",
    "欧洲赤松"
  ],
  "Acer platanoides": [
    "Norway maple",
    "ノルウェーカエデ",
    "挪威槭"
  ],
  "Juniperus communis": [
    "Common juniper",
    "セイヨウネズ",
    "欧洲刺柏"
  ],
  "Syringa vulgaris": [
    "Common lilac",
    "ライラック",
    "欧洲丁香"
  ],
  "Hydrangea paniculata": [
    "Panicle hydrangea",
    "ノリウツギ",
    "圆锥绣球"
  ],
  "Lavandula angustifolia": [
    "English lavender",
    "ラベンダー",
    "狭叶薰衣草"
  ],
  "Paeonia lactiflora": [
    "Chinese peony",
    "シャクヤク",
    "芍药"
  ],
  "Hosta plantaginea": [
    "Fragrant plantain lily",
    "タマノカンザシ",
    "玉簪"
  ],
  "Echinacea purpurea": [
    "Purple coneflower",
    "ムラサキバレンギク",
    "紫松果菊"
  ],
  "Iris sibirica": [
    "Siberian iris",
    "シベリアアヤメ",
    "西伯利亚鸢尾"
  ],
  "Hemerocallis fulva": [
    "Orange daylily",
    "ワスレグサ",
    "萱草"
  ]
};
