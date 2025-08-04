import {Context} from "hono";

export async function kv_get(c: Context, key: string): Promise<string | void> {
    if (c.env.EDGE_ONE) {
        return await c.env.DATABASE.get(key)
    } else {
        return await c.env.DATABASE.get(key)
    }
}
