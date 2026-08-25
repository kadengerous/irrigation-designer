import { createServerFn } from "@tanstack/react-start";

export const adviseLayout = createServerFn({ method: "POST" })
  .validator((input: { summary: string }) => input)
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "AI недоступен в этой среде" };

    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 700,
        messages: [
          {
            role: "system",
            content:
              "Ты инженер Hunter Irrigation. Отвечай по-русски кратко. Правила: head-to-head, не мешать MP800 со стандартными MP, не поливать плитку/дом, 2.8 бар, Pro-Spray PRS40. Не выдумывай модели вне каталога Hunter.",
          },
          { role: "user", content: data.summary },
        ],
      }),
    });
    if (!res.ok) return { ok: false as const, error: `xAI ${res.status}` };
    const body = (await res.json()) as { choices: { message: { content: string } }[] };
    return { ok: true as const, text: body.choices[0]?.message.content ?? "" };
  });
