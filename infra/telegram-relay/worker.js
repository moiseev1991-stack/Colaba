// Cloudflare Worker: прозрачный relay к Telegram Bot API.
// Прод-ДЦ (РФ) не достаёт api.telegram.org напрямую — блок. Воркер на
// *.workers.dev доступен из РФ и форвардит /bot<token>/<method> на Telegram.
// Защита: заголовок X-Relay-Key должен совпасть с секретом RELAY_KEY (иначе 403).
export default {
  async fetch(request, env) {
    if (request.headers.get("X-Relay-Key") !== env.RELAY_KEY) {
      return new Response("forbidden", { status: 403 });
    }
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/bot")) {
      return new Response("not found", { status: 404 });
    }
    const init = { method: request.method, headers: {} };
    const ct = request.headers.get("Content-Type");
    if (ct) init.headers["Content-Type"] = ct;
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = await request.text();
    }
    const resp = await fetch("https://api.telegram.org" + url.pathname + url.search, init);
    return new Response(await resp.text(), {
      status: resp.status,
      headers: { "Content-Type": "application/json" },
    });
  },
};
