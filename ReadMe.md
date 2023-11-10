# pubmarine
publish/subscribe over websockets and UDP

### WARNING: NOT PRODUCTION READY - RUN AT OWN RISK - API SUBJECT TO CHANGE

At one point I wanted to create a big fancy realtime decentralized database, but now I realize the scope is too big.

I really need a pubish/subscribe networking lib for browser/node/lua, so this is it.

![img](./example.gif)

## implemented
- pubmarine node.js server
  - $ `npm i -g @repcomm/pubmarine`
  - $ `pubmarine`
- web client
  - $ `npm i @repcomm/pubmarine`
  - subscribe , mutate, listInstances, instance
- lua client (currently married to minetest API, will be resolved soon)
  - subscribe , mutate, instance

## requirements
 - pubmarine server tested using `node -v` -> v20.6.0
 - pubmarine ts/js client uses features:
   - Set
   - Map
   - WebSocket
   - class
   - ES module import/export
 - pubmarine minetest tested using:
   - minetest 5.7.0 (Linux)
   - LuaJIT 2.1.0-beta3
   - Release Mode
   - luasocket from:
     - ubuntu: `apt install lua5.1-sockets`
     - fedora: `dnf install lua5.1-sockets`


## usage
### web
See [test.ts](./src/test.ts) and [test.html](./dst/test.html)
<details>
<summary>Example</summary>

```ts
  import { Client } from "@repcomm/pubmarine";

  //create a client that should connect to a server
  const client = new Client(window.location.host);

  //wait for connection
  await client.connect();

  //you can impl your own auth model (or none)
  const auth = { apiKey: "blah" };
  //wait for authentication
  await client.authenticate(auth);

  //check if player schema exists yet
  if(!await client.hasSchema("players")) {

    //if it doesn't, try to create it
    await client.createSchema("players", {
      type: "dict",
      children: {
        "x": { type: "number" },
        "y": { type: "number" },
        "name": { type: "string" }
      }
    });
  }

  await client.subscribe("players",(instanceId, updateData, isNewInstance)=>{
    //fired for instantiations and mutations of all players
  });
  
  //create an instance of player on the server
  const localId = (await client.instance("players")).response.id;
  
  //subscribe to mutations on only it
  await client.subscribe({
      topic: "players",
      id: localId
    }, ( id, updateData, isNewInstance)=>{

    //fired for mutations of our own player instance
  });

  //publish a change to our player data
  //any chance you make is pushed to subscribers
  await client.mutate("players", localId, {
    name: prompt("Enter player name", "testbot"),
    x: 0.5,
    y: 0.5
  });
```
</details>

### minetest lua
See [mt_pubmarine/init.lua](./mt_pubmarine/init.lua)

## authentication
No security so far, this is one of the last TODOs for MVP

```ts
// TS/JS client side
async client.authenticate( a: ClientAuthReq )
```

`auth.js` is responsible for authenticating a client
```ts
import type { MsgReq } from "./common";

//server side
export async function auth (msg: MsgReq<ClientAuthReq>): Promise<string> {

  //generate a random int as the client's ID
  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString();
}
```

`auth.js` is monitored for changes and will be reloaded when ./dst/auth.js is mutated on the disk.

In the future, I will add a basic pocketbase authentication example.

`ClientAuthReq` can be an object of any shape, the only places it is used are in the above files.

Essentially to add in your own auth model simply change `auth.js` (auth.ts in the source of this repo compiles to it), and pass the correct shape to `client.authenticate( v )`
