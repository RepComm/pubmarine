export class Client {
    ws;
    host;
    auth;
    authResolver;
    lastMessageId;
    generateMessageId() {
        if (!this.lastMessageId) {
            this.lastMessageId = 0;
        }
        this.lastMessageId++;
        return this.lastMessageId;
    }
    responseResolvers;
    subscriptions;
    constructor(host) {
        this.host = host;
        this.responseResolvers = new Map();
        this.subscriptions = new Map();
    }
    topicSubsGetOrCreate(topic) {
        let result = this.subscriptions.get(topic);
        if (!result) {
            result = {
                cbs: new Set(),
                instanceSubs: new Map()
            };
            this.subscriptions.set(topic, result);
        }
        return result;
    }
    instanceSubsListGetOrCreate(topicSubs, id) {
        let list = topicSubs.instanceSubs.get(id);
        if (!list) {
            list = new Set();
            topicSubs.instanceSubs.set(id, list);
        }
        return list;
    }
    addSubscriber(topic, id = undefined, cb) {
        const topicSubs = this.topicSubsGetOrCreate(topic);
        if (id !== undefined) {
            this.instanceSubsListGetOrCreate(topicSubs, id).add(cb);
        }
        else {
            topicSubs.cbs.add(cb);
        }
    }
    walkSubscribers(topic, id = undefined, cb) {
        const topicSubs = this.subscriptions.get(topic);
        if (topicSubs === undefined)
            return;
        //if walkSubscribers caller supplies an instance ID
        if (id !== undefined) {
            //try to call topic:id subscribers first if present
            const idSubs = topicSubs.instanceSubs.get(id);
            if (idSubs !== undefined) {
                for (const _cb of idSubs) {
                    cb(_cb);
                }
            }
        }
        //try to call topic:any subscribers after if present
        for (const _cb of topicSubs.cbs) {
            cb(_cb);
        }
    }
    connect() {
        return new Promise((_resolve, _reject) => {
            this.ws = new WebSocket(`ws://${this.host}`);
            this.ws.addEventListener("open", (evt) => {
                _resolve();
                return;
            });
            this.ws.addEventListener("close", (evt) => {
            });
            //listen to websocket messages from server
            this.ws.addEventListener("message", (evt) => {
                let json;
                try {
                    json = JSON.parse(evt.data);
                }
                catch (ex) {
                    console.warn(ex);
                    return;
                }
                //if json has a valid id
                if (json.id) {
                    //we probably used it for storing a resolver
                    if (json.response.type === "sub-mut") {
                        this.walkSubscribers(json.response.topic, json.response.id, (_cb) => {
                            _cb(json.response.id, json.response.change);
                        });
                        return;
                    }
                    else if (json.response.type === "sub-inst") {
                        this.walkSubscribers(json.response.topic, undefined, (_cb) => {
                            _cb(json.response.id, undefined, true);
                        });
                        return;
                    }
                    const { resolve, reject } = this.responseResolvers.get(json.id);
                    if (resolve) {
                        //if we did, json.response is our answer and we stop listening
                        this.responseResolvers.delete(json.id);
                        if (json.error) {
                            reject(json.error);
                        }
                        else {
                            resolve(json);
                        }
                    }
                }
            });
            this.ws.addEventListener("error", (evt) => {
                _reject();
                return;
            });
        });
    }
    sendMessage(type, msg) {
        return new Promise((_resolve, _reject) => {
            const data = {
                type,
                msg,
                id: this.generateMessageId()
            };
            const str = JSON.stringify(data);
            this.responseResolvers.set(data.id, {
                resolve: _resolve,
                reject: _reject
            });
            this.ws.send(str);
        });
    }
    async authenticate(req) {
        const res = await this.sendMessage("auth", req);
        this.auth = res.response;
        return res;
    }
    subscribe(topic, cb) {
        let cfg = undefined;
        if (typeof (topic) === "string") {
            cfg = {
                topic
            };
        }
        else {
            cfg = topic;
            topic = cfg.topic;
        }
        this.addSubscriber(topic, cfg.id, cb);
        console.log("[sub]", cfg);
        return this.sendMessage("sub", cfg);
    }
    unsubscribe(topic) {
        return this.sendMessage("unsub", { topic });
    }
    createSchema(topic, shape) {
        console.log("[schema] creating", topic);
        return this.sendMessage("schema-set", { topic, shape });
    }
    getSchema(topic) {
        return this.sendMessage("schema-get", { topic });
    }
    hasSchema(topic) {
        console.log("[schema] check exists", topic);
        return new Promise(async (resolve, reject) => {
            try {
                await this.getSchema(topic);
            }
            catch (reason) {
                resolve(false);
            }
            resolve(true);
        });
    }
    instance(topic) {
        console.log("[schema] instance", topic);
        return this.sendMessage("instance", { topic });
    }
    listInstances(topic) {
        console.log("[schema] list", topic);
        return this.sendMessage("list", {
            topic
        });
    }
    echo(msg) {
        return this.sendMessage("echo", { msg });
    }
    mutate(topic, id, data) {
        return this.sendMessage("mut", {
            topic,
            id,
            change: data
        });
    }
}
