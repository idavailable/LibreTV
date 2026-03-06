export async function onRequestPost(context) {
  const { request } = context;
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    
    if (!file) return new Response("No file", { status: 400 });

    const content = await file.text();
    // 简单清洗一下文本，防止干扰 AI
    const safeContent = content.slice(0, 10000); // 限制 1w 字，防止上下文溢出

    return new Response(JSON.stringify({
      name: file.name,
      content: safeContent,
      isText: true
    }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(err.message, { status: 500 });
  }
}
