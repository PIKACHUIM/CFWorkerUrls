import {Context, Hono} from 'hono'
import {cors} from 'hono/cors'
import {basicAuth} from 'hono/basic-auth'// @ts-ignore
import {handleRequest} from './proxy'// @ts-ignore

// 全局设置 ############################################################################################################
export type Bindings = {
    DATABASE: KVNamespace | any,
    FULL_URL: string
    Protocol: string
    EDIT_LEN: string
    EDIT_SUB: string
    AUTH_USE: string
    // EDGE_ONE: boolean
}
export const app = new Hono<{ Bindings: Bindings }>();
app.use('*', cors({origin: "*"}))


// 中间件：仅子域名 *.xxx.xxx 直接进行代理 =============================================================================
// app.use('*', async (c, next) => {
//     try {
//         const origin_host = c.req.header('host') || ''
//         const server_host = c.env.FULL_URL.replace(/\./g, '\\.'); // 转义正则中的点号
//         const isSubdomain = new RegExp(`^.+\.${server_host}$`).test(origin_host);  // 动态构建正则表达式
//         if (isSubdomain) {
//             const sub_text: string = origin_host.split('.')[0]
//             const sub_data: any = await reader(c, sub_text.toUpperCase());
//             // 返回响应给客户端
//             let extra: string = new URL(c.req.url).pathname + new URL(c.req.url).search
//             const result = await handleRequest(
//                 sub_data["record"] + extra, c.req.method, c.req.header,
//                 await c.req.blob(), sub_data["record"], false, false
//             );
//             //需要重新封装response
//             return new Response(result.body, {
//                 status: result.status,
//                 statusText: result.statusText,
//                 headers: Object.fromEntries(result.headers.entries())
//             });
//         }
//         await next() // 非子域名继续后续路由
//     } catch (e) {
//         console.log(e)
//         return c.text(e.stack || String(e), 500)
//     }
// })

function set(c: Context) {
    c.env.DATABASE = DATABASE | c.env.DATABASE
    c.env.FULL_URL = FULL_URL | c.env.FULL_URL
    c.env.Protocol = Protocol | c.env.Protocol
    c.env.AUTH_USE = AUTH_USE | c.env.AUTH_USE
    c.env.EDIT_LEN = EDIT_LEN | c.env.EDIT_LEN
    c.env.EDIT_SUB = EDIT_SUB | c.env.EDIT_SUB
    c.env.AUTH_USE = AUTH_USE | c.env.AUTH_USE
}

// 主页展示 ############################################################################################################
app.get('/', async (c) => {
    return redirect(c, "/index.html");
})

app.get('/test/', async (c) => {
    set(c)
    console.log(
        c.env.FULL_URL, c.env.Protocol,
        c.env.AUTH_USE, c.env.EDIT_LEN,
        c.env.EDIT_SUB, c.env.AUTH_USE,
        // c.env.EDGE_ONE
    );
    return c.text("ok");
})

// 生成页面 ############################################################################################################
app.get('/a/', async (c) => {
    return redirect(c, "/index.html");
})

// 结果页面 ############################################################################################################
app.get('/i/', async (c) => {
    return redirect(c, "/links.html");
})

// 结果页面 ############################################################################################################
app.get('/c/:suffix/*', async (c) => {
    return redirect(c, "/login.html");
})

// 页面跳转 ############################################################################################################
function redirect(c: Context, path: string) {
    try {
        const url = new URL(c.req.url);
        const searchParams = url.searchParams;
        // 构造新的 URL 并携带原始参数
        const newUrl = new URL(path, c.req.url);
        searchParams.forEach((value, key) => {
            newUrl.searchParams.append(key, value);
        });
        return c.redirect(newUrl, 302);
    } catch (e) {
        console.log(e)
        return c.text((e as Error).stack || String(e), 500)
    }

}

// 验证方法 ############################################################################################################
app.use(
    '/b/:suffix/*',
    basicAuth({
        verifyUser: async (username, password, c) => {
            if (username != "") console.log(username);
            let suffix: string = <string>c.req.param('suffix');
            let result: string = <string>await c.env.DATABASE.get(suffix);
            let detail = JSON.parse(result);
            return (
                password === detail["guests"]
            )
        },
    })
)
// 验证链接 ############################################################################################################
app.get('/b/:suffix/*', async (c) => {
    try {
        let suffix: string = <string>c.req.param('suffix');
        let result: string = <string>await c.env.DATABASE.get(suffix);
        let detail = JSON.parse(result);
        await newTime(c, suffix);
        return parser(c, detail, suffix);
    } catch (e) {
        console.log(e)
        return c.text((e as Error).stack || String(e), 500)
    }

})

async function reader(c: Context<{ Bindings: Bindings; }, "*", {}>, suffix: string) {
    let result: string = <string>await c.env.DATABASE.get(suffix);
    return JSON.parse(result);
}


// 链接跳转 ############################################################################################################
app.get('/s/:suffix/*', async (c) => {
    try {
        let guests: string = <string>c.req.query('guests')
        let suffix: string = <string>c.req.param('suffix')
        // 判断是否有效 =============================================
        if (suffix === undefined || suffix === null || suffix == "")
            return c.notFound();
        let detail: any = await reader(c, suffix);
        // 判断是否有效 =============================================
        if (detail != undefined && detail["record"] != null) {
            // 验证身份 ===========================================================
            if (detail["guests"] != "") {
                // 使用页面认证方法 -----------------------------------------------
                if (c.env.AUTH_USE) {
                    // 还未认证 ---------------------------------------------------
                    if (guests === undefined || guests === null)
                        return c.redirect("/login.html?suffix=" + suffix, 302);
                    else if (guests == detail["guests"])
                        return parser(c, detail, suffix);
                    // return c.redirect("/login.html?suffix=" + suffix, 302);
                    return c.html("<script>alert('密码不正确或跳转链接不存在');" +
                        "\nwindow.close();</script>")
                }
                // 使用Basic Auth认证 ---------------------------------------------
                else {
                    let route: string[] = c.req.url.split('/'); // 获取完整请求路径
                    let extra: string = "/" + route.slice(5).join('/'); // 剩余路径
                    return c.redirect("/b/" + suffix + extra, 302);
                }

            } else {
                await newTime(c, suffix);
                return parser(c, detail, suffix);
            }
        } else return c.notFound();
    } catch (e) {
        console.log(e)
        return c.text((e as Error).stack || String(e), 500)
    }

})

// 链接跳转 ############################################################################################################
async function parser(c: Context, detail: any, suffix: string = "") {
    try {
        let record: string = detail["record"];
        let typing: string = detail["typing"];
        // 处理子路径 ===================================================================================================
        let route: string[] = c.req.url.split('/'); // 获取完整请求路径
        let extra: string = "/" + route.slice(5).join('/'); // 剩余路径
        extra = removeGuestsParam(extra);
        // console.log(`Extra path: ${extra}`);
        // 处理跳转逻辑 =================================================================================================
        // if (typing == "iframe") return c.html('<frameset rows="100%"> <frame src="' + record + extra + '"> </frameset>');
        // console.log(c.env.Protocol + "://" + suffix + "." + c.env.FULL_URL + "/")
        if (typing == "iframe") return c.html('<iframe width="100%" height="100%" src=' + record + '></iframe>');
        if (typing == "direct") return c.redirect(record + extra, 302);
        if (typing == "proxys") return c.redirect("https://proxyz.524228.xyz/" + record + extra, 302);
        if (typing == "agents") return c.redirect("http://" + suffix + "." + c.env.FULL_URL + "/", 302);
        if (typing == "hidden") {// 返回响应给客户端
            const result = await handleRequest(c.env.Protocol + "://" + c.env.FULL_URL + "/" + record + extra);
            // 由于直接返回fetch得到的response会出现 Can't modify immutable headers错误，因此需要重新封装response
            return new Response(result.body, {
                status: result.status,
                statusText: result.statusText,
                headers: Object.fromEntries(result.headers.entries())
            })
        }
        return c.notFound()
    } catch (e) {
        console.log(e)
        return c.text((e as Error).stack || String(e), 500)
    }

}

// 查询链接 ############################################################################################################
app.get('/q/:suffix', async (c) => {
    try {
        let suffix: string | undefined = c.req.param('suffix');
        let record: string | undefined = c.req.param('record');
        let result: string = <string>await c.env.DATABASE.get(suffix);
        let detail = JSON.parse(result);
        // console.log(detail);
        if (record === undefined || record === null || record == "") {
            let output: Dict = {
                suffix: detail["suffix"],
                expire: detail["expire"],
                record: detail["record"],
                typing: detail["typing"],
                timers: detail["timers"],
            };
            return c.text(JSON.stringify(output));
        }
        return c.text(detail["record"]);
    } catch (error) {
        // console.log(error);
        return c.notFound()
    }
})

// 新增链接 ############################################################################################################
app.get('/u/', async (c) => {
    try {
        let suffix: string = <string>c.req.query('suffix'); // 更新需要
        let tokens: string = <string>c.req.query('tokens'); // 更新需要
        let guests: string = <string>c.req.query('guests');
        let record: string = <string>c.req.query('record');
        let expire: string = <string>c.req.query('expire');
        let typing: string = <string>c.req.query('typing');
        let update: string = <string>c.req.query('update');
        let module: boolean = false // false-新增 true-修改
        if (suffix != "") {
            // console.log(update, update === null);
            // 有suffix但是没有update，新增自定义链接 =======================
            if (update === undefined
                || update === null
                || update?.length === 0) {
                if (!c.env.EDIT_SUB)
                    return c.html("<script>alert('未启用自定后缀');" +
                        "\nwindow.close();</script>");
                if (suffix.length < Number(c.env.EDIT_LEN)) {
                    let h = "后缀太短，要求长度>=" + c.env.EDIT_LEN
                    return c.html("<script>alert('设置" + h + "');" +
                        "\nwindow.close();</script>");
                }

                let query: string = <string>await c.env.DATABASE.get(suffix)
                if (query !== null && query.length > 0)
                    return c.html("<script>alert('此后缀已经存在');" +
                        "\nwindow.close();</script>");
                tokens = <string>newUUID(16);
            }
            // 有update，则为更新链接 =======================================
            else {
                let tp = c.env.Protocol + "://" + c.env.FULL_URL + "/"
                suffix = suffix.replace(tp, "");
                suffix = suffix.replace("s/", "");
                module = true;
            }
        }
        // 都没有，生成新的 =================================================
        else {
            suffix = <string>newUUID(8);
            tokens = <string>newUUID(16);
        }
        // 输出过期时间 =================================================
        let now_is: Date = new Date();
        let exp_is: number = now_is.setHours(
            now_is.getHours() + 24 * Number(expire))

        // 判断不包含协议 ===============================================
        if (!record.includes("http://") && !record.includes("https://"))
            record = "http://" + record
        record = record.replace(/\/+$/, '');
        // 写入数据 =====================================================
        let timers: number = <number>(new Date()).getTime();
        let result: Dict = {
            suffix: suffix, expire: expire, record: record, guests: guests,
            typing: typing, tokens: tokens, timers: timers.toString()
        }
        if (module) {
            // 判断原始密码是否相同 --------------------------------------
            let query: string = <string>await c.env.DATABASE.get(suffix)
            let start = JSON.parse(<string>query)
            if (tokens != <string>start["tokens"])
                return redirect(c, "/error.html");
            // 删除原始的键值对数据 ------------------------------------
            await c.env.DATABASE.delete(suffix)
        }
        // 写入新的键值对的信息 ------------------------------------
        await c.env.DATABASE.put(suffix, JSON.stringify(result))
        // 返回数据 ====================================================
        let tp = c.env.Protocol + "://" + c.env.FULL_URL + "/"
        return c.redirect("/i/" +
            "?suffix=" + tp + "s/" + suffix +
            "&tokens=" + tokens +
            "&record=" + record +
            "&typing=" + typing +
            "&guests=" + guests +
            "&expire=" + exp_is,
            302);
    } catch (e) {
        console.log(e)
        return c.text((e as Error).stack || String(e), 500)
    }

})

// 自动修改 ############################################################################################################
app.use('/p/', async (c) => {
    try {
        // 检查请求方法
        const method = c.req.method;

        // 初始化变量
        let tokens: string | undefined;
        let suffix: string | undefined;
        let typing: string | undefined;
        let ipaddr: string | undefined;
        let porter: string | undefined;
        // console.log(method);
        // 如果是 POST 请求，尝试从 JSON 获取数据
        if (method === 'POST') {
            try {
                const body = await c.req.json();
                tokens = body["tokens"];
                suffix = body["suffix"];
                typing = body["typing"];
                ipaddr = body["ipaddr"];
                porter = body["porter"];
            } catch (error) {
                return c.text(JSON.stringify({
                    "success": false,
                    "message": "Invalid JSON format",
                }), 400); // 返回 400 Bad Request
            }
        }

        // 如果是 GET 请求或 POST 请求中缺少数据，尝试从 URL 参数获取
        if (!tokens || !suffix || !typing || !ipaddr || !porter) {
            tokens = c.req.query("tokens") || tokens;
            suffix = c.req.query("suffix") || suffix;
            typing = c.req.query("typing") || typing;
            ipaddr = c.req.query("ipaddr") || ipaddr;
            porter = c.req.query("porter") || porter;
        }
        suffix = <string>suffix;

        // 判断原始密码是否相同 ------------------------------------
        let query: string = <string>await c.env.DATABASE.get(suffix)
        let start = JSON.parse(<string>query)
        if (tokens != <string>start["tokens"])
            return c.text(JSON.stringify({
                "success": false,
                "message": "Invalid password or suffix",
            }));
        else
            start["record"] = typing + "://" + ipaddr + ":" + porter
        // 删除原始的键值对数据 ------------------------------------
        await c.env.DATABASE.delete(suffix)
        // 写入新的键值对的信息 ------------------------------------
        await c.env.DATABASE.put(suffix, JSON.stringify(start))
        // 返回数据 ================================================
        return c.text(JSON.stringify({
            "success": true,
            "message": "Successfully updated links"
        }))
    } catch (e) {
        console.log(e)
        return c.text((e as Error).stack || String(e), 500)
    }

})

// 生成后缀 ############################################################################################################
function newUUID(length: number = 16): string {
    const charset = 'ABCDEFGHJKLMNPQRSTUWXY0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * charset.length);
        result += charset[randomIndex];
    }
    return result;
}


// // 读取模板 ############################################################################################################
// async function getTemp(module: string, url: string) {
//     let full_url: string = url + "static/" + module
//     const response = await fetch(full_url)
//     if (!response.ok) {
//         throw new Error('Failed to fetch template, url: ' + full_url + ",error:" + response.statusText);
//     }
//     return await response.text()
// }

// 更新时间 ############################################################################################################
async function newTime(c: Context, suffix: any) {
    let result: string = <string>await c.env.DATABASE.get(suffix);
    let detail = JSON.parse(result);
    // 写入新的键值对的信息 ------------------------------------
    detail["timers"] = <number>(new Date()).getTime();
    await c.env.DATABASE.delete(suffix);
    await c.env.DATABASE.put(suffix, JSON.stringify(detail));
    return c.text(JSON.stringify({}));
}

// 移除参数 ############################################################################################################
function removeGuestsParam(url: string): string {
    // 创建一个 URL 对象
    const urlObj = new URL("https://example.com" + url);
    // 获取搜索参数
    const searchParams = urlObj.searchParams;
    // 删除 guests 参数
    searchParams.delete('guests');
    // 返回新的 URL 字符串
    return urlObj.toString().replace("https://example.com", "");
}

// 数据模板 ############################################################################################################
interface Dict {
    [key: string]: string;
}


app.fire()
// 定时任务 ############################################################################################################
// export default app
export default {
    async fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
        return app.fetch(request, env, ctx);
    },
    async scheduled(controller: ScheduledController, env: Bindings, ctx: ExecutionContext) {
        console.log('Cron job processed');
        try {
            console.log(controller, ctx)
            const keys = await env.DATABASE.list();
            for (const key of keys.keys) {
                const value = await env.DATABASE.get(key.name);
                console.log(key.name, value);
                if (value) {
                    const detail = JSON.parse(value);
                    const timers = detail.timers;
                    if (!timers) {
                        await env.DATABASE.delete(key.name);
                        console.log("Delete Invalid", key.name, value);
                        continue;
                    }
                    // 将 timers 转换为日期对象
                    const oldDate = new Date(Number(timers));
                    const nowDate = new Date();
                    // 计算时间差（天数）
                    const diffTime: number = nowDate.getTime() - oldDate.getTime();
                    const expsTime: number = Number(detail["expire"]) * 1000 * 60 * 60 * 24
                    console.log(
                        "\nName Records: " + key.name,
                        "\nLast Updated: " + oldDate,
                        "\nCurrent Time: " + nowDate,
                        "\nWaiting Hour: " + Math.ceil(diffTime / 1000 / 3600),
                        "\nConfigs Hour: " + Math.ceil(diffTime / 1000 / 3600));
                    // 如果时间差大于等于 expireDays，则删除该键值对
                    if (diffTime >= expsTime) {
                        await env.DATABASE.delete(key.name);
                        console.log(`Deleted key: ${key.name}`);
                    }
                }
            }
        } catch (error) {
            console.error('Error processing cron job:', error);
        }
    },
};