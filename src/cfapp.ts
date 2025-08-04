import {serveStatic} from 'hono/cloudflare-workers' // @ts-ignore
import manifest from '__STATIC_CONTENT_MANIFEST'
import * as index from './index'

index.app.use("*", serveStatic({manifest: manifest, root: "./"}));
// export default index.app
index.app.fire()

// 定时任务 ############################################################################################################
export default {
    async fetch(request: Request, env: index.Bindings, ctx: ExecutionContext) {
        return index.app.fetch(request, env, ctx);
    },
    async scheduled(controller: ScheduledController, env: index.Bindings, ctx: ExecutionContext) {
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