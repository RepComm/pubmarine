import { createServer } from "http";
import serveHandler from "serve-handler";
import { server as WebSocketServer } from "websocket";
import { watchFile } from "fs";
function originIsAllowed(origin) {
    return true;
}
async function main() {
    let hostname = "0.0.0.0";
    let port = 10209;
    let httpServer;
    async function loadAuthFunc() {
        //call with current date time so caching is ignored
        const mod = await import(`./auth.js?${Date.now()}`);
        return mod.auth;
    }
    let authFunc = await loadAuthFunc();
    watchFile("./dst/auth.js", {
        persistent: true,
        interval: 4000
    }, async (curr, prev) => {
        try {
            console.log("Detected changes to auth.js Reloading auth() from auth.js");
            authFunc = await loadAuthFunc();
        }
        catch (ex) {
            console.warn(ex);
        }
    });
    httpServer = createServer((req, res) => {
        // console.log(req.url);
        if (req.url.startsWith("/api")) {
            res.writeHead(200, "success", {
                "Content-Type": "application/json"
            });
            const msg = JSON.stringify({
                status: "Success",
                msg: `You tried to visit ${req.url}`
            });
            res.write(msg);
            res.end();
        }
        else {
            serveHandler(req, res, {
                cleanUrls: true,
                directoryListing: false,
                public: "./dst",
                symlinks: false
            });
        }
    });
    httpServer.listen(port, hostname);
    let wss = new WebSocketServer({
        httpServer,
        autoAcceptConnections: false
    });
    const wsList = new Set();
    const schemas = new Map();
    const subscriptions = new Map();
    function subStorageGetOrCreate(topic) {
        let result = subscriptions.get(topic);
        if (!result) {
            result = {
                topicSubscribers: new Set(),
                idSubScribers: new Map()
            };
            subscriptions.set(topic, result);
        }
        return result;
    }
    function idSubsListGetOrCreate(storage, id) {
        let list = storage.idSubScribers.get(id);
        if (!list) {
            list = new Set();
            storage.idSubScribers.set(id, list);
        }
        return list;
    }
    function addSubscriber(topic, id = undefined, ws) {
        const storage = subStorageGetOrCreate(topic);
        if (id !== undefined) {
            idSubsListGetOrCreate(storage, id).add(ws);
            console.log(`[sub] ${topic}:${id} -> client`);
        }
        else {
            storage.topicSubscribers.add(ws);
            console.log(`[sub] ${topic} -> client`);
        }
    }
    function walkSubscribers(topic, id = undefined, cb) {
        const storage = subStorageGetOrCreate(topic);
        //call ID specific listeners first if present
        if (id !== undefined) {
            const idSubs = storage.idSubScribers.get(id);
            if (idSubs) {
                for (const ws of idSubs) {
                    cb(ws);
                }
            }
        }
        //call topic subscribers always if present
        for (const ws of storage.topicSubscribers) {
            cb(ws);
        }
    }
    const onWebSocketMessage = async (ws, msg) => {
        if (msg.type !== "utf8")
            return;
        const content = msg.utf8Data;
        let req;
        try {
            req = JSON.parse(content);
        }
        catch (ex) {
            console.warn("Couldn't parse json from WS", ex);
            return;
        }
        let res = {
            id: req.id,
            response: {
                type: req.type
            }
        };
        switch (req.type) {
            case "auth":
                {
                    let id;
                    try {
                        id = await authFunc(req);
                    }
                    catch (ex) {
                        res.error = ex;
                    }
                    res.response.id = id;
                }
                break;
            case "schema-set":
                {
                    let { topic, shape } = req.msg;
                    if (schemas.has(topic)) {
                        res.error = `Invalid auth to create schema`;
                    }
                    else {
                        console.log(`[schema] created "${topic}"`);
                        schemas.set(topic, {
                            shape,
                            instances: new Map()
                        });
                    }
                }
                break;
            case "schema-get":
                {
                    let { topic } = req.msg;
                    const schema = schemas.get(topic);
                    if (!schema) {
                        res.error = "no schema for topic";
                        break;
                    }
                    res.response.shape = schema.shape;
                }
                break;
            case "instance":
                {
                    const topic = req.msg.topic;
                    const storage = schemas.get(topic);
                    if (!storage) {
                        res.error = `schema for topic was not found`;
                        break;
                    }
                    const instanceId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString();
                    res.response.id = instanceId;
                    storage.instances.set(instanceId, {});
                    console.log("instance req", req);
                    /**create a message to send to topic subscribers
                     * to let them know a new instance exists
                     */
                    const subInstRes = {
                        response: {
                            type: "sub-inst",
                            topic,
                            id: instanceId
                        },
                        id: -1
                    };
                    const subInstResStr = JSON.stringify(subInstRes);
                    console.log(`[schema] instanced "${topic}:${instanceId}"`);
                    walkSubscribers(topic, undefined, (ws) => {
                        console.log("Notifying", ws.remoteAddress, "of instance", instanceId);
                        ws.send(subInstResStr);
                    });
                }
                break;
            case "mut":
                {
                    const { topic, id, change } = req.msg;
                    // console.log("mut", req);
                    if (!topic) {
                        res.error = "missing req.msg.topic, cannot mutate record";
                        break;
                    }
                    if (!id) {
                        res.error = "missing req.msg.id, cannot mutate record";
                        break;
                    }
                    if (!change) {
                        res.error = "missing req.msg.change, cannot mutate record";
                        break;
                    }
                    const storage = schemas.get(topic);
                    if (!storage) {
                        res.error = "No schema found by topic";
                        break;
                    }
                    const old = storage.instances.get(id);
                    //TODO - allow to ignore actually changed data propagation
                    //essentially allow clients to "update" when the data may be completely similar
                    //would be faster but sacrifice network bandwidth in some cases
                    for (const key in change) {
                        const isChanged = old[key] !== change[key];
                        if (isChanged) {
                            old[key] = change[key];
                        }
                        else {
                            change[key] = undefined;
                            delete change[key];
                        }
                    }
                    const subRes = {
                        response: {
                            type: "sub-res",
                            topic, id, change
                        },
                        id: -1
                    };
                    const subResStr = JSON.stringify(subRes);
                    walkSubscribers(topic, id, (ws) => {
                        ws.send(subResStr);
                    });
                }
                break;
            case "sub":
                {
                    const { topic, id } = req.msg;
                    addSubscriber(topic, id, ws);
                }
                break;
            case "unsub":
                res.error = "unsub is not impl yet";
                break;
            case "list":
                {
                    const topic = req.msg.topic;
                    const storage = schemas.get(topic);
                    if (!storage) {
                        res.error = `schema for topic was not found`;
                        break;
                    }
                    const list = {};
                    storage.instances.forEach((v, k) => {
                        list[k] = v;
                    });
                    res.response.list = list;
                }
                break;
        }
        let str = JSON.stringify(res);
        ws.send(str);
    };
    wss.on("request", (req) => {
        if (!originIsAllowed(req.origin)) {
            req.reject();
            console.warn("Rejected WS");
            return;
        }
        const ws = req.accept(undefined, req.origin);
        wsList.add(ws);
        ws.on("close", (code, desc) => {
            wsList.delete(ws);
        });
        ws.on("message", (data) => {
            onWebSocketMessage(ws, data);
        });
    });
    console.log(`pubmarine server is running @ ${hostname}:${port}`);
}
main();
