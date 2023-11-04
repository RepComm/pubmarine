
import type { ClientAuth, ClientAuthReq, MsgReq, MsgRes, Shape, SubConfig } from "./common.d.ts";

export interface OnChange<InstanceType> {
  (data: InstanceType): void;
}

export interface Resolver<T> {
  (v: T): void;
}

export class Client {
  ws: WebSocket;
  host: string;

  auth: ClientAuth;
  authResolver: ()=>void;

  lastMessageId: number;
  generateMessageId () {
    if (!this.lastMessageId) {
      this.lastMessageId = 0;
    }
    this.lastMessageId ++;
    return this.lastMessageId;
  }
  responseResolvers: Map<number, Resolver<any>>;

  constructor (host: string) {
    this.host = host;
    this.responseResolvers = new Map();
  }
  connect (): Promise<void> {
    return new Promise((_resolve,_reject)=>{
      this.ws = new WebSocket(`ws://${this.host}`);
      this.ws.addEventListener("open", (evt)=>{
        _resolve();
        return;
      });
      this.ws.addEventListener("close", (evt)=>{
        
      });

      //listen to websocket messages from server
      this.ws.addEventListener("message", (evt)=>{
        let json: MsgRes<any>;

        try {
          json = JSON.parse(evt.data);
        } catch (ex) {
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
      this.ws.addEventListener("error", (evt)=>{
        _reject();
        return;
      });
    });
  }
  sendMessage<Result> (type: string, msg: any): Promise<Result> {
    return new Promise<Result>((_resolve, _reject)=>{
      const data = {
        type,
        msg,
        id: this.generateMessageId()
      } as MsgReq<any>;
      const str = JSON.stringify(data);

      this.responseResolvers.set(data.id, _resolve);

      this.ws.send(str);
    });
  }
  async authenticate (req: ClientAuthReq) {
    const res = await this.sendMessage<ClientAuth>("auth", req);

    this.auth = res;

    return res;
  }
  subscribe<InstanceType> (topic: string|SubConfig, cb: OnChange<InstanceType>) {
    let cfg = topic as SubConfig;
    if (typeof(topic) === "string") {
      // cfg.onlyDeliverDeltas = false;
    } else {
      cfg = topic;
      topic = cfg.topic as string;
    }
    return this.sendMessage("sub", cfg);
  }
  unsubscribe (topic: string) {
    return this.sendMessage("unsub", {topic});
  }
  createSchema (topic: string, shape: Shape) {
    return this.sendMessage("schema-set", { topic, shape });
  }
  getSchema (topic: string) {
    return this.sendMessage("schema-get", {topic});
  }
  instance (topic: string) {
    return this.sendMessage(
      "instance", {topic}
    );
  }
  listInstances (topic: string) {
    return this.sendMessage("list", {
      topic
    });
  }
  echo (msg: string) {
    return this.sendMessage("echo", {msg});
  }
  mutate (topic: string, id: string, data: any) {
    this.sendMessage("mut", {
      topic,
      id,
      change: data
    });
  }
}
