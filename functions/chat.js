export async function onRequestPost(context) {
  const { request, env } = context;

  // --- 【安全检查：必须放在这里】 ---
  // 获取当前请求的域名
  const host = request.headers.get("Host");
  
  // 如果不是你指定的域名，直接拒绝访问
  if (host !== "mm.dhxlsfn.dpdns.org") {
    return new Response("Unauthorized: Access denied for " + host, { 
      status: 401,
      headers: { "Content-Type": "text/plain" }
    });
  }
  // ------------------------------

  const body = await request.json();
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
    headers: { 
      "Content-Type": "text/event-stream",
      "Access-Control-Allow-Origin": "*" 
    }
  });
}
