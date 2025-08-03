import {serveStatic} from 'hono/cloudflare-workers' // @ts-ignore
import manifest from '__STATIC_CONTENT_MANIFEST'
import * as index from './index'

import {KVNamespace} from '@cloudflare/workers-types';
import {app} from "./index";
index.app.use("*", serveStatic({manifest: manifest, root: "./"}));

export default index.app