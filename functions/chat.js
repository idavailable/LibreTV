export async function onRequestPost(context) {
  const { request, env } = context;

  // 1. 安全检查
  const host = request.headers.get("Host");
  const allowedHosts = ["mm.dhxlsfn.dpdns.org", "libretv-4gl.pages.dev"];
  if (!allowedHosts.includes(host)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const body = await request.json();
    const { messages, chatId } = body; 
    const apiKey = env.DEEPSEEK_API_KEY; 

    // 2. 调用 DeepSeek
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
      return new Response(`DeepSeek Error`, { status: response.status });
    }

    // 3. 将流一分为二
    const [stream1, stream2] = response.body.tee();

    // 4. 关键修复：异步保存逻辑
    context.waitUntil((async () => {
      const reader = stream2.getReader();
      const decoder = new TextDecoder();
      let fullAIContent = "";
      let fullReasoningContent = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          for (const line of lines) {
            const str = line.trim();
            if (!str || str === 'data: [DONE]') continue;
            if (str.startsWith('data: ')) {
              try {
                const json = JSON.parse(str.substring(6));
                const delta = json.choices[0].delta;
                if (delta.reasoning_content) fullReasoningContent += delta.reasoning_content;
                if (delta.content) fullAIContent += delta.content;
              } catch (e) { /* 忽略残留碎片 */ }
            }
          }
        }

        // 5. 写入 R2 (确保在此执行)
        if (env.MY_BUCKET && chatId && (fullAIContent || fullReasoningContent)) {
          const historyFile = {
            chatId: chatId,
            timestamp: new Date().toISOString(),
            messages: [
              ...messages, 
              { 
                role: "assistant", 
                content: fullAIContent,
                reasoning_content: fullReasoningContent 
              }
            ]
          };

          // 强制写入到 history/ 目录下
          await env.MY_BUCKET.put(`history/${chatId}.json`, JSON.stringify(historyFile), {
            httpMetadata: { contentType: "application/json" }
          });
          console.log(`Successfully saved: history/${chatId}.json`);
        }
      } catch (saveErr) {
        console.error("Save task failed:", saveErr);
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
