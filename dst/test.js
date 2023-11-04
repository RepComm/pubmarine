import { Client } from "./client.js";
async function main() {
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
    await client.authenticate({ apiKey });
    //create a storage for players, will be owned by our client
    client.createSchema("players", {
        type: "dict",
        children: {
            "x": { type: "number" },
            "y": { type: "number" },
            "name": { type: "string" }
        }
    });
    //create a storage for chunks, will be owned by our client
    client.createSchema("chunks", {
        type: "dict",
        children: {
            "x": { type: "number" },
            "y": { type: "number" },
            "w": { type: "number" },
            "h": { type: "number" },
            "data": { type: "Uint8Array" }
        }
    });
    //instantiate a player, will be owned by our client
    client.instance("players").then((p) => {
        //@ts-expect-error
        const localId = p.id;
        //listen to changes to players
        client.subscribe({
            topic: "players",
            id: localId, //only listen to our player
        }, (data) => {
            console.log(data);
        });
        //upload our initial player data
        client.mutate("players", localId, {
            name: "RepComm",
            x: 0,
            y: 0
        });
        //simulate changing constantly from our end
        setInterval(() => {
            client.mutate("players", localId, {
                x: Date.now(),
                y: Date.now()
            });
        }, 1000);
    });
}
main();
