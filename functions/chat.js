export async function onRequestPost(context) {
  const { request, env } = context;

  // --- 安全检查：域名白名单 ---
  const host = request.headers.get("Host");
  const allowedHosts = ["mm.dhxlsfn.dpdns.org", "libretv-4gl.pages.dev"];

  // 如果请求不是来自你的域名，直接拦截并返回 401
  if (!allowedHosts.includes(host)) {
    return new Response("Unauthorized: Access denied for " + host, { 
      status: 401,
      headers: { "Content-Type": "text/plain" }
    });
  }
  // -------------------------

  try {
    const body = await request.json();
    const apiKey = env.DEEPSEEK_API_KEY; 

    // 发起对 DeepSeek 官方 API 的请求
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: body.model || "deepseek-chat",
        messages: body.messages,
        stream: true // 保持流式输出
      })
    });

    // 检查 DeepSeek API 是否返回错误（如余额不足或 Key 无效）
    if (!response.ok) {
      const errorText = await response.text();
      return new Response(`DeepSeek API Error: ${errorText}`, { status: response.status });
    }

    // 将 DeepSeek 的流式响应直接转发给前端
    return new Response(response.body, {
      headers: { 
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*" 
      }
    });

  } catch (err) {
    return new Response("Internal Server Error: " + err.message, { status: 500 });
  }
}
