import { createSocket as createUdpSocket } from "dgram";
import { server as WebSocketServer } from "websocket";
createUdpSocket("udp4");
export class Client {
    service;
    connection;
    constructor(service, conn) {
        this.connection = conn;
        this.service = service;
    }
    send(msg) {
        this.service.send(this, msg);
    }
}
export class Service {
    clients;
    services;
    constructor(services) {
        this.clients = new Map();
        this.services = services;
    }
    addClient() {
    }
    listen(address, port) {
        return new Promise((_, reject) => {
            reject(`Base class Service does not implement listen and should not be called. Please extend Service and implement listen() and call that instead`);
        });
    }
    handleError(ex) {
        return this.services.handleError(ex);
    }
    handleMsgReqFromClient(client, msg) {
        return this.services.handleMsgReqFromClient(client, msg);
    }
    sendString(to, msg) {
        throw `Base class Service does not implement send and should not be called. Please extend Service and implement send() and call that instead`;
    }
    send(to, msg) {
        const str = JSON.stringify(msg);
        this.sendString(to, str);
    }
    getOrCreateClient(clientId, clientConn = undefined) {
        let result = this.clients.get(clientId);
        if (result === undefined) {
            result = new Client(this, clientConn || clientId);
            this.clients.set(clientId, result);
        }
        return result;
    }
    removeClient(clientId) {
        this.clients.delete(clientId);
    }
}
export class Services {
    services;
    subscriptions;
    authFunc;
    schemas;
    constructor(authFunc) {
        this.services = new Set();
        this.subscriptions = new Map();
        this.authFunc = authFunc;
        this.schemas = new Map();
    }
    setAuthFunc(authFunc) {
        this.authFunc = authFunc;
    }
    addService(s) {
        this.services.add(s);
    }
    listen(hostname, startPort) {
        let port = startPort;
        for (const s of this.services) {
            port++;
            s.listen(hostname, port);
        }
    }
    subStorageGetOrCreate(topic) {
        let result = this.subscriptions.get(topic);
        if (!result) {
            result = {
                topicSubscribers: new Set(),
                idSubScribers: new Map()
            };
            this.subscriptions.set(topic, result);
        }
        return result;
    }
    idSubsListGetOrCreate(storage, id) {
        let list = storage.idSubScribers.get(id);
        if (!list) {
            list = new Set();
            storage.idSubScribers.set(id, list);
        }
        return list;
    }
    addSubscriber(topic, id = undefined, c) {
        const storage = this.subStorageGetOrCreate(topic);
        if (id !== undefined) {
            this.idSubsListGetOrCreate(storage, id).add(c);
            console.log(`[sub] ${topic}:${id} -> client`);
        }
        else {
            storage.topicSubscribers.add(c);
            console.log(`[sub] ${topic} -> client`);
        }
    }
    walkSubscribers(topic, id = undefined, cb) {
        const storage = this.subStorageGetOrCreate(topic);
        //call ID specific listeners first if present
        if (id !== undefined) {
            const idSubs = storage.idSubScribers.get(id);
            if (idSubs) {
                for (const c of idSubs) {
                    cb(c);
                }
            }
        }
        //call topic subscribers always if present
        for (const c of storage.topicSubscribers) {
            cb(c);
        }
    }
    async handleMsgReqFromClient(c, req) {
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
                        id = await this.authFunc(req);
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
                    if (this.schemas.has(topic)) {
                        res.error = `Invalid auth to create schema`;
                    }
                    else {
                        console.log(`[schema] created "${topic}"`);
                        this.schemas.set(topic, {
                            shape,
                            instances: new Map()
                        });
                    }
                }
                break;
            case "schema-get":
                {
                    let { topic } = req.msg;
                    const schema = this.schemas.get(topic);
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
                    const storage = this.schemas.get(topic);
                    if (!storage) {
                        res.error = `schema for topic was not found`;
                        break;
                    }
                    const instanceId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString();
                    res.response.id = instanceId;
                    storage.instances.set(instanceId, {});
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
                    // const subInstResStr = JSON.stringify(subInstRes);
                    console.log(`[schema] instanced "${topic}:${instanceId}"`);
                    this.walkSubscribers(topic, undefined, (c) => {
                        // ws.send(subInstResStr);
                        c.send(subInstRes);
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
                    const storage = this.schemas.get(topic);
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
                    const subMutRes = {
                        response: {
                            type: "sub-mut",
                            topic, id, change
                        },
                        id: -1
                    };
                    // const subMutResStr = JSON.stringify(subMutRes);
                    this.walkSubscribers(topic, id, (ws) => {
                        // console.log("[sub] mutate -> client");
                        // ws.send(subMutResStr);
                        ws.send(subMutRes);
                    });
                }
                break;
            case "sub":
                {
                    const { topic, id } = req.msg;
                    this.addSubscriber(topic, id, c);
                }
                break;
            case "unsub":
                res.error = "unsub is not impl yet";
                break;
            case "list":
                {
                    const topic = req.msg.topic;
                    const storage = this.schemas.get(topic);
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
        // let str = JSON.stringify(res);
        // c.send(str);
        c.send(res);
    }
    ;
    handleError(ex) {
        console.warn("Error from service", ex);
    }
}
export class UdpService extends Service {
    serverSocket;
    constructor(services, udpVersion = "udp4") {
        super(services);
        this.serverSocket = createUdpSocket(udpVersion);
        this.serverSocket.on("error", (err) => {
            this.handleError(err);
        });
        function dgramRemoteInfoToClientId(remoteInfo) {
            return `udp@${remoteInfo.address}:${remoteInfo.port}`;
        }
        this.serverSocket.on("message", (buffer, remoteInfo) => {
            let msgStr;
            let msg;
            try {
                msgStr = buffer.toString("utf-8");
            }
            catch (ex) {
                this.handleError("UdpService couldn't decode msg from client as utf-8 string");
                return;
            }
            console.log(`Client sent "${msgStr}"`);
            try {
                msg = JSON.parse(msgStr);
            }
            catch (ex) {
                this.handleError("UdpService couldn't decode msg from client as JSON");
                return;
            }
            if (typeof (msg.id) !== "number") {
                this.handleError("UdpService received valid JSON from client, but msg.id was not a number type. This is not a correct MsgReq and will not be handled");
                return;
            }
            const id = dgramRemoteInfoToClientId(remoteInfo);
            const client = this.getOrCreateClient(id, remoteInfo);
            this.handleMsgReqFromClient(client, msg);
        });
    }
    sendString(to, msg) {
        this.serverSocket.send(msg, to.connection.port, to.connection.address);
    }
    listen(address, port) {
        return new Promise(async (resolve, reject) => {
            this.serverSocket.bind(port, address, () => {
                console.log("[service] udp listen @", address, port);
                resolve({});
            });
        });
    }
}
export class WebSocketService extends Service {
    wss;
    constructor(services, httpServer, isOriginAllowed) {
        super(services);
        this.wss = new WebSocketServer({
            httpServer,
            autoAcceptConnections: false
        });
        this.wss.on("request", (req) => {
            if (!isOriginAllowed(req.origin)) {
                req.reject();
                console.warn("Rejected WS");
                return;
            }
            const ws = req.accept(undefined, req.origin);
            const client = this.getOrCreateClient(ws);
            ws.on("close", (code, desc) => {
                this.removeClient(ws);
            });
            ws.on("message", (data) => {
                if (data.type === "utf8") {
                    let msg;
                    try {
                        msg = JSON.parse(data.utf8Data);
                    }
                    catch (ex) {
                        this.handleError(ex);
                        return;
                    }
                    this.handleMsgReqFromClient(client, msg);
                }
            });
            ws.on("error", (ex) => {
                this.handleError(ex);
            });
        });
    }
    sendString(to, msg) {
        to.connection.send(msg);
    }
    listen(address, port) {
        return Promise.resolve({});
    }
}
