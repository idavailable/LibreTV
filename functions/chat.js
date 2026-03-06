export async function onRequestPost(context) {
  const { request, env } = context;

  // 1. 安全检查：只允许你的指定域名访问
  const host = request.headers.get("Host");
  const allowedHosts = ["mm.dhxlsfn.dpdns.org", "libretv-4gl.pages.dev"];

  if (!allowedHosts.includes(host)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const body = await request.json();
    // 接收前端传来的 messages 数组和唯一的 chatId
    const { messages, chatId } = body; 
    const apiKey = env.DEEPSEEK_API_KEY; 

    // 2. 调用 DeepSeek R1 (reasoner) 模型
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-reasoner",
        messages: messages,
        stream: true 
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(`DeepSeek Error: ${errorText}`, { status: response.status });
    }

    // 3. 使用 tee() 将响应流一分为二
    // stream1 发送给前端实时显示，stream2 留在后端处理存储
    const [stream1, stream2] = response.body.tee();

    // 4. 异步保存逻辑：不阻塞前端响应
    context.waitUntil((async () => {
      const reader = stream2.getReader();
      const decoder = new TextDecoder();
      let fullAIContent = "";
      let fullReasoningContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.substring(6));
              const delta = data.choices[0].delta;
              // 累加思考内容和回答内容
              if (delta.reasoning_content) fullReasoningContent += delta.reasoning_content;
              if (delta.content) fullAIContent += delta.content;
            } catch (e) {}
          }
        }
      }

      // 5. 写入 R2 存储桶
      // 确保你在 Pages 设置中绑定了名为 MY_BUCKET 的 R2 桶
      if (env.MY_BUCKET && chatId) {
        const historyFile = {
          chatId: chatId,
          timestamp: new Date().toISOString(),
          // 保存完整的对话链，包括 AI 最新的思考和回答
          messages: [
            ...messages, 
            { 
              role: "assistant", 
              content: fullAIContent,
              reasoning_content: fullReasoningContent 
            }
          ]
        };

        // 将 JSON 文件存入 R2，路径为 history/id.json
        await env.MY_BUCKET.put(`history/${chatId}.json`, JSON.stringify(historyFile), {
          httpMetadata: { contentType: "application/json" }
        });
      }
    })());

    // 返回第一份流给前端
    return new Response(stream1, {
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
