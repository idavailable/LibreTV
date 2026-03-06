export async function onRequestPost(context) {
  const { request, env } = context;

  // 1. 安全检查：只允许你的域名访问
  const host = request.headers.get("Host");
  const allowedHosts = ["mm.dhxlsfn.dpdns.org", "libretv-4gl.pages.dev"];

  if (!allowedHosts.includes(host)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const body = await request.json();
    const apiKey = env.DEEPSEEK_API_KEY; 

    // 2. 动态识别模型：前端传什么用什么，没传默认用 R1 (reasoner)
    const targetModel = body.model || "deepseek-reasoner";

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: targetModel,
        messages: body.messages,
        stream: true 
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(`DeepSeek Error: ${errorText}`, { status: response.status });
    }

    // 3. 转发流式响应
    return new Response(response.body, {
      headers: { 
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*" 
      }
    });

  } catch (err) {
    return new Response("Server Error: " + err.message, { status: 500 });
  }
}
