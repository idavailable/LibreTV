export async function onRequestPost(context) {
  const { request, env } = context;
  const { messages, chatId } = await request.json();

  if (!env.DEEPSEEK_API_KEY) return new Response("API Key Missing", { status: 500 });

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: "deepseek-reasoner",
      messages: messages,
      stream: true
    })
  });

  if (!response.ok) return response;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      let fullAI = "", fullReasoning = "", leftover = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // 流结束后立即写入 R2
            if (env.MY_BUCKET && chatId) {
              const title = messages.find(m => m.role === 'user')?.content.slice(0, 30).replace(/\n/g, " ") || "新对话";
              const historyData = {
                chatId,
                messages: [...messages, { role: "assistant", content: fullAI, reasoning_content: fullReasoning }]
              };
              // waitUntil 确保 Worker 不会在写入完成前关闭
              context.waitUntil(
                env.MY_BUCKET.put(`history/${chatId}.json`, JSON.stringify(historyData), {
                  customMetadata: { title: title },
                  httpMetadata: { contentType: "application/json" }
                })
              );
            }
            controller.close();
            break;
          }

          // 转发给前端
          controller.enqueue(value);

          // 累加内容用于保存（处理断裂的 JSON 碎片）
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
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
  });
}
