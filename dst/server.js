import { createServer } from "http";
import serveHandler from "serve-handler";
import { server as WebSocketServer } from "websocket";
function originIsAllowed(origin) {
    return true;
}
async function main() {
    let hostname = "localhost";
    let port = 10209;
    let httpServer;
    httpServer = createServer((req, res) => {
        console.log(req.url);
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
            console.log("Added sub", topic, id, ws.remoteAddress);
        }
        else {
            storage.topicSubscribers.add(ws);
            console.log("Added sub", topic, ws.remoteAddress);
        }
    }
    function walkSubscribers(topic, id = undefined, cb) {
        const storage = subStorageGetOrCreate(topic);
        let list = id === undefined ?
            storage.topicSubscribers :
            idSubsListGetOrCreate(storage, id);
        for (const ws of list) {
            cb(ws);
        }
    }
    const onWebSocketMessage = (ws, msg) => {
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
                res.error = "Not impl yet";
                break;
            case "schema-set":
                {
                    let { topic, shape } = req.msg;
                    if (schemas.has(topic)) {
                        res.error = `Invalid auth to create schema`;
                    }
                    else {
                        console.log("schema-set", topic);
                        schemas.set(topic, {
                            shape,
                            instances: new Map()
                        });
                    }
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
                    // console.log("instance", instanceId);
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
                    // console.log("received mutate", change);
                    const subResStr = JSON.stringify(subRes);
                    walkSubscribers(topic, id, (ws) => {
                        ws.send(subResStr);
                        // console.log("Send mut to", subResStr, ws.remoteAddress);
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
                res.error = "Not impl yet";
                break;
            case "list":
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
