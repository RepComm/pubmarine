import { Client } from "./client.js";

async function main () {

  //apiKey roles will determine API allowances, all on server side
  //see docs for creating api keys
  const apiKey = "blah";
  //most users will not be able to create schemas
  //the owner of a schema can determine if other users can instantiate
  //a user who instantiates will own their instantiation
  //a user's instance can be configured to allow mutations from other users
  
  //when a schema owner deletes their a schema, the records will delete as well
  //the owner of an instance of a deleted schema can retain their record
  //they will not be able to mutate it across the server as the reference is gone
  
  //create a client that should connect to a server
  const client = new Client("localhost:10209");
  
  //wait for connection
  await client.connect();
  
  //wait for authentication
  // await client.authenticate({apiKey}); //not impl yet
  
  //create a storage for players, will be owned by our client

  if(!await client.hasSchema("players")) {
    await client.createSchema("players", {
      type: "dict",
      children: {
        "x": { type: "number" },
        "y": { type: "number" },
        "name": { type: "string" }
      }
    });
    console.log("Created player schema as didn't exist");
  }
  
  interface Player {
    name: string;
    x: number;
    y: number;
  }
  
  //instantiate a player, will be owned by our client
  const inst = await client.instance("players");
  const localId = inst.response.id;
  
  console.log(`Our player id: ${localId}`);

  // //upload our initial player data
  await client.mutate("players", localId, {
    name: "RepComm",
    x: 1,
    y: 2
  });

  const players = new Map<string, Player>();
  const insts = await client.listInstances<Player>("players");
  
  const {list} = insts.response;

  for (const id in list) {
    console.log("Player found by id", id);
    const p = list[id];
    players.set(id, p);

    client.subscribe<Player>({topic: "players", id }, (pid, change)=>{
      const original = players.get(id);
      Object.assign(original, change);
      // console.log("Player", id, "updated", change);
    });
  }
  
  const handleMouseMove = (evt: MouseEvent)=> {
    console.log("mouse move");
    client.mutate("players", localId, {
      x: evt.clientX / window.innerWidth,
      y: evt.clientY / window.innerHeight
    });
    // console.log("Sending mutate");
  }
  window.addEventListener("mousemove", handleMouseMove);

}

main();
