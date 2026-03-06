export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const chatId = formData.get('chatId');
    
    if (!file) return new Response("无文件", { status: 400 });

    const fileName = `${Date.now()}-${file.name}`;
    const filePath = `uploads/${chatId}/${fileName}`;

    // 1. 将原始文件保存到 R2（作为备份或供下载）
    await env.MY_BUCKET.put(filePath, file.stream(), {
      httpMetadata: { contentType: file.type }
    });

    let extractedText = "";
    
    // 2. 如果是文本类型文件，提取其中的内容
    // 常见的文本类型：text/plain, text/javascript, application/json 等
    if (file.type.startsWith('text/') || 
        file.name.endsWith('.js') || 
        file.name.endsWith('.py') || 
        file.name.endsWith('.md') ||
        file.name.endsWith('.json')) {
      extractedText = await file.text();
    }

    // 3. 返回文件信息和提取出的内容
    return new Response(JSON.stringify({
      url: `/${filePath}`, 
      name: file.name,
      type: file.type,
      content: extractedText, // 关键：这是发给 AI 的文本
      isText: extractedText !== ""
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
