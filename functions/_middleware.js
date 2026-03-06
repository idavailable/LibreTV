import { sha256 } from '../js/sha256.js';

export async function onRequest(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);
    const password = env.PASSWORD || "";

    // 1. 定义需要保护的路径
    const protectedPaths = [
        "/chat", "/history", "/upload", 
        "/index.html", "/about.html", "/daohang.html", 
        "/iptv.html", "/m3uplayer.html", "/net.html",
        "/chat.html" // 别忘了这个核心页面
    ];

    // 2. 只有在设置了密码且访问受限路径时才拦截
    const isProtected = protectedPaths.some(p => url.pathname.startsWith(p)) || url.pathname === "/";
    
    if (password && isProtected) {
        // 从 Header 或 Cookie 获取用户提供的哈希
        // 这里的 getCookie 是辅助函数，见下方
        const userHash = request.headers.get("X-Password") || getCookie(request, "auth_hash");
        const passwordHash = await sha256(password);

        if (userHash !== passwordHash) {
            // 如果是 HTML 页面请求，重定向到登录页
            if (url.pathname.endsWith(".html") || url.pathname === "/" || !url.pathname.includes(".")) {
                // 确保你有一个 login.html 页面，否则会陷入死循环
                return Response.redirect(new URL("/login.html", request.url), 302);
            }
            // 如果是 API 请求，返回 401
            return new Response(JSON.stringify({ error: "Unauthorized" }), { 
                status: 401,
                headers: { "Content-Type": "application/json" }
            });
        }
    }

    // --- 3. 原有的 HTML 注入逻辑 (让页面拿到校验码) ---
    const response = await next();
    const contentType = response.headers.get("content-type") || "";
    
    if (contentType.includes("text/html")) {
        let html = await response.text();
        const passwordHash = password ? await sha256(password) : "";
        
        // 注入哈希后的密码供前端校验
        html = html.replace('window.__ENV__.PASSWORD = "{{PASSWORD}}";', 
            `window.__ENV__.PASSWORD = "${passwordHash}";`);
        
        return new Response(html, {
            headers: response.headers,
            status: response.status,
            statusText: response.statusText,
        });
    }
    
    return response;
}

// 辅助函数：获取 Cookie
function getCookie(request, name) {
    const cookieString = request.headers.get("Cookie");
    if (!cookieString) return null;
    const cookies = cookieString.split(";").map(c => c.trim());
    const target = cookies.find(c => c.startsWith(name + "="));
    return target ? target.split("=")[1] : null;
}
