async function handleRequest(server_address = "::1", // 客户真实请求的地址
                             server_methods = "GET", // 客户真实请求的主机
                             server_headers = null,  // 客户真实发送请求头
                             server_message = null,  // 客户真实发送请求体
                             origin_address = null,  // 客户要求代理的地址————用于特定3XX回源
                             redirect_flags = true,  // 启用手动重定向标识————用于区分3XX回源
                             contents_flags = true,  // 启用内容过滤器标识————用于区分3XX回源
) {
    try {
        // 获取路径和参数 =================================================================================
        let url_json = new URL(server_address);                     // 客户请求的地址——以字典形式存储
        let url_path = decodeURIComponent(url_json.href);        // 客户请求的地址——不含参数带路径
        url_path = ensure_protocol(url_path, url_json.protocol); // 判断协议+保留查询参数
        if (server_headers == null) server_headers = filterHeaders(new Headers(), o => !o.startsWith('cf'))
        if (server_message == null) server_message = new Body(); // 如果不存在Headers或者Body，创建新的一个
        // if (server_methods == "POST")
        //     console.log(server_message);
        console.log(url_json, url_path, server_headers, server_methods);
        // 创建一个新的请求以访问目标 URL =================================================================
        const remote_data = new Request(url_json, {
            headers: server_headers, method: server_methods, redirect: 'manual',
            body: server_methods === "POST" ? server_message : null
        });

        // 定义需要匹配的路径列表 =========================================================================
        const pathsToRedirect = ['/rest/', '/api/',
            '/emby/Videos/', '/emby/videos/', '/emby/Items/']; //必须添加末尾的/

        // 检查请求路径是否匹配列表中的任何一个路径
        if (pathsToRedirect.some(path => url_json.pathname.includes(path))) {
            // 如果匹配，直接重定向到实际地址
            console.log(`Redirecting to ${url_path}`);
            return new Response(null, {
                status: 302, method: server_methods, headers: {'Location': url_path},
                body: server_methods === "POST" ? server_message : null,
            });
        }
        // 访问远端地址 ===================================================================================
        const origin_request = await fetch(remote_data);
        const origin_plainBuffer = await origin_request.clone().blob();
        const origin_arrayBuffer = await origin_plainBuffer.arrayBuffer();
        const origin_body_buffer = Buffer.from(origin_arrayBuffer).toString('utf8');


        // 处理重定向 ====================================================================================
        if (redirect_flags && [301, 302, 303, 307, 308].includes(response.status)) {
            body = response.body;
            return handleRedirect(response, body); // 创建新的 Response 对象以修改 Location 头部
        }
        // 处理过滤器 ====================================================================================
        if (contents_flags && response.headers.get("Content-Type")?.includes("text/html")) {
            body = await handleHtmlContent(response, url.protocol, url.host, actualUrl);
        }

        // 创建修改后的响应对象 ==========================================================================
        const return_data = new Response(origin_body_buffer, {
            status: origin_request.status,
            statusText: origin_request.statusText,
            headers: origin_request.headers
        });
        // 设置头部 ======================================================================================
        setNoCacheHeaders(return_data.headers);// 添加禁用缓存的头部
        setCorsHeaders(return_data.headers);   // 添加CORS头部允许跨域访问

        if (origin_request.status !== 200) {
            console.error(origin_request.statusText);
        }
        return return_data;
    } catch (error) {
        // 如果请求目标地址时出现错误，返回带有错误消息的响应和状态码 500（服务器错误）
        return jsonResponse({
            error: error.message
        }, 500);
    }
}

// 确保 URL 带有协议
function ensure_protocol(url, defaultProtocol) {
    return url.startsWith("http://") || url.startsWith("https://") ? url : defaultProtocol + "//" + url;
}

// 处理重定向
function handleRedirect(response, body) {
    const location = new URL(response.headers.get('location'));
    const modifiedLocation = `/${encodeURIComponent(location.toString())}`;
    return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
            ...response.headers,
            'Location': modifiedLocation
        }
    });
}

// 处理 HTML 内容中的相对路径
async function handleHtmlContent(response, protocol, host, actualUrlStr) {
    const originalText = await response.text();
    console.log(actualUrlStr)
    return replaceRelativePaths(originalText, protocol, host, new URL(actualUrlStr).origin);
}

// 替换 HTML 内容中的相对路径
function replaceRelativePaths(text, protocol, host, origin) {
    // const regex = new RegExp('((href|src|action)=["\'])/(?!/)', 'g');
    let regex = new RegExp('(=["\'])/(?!/)', 'g');
    // let newText =text
    // newText = text.replace(regex, `="https://proxyz.opkg.us.kg/${origin}/`)
    // regex = new RegExp('(url[("\'])/(?!/)', 'g');
    // newText = newText.replace(regex, `https://proxyz.opkg.us.kg/${origin}/`)
    return text;
    // return text.replace(regex, `$1${protocol}//${host}/${origin}/`);
}

// 返回 JSON 格式的响应
function jsonResponse(data, status) {
    return new Response(JSON.stringify(data), {
        status: status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8'
        }
    });
}

// 过滤请求头
function filterHeaders(headers, filterFunc) {
    return new Headers([...headers].filter(([name]) => filterFunc(name)));
}

// 设置禁用缓存的头部
function setNoCacheHeaders(headers) {
    headers.set('Cache-Control', 'no-store');
}

// 设置 CORS 头部
function setCorsHeaders(headers) {
    headers.set('Access-Control-Allow-Origin', "*");
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    headers.set('Access-Control-Allow-Headers', '*');
    headers.set('Access-Control-Allow-Credentials', 'true');
}

module.exports = {handleRequest};