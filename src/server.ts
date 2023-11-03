
import { createServer } from "http";
import type { Server as HttpServer } from "http";
import serveHandler from "serve-handler";

import { server as WebSocketServer } from "websocket";
import type { Message, connection } from "websocket";
import { MsgReq, MsgRes, SchemaCreateReq, Shape } from "./common";

function originIsAllowed (origin: string) {
  return true;
}

async function main () {
  let hostname = "localhost";
  let port = 10209;

  let httpServer: HttpServer;

  

  httpServer = createServer((req, res)=>{
    console.log(req.url);
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

  const wsList = new Set<connection>();

  const schemas = new Map<string, Shape>();

  const onWebSocketMessage = (ws: connection, msg: Message)=>{
    if (msg.type !=="utf8") return;
    const content = msg.utf8Data
    // console.log("ws sent", content);

    let req: MsgReq<any>;
    try {
      req = JSON.parse(content);
    } catch (ex) {
      console.warn("Couldn't parse json from WS", ex);
      return;
    }
    let res: MsgRes<any> = {
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
        let { topic, shape } = (req as SchemaCreateReq).msg;

        if (schemas.has(topic)) {
          res.error = `Invalid auth to create schema`;
        } else {
          console.log("schema-set", topic);
          schemas.set(topic, shape);
        }
        break;
      case "instance":
        let _topic = (req.msg as {topic: string}).topic;
        if (schemas.has(_topic)) {
          res.response.id = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString();
          console.log("instance", res.response.id);
        } else {
          res.error = `Schema by id ${_topic} was not found`;
        }
        break;
      case "mut":
        console.log("mut", req.msg.id, req.msg.change);
        res.error = "Not impl yet";
        break;
      case "sub":
        res.error = "Not impl yet";
        break;
      case "unsub":
        res.error = "Not impl yet";
        break;
    }
    let str = JSON.stringify(res);
    ws.send(str);
  };

  wss.on("request", (req)=>{
    if (!originIsAllowed(req.origin)) {
      req.reject();
      console.warn("Rejected WS");
      return;
    }

    const ws = req.accept(undefined, req.origin);
    wsList.add(ws);

    ws.on("close", (code, desc)=>{
      wsList.delete(ws);
    });

    ws.on("message", (data)=>{
      onWebSocketMessage(ws, data);
    });

  });  

  console.log(`pubmarine server is running @ ${hostname}:${port}`);
}

main();
