export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json();
  const { messages, chatId } = body;

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json", 
      "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}` 
    },
    body: JSON.stringify({ model: "deepseek-reasoner", messages, stream: true })
  });

  if (!response.ok) return response;

  const reader = response.body.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // 创建一个可读流返回给前端
  const stream = new ReadableStream({
    async start(controller) {
      let fullAI = "";
      let fullReasoning = "";
      let leftover = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // --- 关键点：流结束了，立即存入 R2 ---
            if (env.MY_BUCKET && chatId && (fullAI || fullReasoning)) {
              const historyData = {
                chatId,
                timestamp: new Date().toISOString(),
                messages: [
                  ...messages,
                  { role: "assistant", content: fullAI, reasoning_content: fullReasoning }
                ]
              };
              // 这里用 waitUntil 保护最后的写入动作
              context.waitUntil(
                env.MY_BUCKET.put(`history/${chatId}.json`, JSON.stringify(historyData), {
                  httpMetadata: { contentType: "application/json" }
                })
              );
            }
            controller.close();
            break;
          }

          // 转发给前端
          controller.enqueue(value);

          // 同步解析内容用于保存
          const chunk = leftover + decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          leftover = lines.pop() || "";

          for (const line of lines) {
            const str = line.trim();
            if (str.startsWith('data: ') && str !== 'data: [DONE]') {
              try {
                const data = JSON.parse(str.substring(6));
                const delta = data.choices[0].delta;
                if (delta.reasoning_content) fullReasoning += delta.reasoning_content;
                if (delta.content) fullAI += delta.content;
              } catch (e) {}
            }
          }
        }
      } catch (err) {
        controller.error(err);
      }
    }
  });

  return new Response(stream, {
    headers: { 
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  });
}
