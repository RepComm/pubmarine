
import type { ClientAuthRes, ClientAuthReq, MsgReq, MsgRes, MsgResResponse, Shape, SubConfig, SchemaGetRes, InstanceReq, InstanceRes, ListInstancesRes } from "./common.d.ts";

export interface OnChange<InstanceType> {
  (data: InstanceType): void;
}

export interface Resolver<T> {
  (v: T): void;
}
export interface ResolveReject<T> {
  resolve: Resolver<T>;
  reject: (reason?: any)=> void;
}

export interface SubCb<T> {
  (id: string, change: T): void;
}
export type TopicId = string;
export type InstanceId = string;
export type InstanceSubs = Map<InstanceId, Set<SubCb<any>>>;

export interface TopicSubs {
  cbs: Set<SubCb<any>>;
  instanceSubs: InstanceSubs;
}

export class Client {
  ws: WebSocket;
  host: string;

  auth: ClientAuthRes;
  authResolver: ()=>void;

  lastMessageId: number;
  generateMessageId () {
    if (!this.lastMessageId) {
      this.lastMessageId = 0;
    }
    this.lastMessageId ++;
    return this.lastMessageId;
  }
  responseResolvers: Map<number, ResolveReject<MsgRes<any>>>;

  subscriptions: Map<TopicId, TopicSubs>;

  constructor (host: string) {
    this.host = host;
    this.responseResolvers = new Map();
    this.subscriptions = new Map();
  }
  topicSubsGetOrCreate (topic: string): TopicSubs {
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

  instanceSubsListGetOrCreate (
    topicSubs: TopicSubs, 
    id: string
    ) {
    let list = topicSubs.instanceSubs.get(id);
    if (!list) {
      list = new Set<any>();
      topicSubs.instanceSubs.set(id, list);
    }
    return list;
  }

  addSubscriber<T>(topic: string, id: string = undefined, cb: SubCb<T>) {
    const topicSubs = this.topicSubsGetOrCreate(topic);
    if (id !== undefined) {
      this.instanceSubsListGetOrCreate(
        topicSubs, id
      ).add(cb);
    } else {
      topicSubs.cbs.add(cb);
    }
  }

  walkSubscribers<T> (
    topic: string,
    id: string = undefined,
    cb: (_cb: SubCb<T>)=> void) {
    const topicSubs = this.topicSubsGetOrCreate(topic);
    let list = id===undefined ?
      topicSubs.cbs :
      this.instanceSubsListGetOrCreate(topicSubs, id);

    for (const _cb of list) {
      cb(_cb);
    }
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
          // console.log("WSS sent response", json);
          //we probably used it for storing a resolver
          
          if (json.response.type === "sub-res") {
            this.walkSubscribers(
              json.response.topic,
              json.response.id,
              (_cb)=>{
                _cb(json.response.id, json.response.change);
              }
            );
            return;
          }

          const {resolve, reject} = this.responseResolvers.get(json.id);
          if (resolve) {
            //if we did, json.response is our answer and we stop listening
            this.responseResolvers.delete(json.id);
            if (json.error) {
              reject(json.error);
            } else {
              resolve(json);
            }
          }
        }
      });
      this.ws.addEventListener("error", (evt)=>{
        _reject();
        return;
      });
    });
  }
  sendMessage<Response extends MsgResResponse> (type: string, msg: any) {
    return new Promise<MsgRes<Response>>((_resolve, _reject)=>{
      const data = {
        type,
        msg,
        id: this.generateMessageId()
      } as MsgReq<any>;
      const str = JSON.stringify(data);

      this.responseResolvers.set(data.id, {
        resolve: _resolve,
        reject: _reject
      });

      this.ws.send(str);
    });
  }
  async authenticate (req: ClientAuthReq) {
    const res = await this.sendMessage<ClientAuthRes>("auth", req);

    this.auth = res.response;

    return res;
  }
  subscribe<InstanceType> (topic: string|SubConfig, cb: SubCb<InstanceType>) {
    let cfg = topic as SubConfig;
    if (typeof(topic) === "string") {
      // cfg.onlyDeliverDeltas = false;
    } else {
      cfg = topic;
      topic = cfg.topic as string;
    }
    this.addSubscriber(topic, cfg.id, cb as any);
    return this.sendMessage("sub", cfg);
  }
  unsubscribe (topic: string) {
    return this.sendMessage("unsub", {topic});
  }
  createSchema (topic: string, shape: Shape) {
    return this.sendMessage("schema-set", { topic, shape });
  }
  getSchema (topic: string) {
    return this.sendMessage<SchemaGetRes>("schema-get", {topic});
  }
  hasSchema (topic: string) {
    return new Promise<boolean>(async (resolve, reject)=>{
      try {
        await this.getSchema(topic);
      } catch (reason) {
        resolve(false);
      }
      resolve(true);
    });
  }
  instance (topic: string) {
    return this.sendMessage<InstanceRes>(
      "instance", {topic}
    );
  }
  listInstances<T> (topic: string) {
    return this.sendMessage<ListInstancesRes<T>>("list", {
      topic
    });
  }
  echo (msg: string) {
    return this.sendMessage("echo", {msg});
  }
  mutate (topic: string, id: string, data: any) {
    return this.sendMessage("mut", {
      topic,
      id,
      change: data
    });
  }
}
