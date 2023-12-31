#!/usr/bin/env node

import { createServer } from "http";
import type { Server as HttpServer } from "http";
import serveHandler from "serve-handler";

// import { server as WebSocketServer } from "websocket";
// import { Message, connection } from "websocket";
// import { MsgReq, MsgRes, MutateReq, SchemaCreateReq, Shape, SubConfig } from "./common";
import { watchFile } from "fs";
import { join as pathJoin } from "path";

import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Services, UdpService, WebSocketService } from "./service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function originIsAllowed(origin: string) {
  return true;
}

// interface DataStorage {
//   shape: Shape;
//   instances: Map<string, any>;
// }

// interface SubStorage {
//   topicSubscribers: Set<connection>;
//   idSubScribers: Map<string, Set<connection>>;
// }

async function main() {
  let hostname = "0.0.0.0";
  let port = 10209;

  let httpServer: HttpServer;

  const dstPath = __dirname;

  const authJsPath = pathJoin(__dirname, "./auth.js");

  async function loadAuthFunc() {
    //call with current date time so caching is ignored
    const mod = await import(`${authJsPath}?${Date.now()}`);
    return mod.auth;
  }

  httpServer = createServer((req, res) => {
    // console.log(req.url);
    if (req.url.startsWith("/api")) {
      res.writeHead(200, "success", {
        "Content-Type": "application/json"
      });
      const msg = JSON.stringify({
        status: "Success",
        msg: `You tried to visit ${req.url}`
      })
      res.write(msg);
      res.end();
    } else {
      serveHandler(req, res, {
        cleanUrls: true,
        directoryListing: false,
        public: dstPath,
        symlinks: false
      });
    }
  });

  httpServer.listen(port, hostname);

  let authFunc = await loadAuthFunc();
  const services = new Services(authFunc);

  watchFile(authJsPath, {
    persistent: true,
    interval: 4000
  }, async (curr, prev) => {
    try {
      console.log("Detected changes to auth.js Reloading auth() from auth.js");
      authFunc = await loadAuthFunc();
      services.setAuthFunc(authFunc);
    } catch (ex) {
      console.warn(ex);
    }
  });

  services.addService(new UdpService(services, "udp4"));
  services.addService(new WebSocketService(services, httpServer, originIsAllowed));

  const startPort = port + 1;
  services.listen(hostname, startPort);

  // let wss = new WebSocketServer({
  //   httpServer,
  //   autoAcceptConnections: false
  // });

  // const wsList = new Set<connection>();

  // const schemas = new Map<string, DataStorage>();

  // const subscriptions = new Map<string, SubStorage>();

  // function subStorageGetOrCreate(topic: string): SubStorage {
  //   let result = subscriptions.get(topic);
  //   if (!result) {
  //     result = {
  //       topicSubscribers: new Set(),
  //       idSubScribers: new Map()
  //     };
  //     subscriptions.set(topic, result);
  //   }
  //   return result;
  // }

  // function idSubsListGetOrCreate(storage: SubStorage, id: string) {
  //   let list = storage.idSubScribers.get(id);
  //   if (!list) {
  //     list = new Set();
  //     storage.idSubScribers.set(id, list);
  //   }
  //   return list;
  // }

  // function addSubscriber(topic: string, id: string = undefined, ws: connection) {
  //   const storage = subStorageGetOrCreate(topic);

  //   if (id !== undefined) {
  //     idSubsListGetOrCreate(storage, id).add(ws);
  //     console.log(`[sub] ${topic}:${id} -> client`);
  //   } else {
  //     storage.topicSubscribers.add(ws);
  //     console.log(`[sub] ${topic} -> client`);
  //   }
  // }

  // function walkSubscribers(topic: string, id: string = undefined, cb: (ws: connection) => void) {
  //   const storage = subStorageGetOrCreate(topic);

  //   //call ID specific listeners first if present
  //   if (id !== undefined) {
  //     const idSubs = storage.idSubScribers.get(id);
  //     if (idSubs) {
  //       for (const ws of idSubs) {
  //         cb(ws);
  //       }
  //     }
  //   }

  //   //call topic subscribers always if present
  //   for (const ws of storage.topicSubscribers) {
  //     cb(ws);
  //   }
  // }

  // const onWebSocketMessage = async (ws: connection, msg: Message) => {
  //   if (msg.type !== "utf8") return;
  //   const content = msg.utf8Data
  //   let req: MsgReq<any>;
  //   try {
  //     req = JSON.parse(content);
  //   } catch (ex) {
  //     console.warn("Couldn't parse json from WS", ex);
  //     return;
  //   }
  //   let res: MsgRes<any> = {
  //     id: req.id,
  //     response: {
  //       type: req.type
  //     }
  //   };

  //   switch (req.type) {
  //     case "auth": {
  //       let id: string;
  //       try {
  //         id = await authFunc(req);
  //       } catch (ex) {
  //         res.error = ex;
  //       }
  //       res.response.id = id;
  //     } break;
  //     case "schema-set": {
  //       let { topic, shape } = (req as SchemaCreateReq).msg;

  //       if (schemas.has(topic)) {
  //         res.error = `Invalid auth to create schema`;
  //       } else {
  //         console.log(`[schema] created "${topic}"`);
  //         schemas.set(topic, {
  //           shape,
  //           instances: new Map()
  //         });
  //       }
  //     } break;
  //     case "schema-get": {
  //       let { topic } = (req as SchemaCreateReq).msg;
  //       const schema = schemas.get(topic);
  //       if (!schema) {
  //         res.error = "no schema for topic";
  //         break;
  //       }
  //       res.response.shape = schema.shape;
  //     } break;
  //     case "instance": {
  //       const topic = (req.msg as { topic: string }).topic;
  //       const storage = schemas.get(topic);

  //       if (!storage) {
  //         res.error = `schema for topic was not found`;
  //         break;
  //       }

  //       const instanceId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString();
  //       res.response.id = instanceId;

  //       storage.instances.set(
  //         instanceId, {}
  //       );

  //       /**create a message to send to topic subscribers
  //        * to let them know a new instance exists
  //        */
  //       const subInstRes = {
  //         response: {
  //           type: "sub-inst",
  //           topic,
  //           id: instanceId
  //         },
  //         id: -1
  //       } as MsgRes<any>;

  //       const subInstResStr = JSON.stringify(subInstRes);

  //       console.log(`[schema] instanced "${topic}:${instanceId}"`);

  //       walkSubscribers(topic, undefined, (ws) => {
  //         ws.send(subInstResStr);
  //       });

  //     } break;
  //     case "mut": {
  //       const { topic, id, change } = (req as MutateReq).msg;
  //       // console.log("mut", req);
  //       if (!topic) {
  //         res.error = "missing req.msg.topic, cannot mutate record";
  //         break;
  //       }
  //       if (!id) {
  //         res.error = "missing req.msg.id, cannot mutate record";
  //         break;
  //       }
  //       if (!change) {
  //         res.error = "missing req.msg.change, cannot mutate record";
  //         break;
  //       }
  //       const storage = schemas.get(topic);
  //       if (!storage) {
  //         res.error = "No schema found by topic";
  //         break;
  //       }
  //       const old = storage.instances.get(id);
  //       //TODO - allow to ignore actually changed data propagation
  //       //essentially allow clients to "update" when the data may be completely similar
  //       //would be faster but sacrifice network bandwidth in some cases

  //       for (const key in change) {
  //         const isChanged = old[key] !== change[key];
  //         if (isChanged) {
  //           old[key] = change[key];
  //         } else {
  //           change[key] = undefined;
  //           delete change[key];
  //         }
  //       }

  //       const subMutRes = {
  //         response: {
  //           type: "sub-mut",
  //           topic, id, change
  //         },
  //         id: -1
  //       } as MsgRes<any>;

  //       const subMutResStr = JSON.stringify(subMutRes);

  //       walkSubscribers(topic, id, (ws) => {
  //         // console.log("[sub] mutate -> client");
  //         ws.send(subMutResStr);
  //       });

  //     } break;
  //     case "sub": {
  //       const { topic, id } = (req as MsgReq<SubConfig>).msg;
  //       addSubscriber(topic, id, ws);
  //     } break;
  //     case "unsub":
  //       res.error = "unsub is not impl yet";
  //       break;
  //     case "list": {
  //       const topic = (req.msg as { topic: string }).topic;
  //       const storage = schemas.get(topic);

  //       if (!storage) {
  //         res.error = `schema for topic was not found`;
  //         break;
  //       }
  //       const list = {};
  //       storage.instances.forEach((v, k) => {
  //         list[k] = v;
  //       });
  //       res.response.list = list;
  //     } break;
  //   }
  //   let str = JSON.stringify(res);
  //   ws.send(str);
  // };

  // wss.on("request", (req) => {
  //   if (!originIsAllowed(req.origin)) {
  //     req.reject();
  //     console.warn("Rejected WS");
  //     return;
  //   }

  //   const ws = req.accept(undefined, req.origin);
  //   wsList.add(ws);

  //   ws.on("close", (code, desc) => {
  //     wsList.delete(ws);
  //   });

  //   ws.on("message", (data) => {
  //     onWebSocketMessage(ws, data);
  //   });

  // });

  console.log(`pubmarine server is running @ ${hostname}:${port}`);
}

try {
  main();
} catch (ex) {
  console.warn(ex);
}
