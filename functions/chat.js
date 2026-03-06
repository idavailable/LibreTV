export async function onRequestPost(context) {
  const { request, env } = context;
  const { messages, chatId } = await request.json();

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
  const encoder = new TextEncoder();

  // 创建新流，边转发边累积
  const stream = new ReadableStream({
    async start(controller) {
      let fullAI = "", fullReasoning = "", leftover = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // --- 关键：流结束即刻保存 ---
            if (env.MY_BUCKET && chatId) {
              const firstMsg = messages.find(m => m.role === 'user')?.content || "新对话";
              const shortTitle = firstMsg.trim().slice(0, 20).replace(/\n/g, " ");
              
              const historyData = {
                chatId,
                messages: [...messages, { role: "assistant", content: fullAI, reasoning_content: fullReasoning }]
              };

              // 使用 customMetadata 存储标题，优化 history 接口
              await env.MY_BUCKET.put(`history/${chatId}.json`, JSON.stringify(historyData), {
                customMetadata: { title: shortTitle },
                httpMetadata: { contentType: "application/json" }
              });
            }
            controller.close();
            break;
          }

          // 转发原始字节
          controller.enqueue(value);

          // 解析用于累加
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
