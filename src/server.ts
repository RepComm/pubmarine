
import { createServer } from "http";
import type { Server as HttpServer } from "http";
import { hostname } from "os";

import { server as WebSocketServer } from "websocket";
import type { Message, connection } from "websocket";
import { MsgReq, MsgRes } from "./common";

function originIsAllowed (origin: string) {
  return true;
}

async function main () {
  let hostname = "localhost";
  let port = 10209;

  let httpServer: HttpServer;

  httpServer = createServer((req, res)=>{
    console.log(req.url);
    res.writeHead(200, "success", {
      "Content-Type": "application/json"
    });
    const msg = JSON.stringify({
      status: "Success",
      msg: `You tried to visit ${req.url}`
    })
    res.write(msg);
    res.end();
  });

  httpServer.listen(port, hostname);

  let wss = new WebSocketServer({
    httpServer,
    autoAcceptConnections: false
  });

  const wsList = new Set<connection>();

  const onWebSocketMessage = (ws: connection, msg: Message)=>{
    if (msg.type !=="utf8") return;
    const content = msg.utf8Data
    console.log("ws sent", content);

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
