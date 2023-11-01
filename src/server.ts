
import { createServer } from "http";
import type { Server as HttpServer } from "http";

import { server as WebSocketServer } from "websocket";
import type { Message, connection } from "websocket";

function originIsAllowed (origin: string) {
  return true;
}

async function main () {
  let httpServer: HttpServer;

  httpServer = createServer((req, res)=>{

  });

  let wss = new WebSocketServer({
    httpServer,
    autoAcceptConnections: false
  });

  const wsList = new Set<connection>();

  const onWebSocketMessage = (ws: connection, msg: Message)=>{

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
}

main();
