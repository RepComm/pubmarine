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
    constructor(host) {
        this.host = host;
        this.responseResolvers = new Map();
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
                    console.log("WSS sent response", json);
                    //we probably used it for storing a resolver
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
            cfg.onlyDeliverDeltas = false;
        }
        else {
            cfg = topic;
            topic = cfg.topic;
        }
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
    echo(msg) {
        return this.sendMessage("echo", { msg });
    }
    mutate(id, data) {
        this.sendMessage("mut", { change: data });
    }
}
