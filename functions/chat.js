// functions/chat.js
export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json();

  // 从 Cloudflare 环境变量读取 Key
  const apiKey = env.DEEPSEEK_API_KEY; 

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: body.model || "deepseek-chat",
      messages: body.messages,
      stream: true
    })
  });

  return new Response(response.body, {
    headers: { "Content-Type": "text/event-stream" }
  });
}
if (request.headers.get("Host") !== "mm.dhxlsfn.dpdns.org") {
    return new Response("Unauthorized", { status: 401 });
}
