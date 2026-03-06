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

  const [stream1, stream2] = response.body.tee();

  // --- 核心修复：带缓冲区的后台保存逻辑 ---
  context.waitUntil((async () => {
    const reader = stream2.getReader();
    const decoder = new TextDecoder();
    let fullAI = "", fullReasoning = "";
    let leftover = ""; // 用于存放被切断的碎片字符串

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // 将新收到的数据接在上次留下的碎片后面
        const chunk = leftover + decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        // 最后一行可能是不完整的，留到下次循环处理
        leftover = lines.pop() || "";

        for (const line of lines) {
          const str = line.trim();
          if (!str || str === 'data: [DONE]') continue;
          if (str.startsWith('data: ')) {
            try {
              const data = JSON.parse(str.substring(6));
              const delta = data.choices[0].delta;
              if (delta.reasoning_content) fullReasoning += delta.reasoning_content;
              if (delta.content) fullAI += delta.content;
            } catch (e) {
              // 如果解析失败，说明这一行还是不全，把它吞掉或记录
              console.error("JSON解析碎片失败");
            }
          }
        }
      }

      // 循环结束后，如果还有残余的 leftover，最后尝试处理一次
      if (leftover.startsWith('data: ')) {
         try {
           const data = JSON.parse(leftover.substring(6));
           const delta = data.choices[0].delta;
           if (delta.reasoning_content) fullReasoning += delta.reasoning_content;
           if (delta.content) fullAI += delta.content;
         } catch(e) {}
      }

      // --- 最终写入 R2 ---
      if (env.MY_BUCKET && chatId && (fullAI || fullReasoning)) {
        await env.MY_BUCKET.put(`history/${chatId}.json`, JSON.stringify({
          chatId: chatId,
          timestamp: new Date().toISOString(),
          messages: [
            ...messages, 
            { 
              role: "assistant", 
              content: fullAI, 
              reasoning_content: fullReasoning 
            }
          ]
        }), { httpMetadata: { contentType: "application/json" } });
      }
    } catch (err) {
      console.error("保存失败:", err);
    } finally {
      reader.releaseLock();
    }
  })());

  return new Response(stream1, { headers: { "Content-Type": "text/event-stream" } });
}
