
import type { connection } from "websocket";
import { RemoteInfo, Socket, SocketType, createSocket as createUdpSocket } from "dgram";
import type { MsgReq, MsgRes, MutateReq, SchemaCreateReq, Shape, SubConfig } from "./common";
import { Server as HttpServer } from "http";
import { server as WebSocketServer } from "websocket";

createUdpSocket("udp4")

export class Client<ConnType> {
  service: Service<ConnType>;
  connection: ConnType;
  constructor (service: Service<ConnType>, conn: ConnType) {
    this.connection = conn;
    this.service = service;
  }
  send (msg: MsgRes<any>) {
    this.service.send(this, msg);
  }
}

interface SubStorage {
  topicSubscribers: Set<Client<any>>;
  idSubScribers: Map<string, Set<Client<any>>>;
}
export type Subscriptions = Map<string, SubStorage>;

export interface ServiceListenResult {

}

export type ClientId = any;

export class Service<ConnType> {
  clients: Map<ClientId,Client<any>>;
  services: Services;

  constructor (services: Services) {
    this.clients = new Map();
    this.services = services;
  }
  addClient () {

  }
  listen (address: string, port: number): Promise<ServiceListenResult> {
    return new Promise((_, reject)=>{
      reject(`Base class Service does not implement listen and should not be called. Please extend Service and implement listen() and call that instead`);
    });
  }
  handleError(ex: any) {
    return this.services.handleError(ex);
  }
  handleMsgReqFromClient (client: Client<any>, msg: MsgReq<any>) {
    return this.services.handleMsgReqFromClient(client, msg);
  }
  protected sendString (to: Client<any>, msg: string) {
    throw `Base class Service does not implement send and should not be called. Please extend Service and implement send() and call that instead`;
  }
  send (to: Client<any>, msg: MsgRes<any>) {
    const str = JSON.stringify(msg);
    this.sendString(to, str);
  }
  getOrCreateClient<ConnType> (clientId: ConnType): Client<ConnType> {
    let result = this.clients.get(clientId);
    if (result === undefined) {
      result = new Client<ConnType>(this, clientId);
      this.clients.set(clientId, result);
    }
    return result;
  }
  removeClient<ConnType> (clientId: ConnType) {
    this.clients.delete(clientId);
  }
}


interface DataStorage {
  shape: Shape;
  instances: Map<string, any>;
}


export interface AuthFunc {
  (msg: MsgReq<any>): Promise<string>;
}

export class Services {
  services: Set<Service<any>>;
  subscriptions: Subscriptions;
  authFunc: AuthFunc;
  schemas: Map<string, DataStorage>;

  constructor (authFunc: AuthFunc) {
    this.services = new Set();
    this.subscriptions = new Map<string, SubStorage>();
    this.authFunc = authFunc;
    this.schemas = new Map<string, DataStorage>();
  }
  setAuthFunc (authFunc: AuthFunc) {
    this.authFunc = authFunc;
  }
  addService (s: Service<any>) {
    this.services.add(s);
  }
  listen (hostname: string, startPort: number) {
    let port = startPort;
    for (const s of this.services) {
      port ++;
      s.listen(hostname, port);
    }
  }

  subStorageGetOrCreate(topic: string): SubStorage {
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
  idSubsListGetOrCreate(storage: SubStorage, id: string) {
    let list = storage.idSubScribers.get(id);
    if (!list) {
      list = new Set();
      storage.idSubScribers.set(id, list);
    }
    return list;
  }
  addSubscriber(topic: string, id: string = undefined, c: Client<any>) {
    const storage = this.subStorageGetOrCreate(topic);

    if (id !== undefined) {
      this.idSubsListGetOrCreate(storage, id).add(c);
      console.log(`[sub] ${topic}:${id} -> client`);
    } else {
      storage.topicSubscribers.add(c);
      console.log(`[sub] ${topic} -> client`);
    }
  }
  walkSubscribers(topic: string, id: string = undefined, cb: (client: Client<any>) => void) {
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
  async handleMsgReqFromClient (c: Client<any>, req: MsgReq<any>) {
    let res: MsgRes<any> = {
      id: req.id,
      response: {
        type: req.type
      }
    };

    switch (req.type) {
      case "auth": {
        let id: string;
        try {
          id = await this.authFunc(req);
        } catch (ex) {
          res.error = ex;
        }
        res.response.id = id;
      } break;
      case "schema-set": {
        let { topic, shape } = (req as SchemaCreateReq).msg;

        if (this.schemas.has(topic)) {
          res.error = `Invalid auth to create schema`;
        } else {
          console.log(`[schema] created "${topic}"`);
          this.schemas.set(topic, {
            shape,
            instances: new Map()
          });
        }
      } break;
      case "schema-get": {
        let { topic } = (req as SchemaCreateReq).msg;
        const schema = this.schemas.get(topic);
        if (!schema) {
          res.error = "no schema for topic";
          break;
        }
        res.response.shape = schema.shape;
      } break;
      case "instance": {
        const topic = (req.msg as { topic: string }).topic;
        const storage = this.schemas.get(topic);

        if (!storage) {
          res.error = `schema for topic was not found`;
          break;
        }

        const instanceId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString();
        res.response.id = instanceId;

        storage.instances.set(
          instanceId, {}
        );

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
        } as MsgRes<any>;

        // const subInstResStr = JSON.stringify(subInstRes);

        console.log(`[schema] instanced "${topic}:${instanceId}"`);

        this.walkSubscribers(topic, undefined, (c) => {
          // ws.send(subInstResStr);
          c.send(subInstRes);
        });

      } break;
      case "mut": {
        const { topic, id, change } = (req as MutateReq).msg;
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
          } else {
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
        } as MsgRes<any>;

        // const subMutResStr = JSON.stringify(subMutRes);

        this.walkSubscribers(topic, id, (ws) => {
          // console.log("[sub] mutate -> client");
          // ws.send(subMutResStr);
          ws.send(subMutRes);
        });

      } break;
      case "sub": {
        const { topic, id } = (req as MsgReq<SubConfig>).msg;
        this.addSubscriber(topic, id, c);
      } break;
      case "unsub":
        res.error = "unsub is not impl yet";
        break;
      case "list": {
        const topic = (req.msg as { topic: string }).topic;
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
      } break;
    }
    // let str = JSON.stringify(res);
    // c.send(str);
    c.send(res);
  };
  handleError(ex: any) {
    console.warn("Error from service", ex);
  }
}

export class UdpService extends Service<RemoteInfo> {
  serverSocket: Socket;
  constructor (services: Services, udpVersion: SocketType = "udp4") {
    super(services);
    this.serverSocket = createUdpSocket(udpVersion);
    this.serverSocket.on("error", (err)=>{
      this.handleError(err);
    });
    
    function dgramRemoteInfoToClientId (remoteInfo: RemoteInfo): string {
      return `udp@${remoteInfo.address}:${remoteInfo.port}`;
    }

    this.serverSocket.on("message", (buffer, remoteInfo)=>{
      let msgStr: string;
      let msg: MsgReq<any>;
      try {
        msgStr = buffer.toString("utf-8");
      } catch (ex) {
        this.handleError("UdpService couldn't decode msg from client as utf-8 string");
        return;
      }
      try {
        msg = JSON.parse(msgStr);
      } catch (ex) {
        this.handleError("UdpService couldn't decode msg from client as JSON");
        return;
      }
      if (typeof(msg.id) !== "number") {
        this.handleError("UdpService received valid JSON from client, but msg.id was not a number type. This is not a correct MsgReq and will not be handled");
        return;
      }

      const id = dgramRemoteInfoToClientId(remoteInfo);
      const client = this.getOrCreateClient(id);

      this.handleMsgReqFromClient(client, msg);
    });
  }
  sendString (to: Client<RemoteInfo>, msg: string) {
    this.serverSocket.send(msg, to.connection.port, to.connection.address);
  }
  listen (address: string, port: number) {
    return new Promise(async (resolve, reject)=>{
      this.serverSocket.bind(port, address, ()=>{
        resolve({});
      });
    });
  }
}

export interface WSSOriginAllowed {
  (origin: string): boolean;
}
export class WebSocketService extends Service<connection> {
  wss: WebSocketServer;

  constructor (services: Services, httpServer: HttpServer, isOriginAllowed: WSSOriginAllowed) {
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
          let msg: MsgReq<any>;
          try {
            msg = JSON.parse(data.utf8Data);
          } catch (ex) {
            this.handleError(ex);
            return;
          }
          this.handleMsgReqFromClient(client, msg);
        }
      });
      
      ws.on("error", (ex)=>{
        this.handleError(ex);
      })
    });
  }
  sendString(to: Client<connection>, msg: string): void {
    to.connection.send(msg);
  }
  listen (address: string, port: number) {
    return Promise.resolve({});
  }
}
