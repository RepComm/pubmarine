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
        const topicSubs = this.topicSubsGetOrCreate(topic);
        let list = id === undefined ?
            topicSubs.cbs :
            this.instanceSubsListGetOrCreate(topicSubs, id);
        for (const _cb of list) {
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
                    // console.log("WSS sent response", json);
                    //we probably used it for storing a resolver
                    if (json.response.type === "sub-res") {
                        this.walkSubscribers(json.response.topic, json.response.id, (_cb) => {
                            _cb(json.response.id, json.response.change);
                        });
                        return;
                    }
                    const _resolve = this.responseResolvers.get(json.id);
                    if (_resolve) {
                        //if we did, json.response is our answer and we stop listening
                        this.responseResolvers.delete(json.id);
                        _resolve(json.response);
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
            this.responseResolvers.set(data.id, _resolve);
            this.ws.send(str);
        });
    }
    async authenticate(req) {
        const res = await this.sendMessage("auth", req);
        this.auth = res;
        return res;
    }
    subscribe(topic, cb) {
        let cfg = topic;
        if (typeof (topic) === "string") {
            // cfg.onlyDeliverDeltas = false;
        }
        else {
            cfg = topic;
            topic = cfg.topic;
        }
        this.addSubscriber(topic, cfg.id, cb);
        return this.sendMessage("sub", cfg);
    }
    unsubscribe(topic) {
        return this.sendMessage("unsub", { topic });
    }
    createSchema(topic, shape) {
        return this.sendMessage("schema-set", { topic, shape });
    }
    getSchema(topic) {
        return this.sendMessage("schema-get", { topic });
    }
    instance(topic) {
        return this.sendMessage("instance", { topic });
    }
    listInstances(topic) {
        return this.sendMessage("list", {
            topic
        });
    }
    echo(msg) {
        return this.sendMessage("echo", { msg });
    }
    mutate(topic, id, data) {
        this.sendMessage("mut", {
            topic,
            id,
            change: data
        });
    }
}
