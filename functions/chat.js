export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json();
  const { messages, chatId } = body;

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({ model: "deepseek-reasoner", messages, stream: true })
  });

  const [stream1, stream2] = response.body.tee();

  // 后台保存逻辑
  context.waitUntil((async () => {
    const reader = stream2.getReader();
    const decoder = new TextDecoder();
    let aiContent = "", reasoningContent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.substring(6));
            const delta = data.choices[0].delta;
            if (delta.reasoning_content) reasoningContent += delta.reasoning_content;
            if (delta.content) aiContent += delta.content;
          } catch (e) {}
        }
      }
    }

    if (env.MY_BUCKET && chatId) {
      await env.MY_BUCKET.put(`history/${chatId}.json`, JSON.stringify({
        chatId,
        messages: [...messages, { role: "assistant", content: aiContent, reasoning_content: reasoningContent }]
      }), { httpMetadata: { contentType: "application/json" } });
    }
  })());

  return new Response(stream1, { headers: { "Content-Type": "text/event-stream" } });
}
