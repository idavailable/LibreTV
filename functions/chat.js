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
  const stream = new ReadableStream({
    async start(controller) {
      let fullAI = "", fullReasoning = "", leftover = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // 保存逻辑
            if (env.MY_BUCKET && chatId) {
              const title = messages.find(m => m.role === 'user')?.content.slice(0, 25) || "新对话";
              const historyData = {
                chatId,
                messages: [...messages, { role: "assistant", content: fullAI, reasoning_content: fullReasoning }]
              };
              context.waitUntil(
                env.MY_BUCKET.put(`history/${chatId}.json`, JSON.stringify(historyData), {
                  customMetadata: { title: title.replace(/\n/g, " ") }
                })
              );
            }
            controller.close();
            break;
          }
          controller.enqueue(value);

          // 解析流用于持久化
          const chunk = leftover + decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          leftover = lines.pop() || "";
          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const data = JSON.parse(line.substring(6));
                const delta = data.choices[0].delta;
                if (delta.reasoning_content) fullReasoning += delta.reasoning_content;
                if (delta.content) fullAI += delta.content;
              } catch (e) {}
            }
          }
        }
      } catch (err) { controller.error(err); }
    }
  });

  return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
}
