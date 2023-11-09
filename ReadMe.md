# pubmarine
publish/subscribe over websockets and UDP

### WARNING: NOT PRODUCTION READY - RUN AT OWN RISK

At one point I wanted to create a big fancy realtime decentralized database, but now I realize the scope is too big.

I really need a pubish/subscribe networking lib for browser/node/lua, so this is it.

## usage
### web
See [test.ts](./src/test.ts) and [test.html](./dst/test.html)

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

### minetest lua
```lua

  --create a debounce utility
  function debounce_create (timeWait)
    return {
      timeWait = timeWait,
      timeLast = 0
    }
  end

  --check a debounce obj and return true if it is a valid time to update whatever it is we want to update
  --essentially a timer that relies on an external loop to call it like minetest.register_globalstep
  function debounce_check(d)
    local timeNow = minetest.get_us_time()/1000

    local delta = timeNow - d.timeLast
    local result = false
    if delta > d.timeWait then
      result = true
    end

    d.timeLast = timeNow

    return result
  end

  --create a client that should connect over UDP to port 10211
  local client = Client:new("0.0.0.0", 10211)
  client:connect() --udp doesn't really have "connections" but this does the setup still
  
  --check if players schema exists
  client:hasSchema("players", function (exists)
    print("Schema players exists? " .. tostring(exists))

    --create it if it doesn't
    if not exists then
      client:createSchema("players", {
        type = "dict",
        children = {
          x = { type = "number" },
          y = { type = "number" },
          name = { type = "string" }
        }
      }, function (res)
        print(minetest.write_json(res))
      end)
    end
  end)

  --create a debouncer so we can avoid spamming the server if needed
  local d_net = debounce_create(150)
  
  --hook into minetest game loop with a function that is called several times per second
  minetest.register_globalstep(function(dtime)
    --see if enough time has passed to perform an update (arbitrary, avoids undue CPU/network load)
    if debounce_check(d_net) then
      --allow the client to try and receive data from server and process it into events
      client:step()
    end
  end)

  --TODO: demonstrate client:subscribe and client:mutate

```

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
