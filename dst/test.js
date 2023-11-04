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
            x: 1,
            y: 2
        });
        const handleMouseMove = (evt) => {
            client.mutate("players", localId, {
                x: evt.clientX / window.innerWidth,
                y: evt.clientY / window.innerHeight
            });
            // console.log("Sending mutate");
        };
        window.addEventListener("mousemove", handleMouseMove);
    });
    let allPlayers = new Map();
    client.listInstances("players").then((res) => {
        const { list } = res;
        console.log(res);
        for (const id in list) {
            const p = list[id];
            allPlayers.set(id, p);
            console.log("Other player", id);
            client.subscribe({ topic: "players", id }, (pid, change) => {
                const original = allPlayers.get(id);
                for (const key in change) {
                    original[key] = change[key];
                }
                console.log("Player", id, "updated", original);
            });
        }
    });
}
main();
