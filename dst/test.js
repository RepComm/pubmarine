import { Client } from "./client.js";
function debounce(d) {
    const timeNow = Date.now();
    let result = false;
    if (timeNow - d.timeLast > d.timeWait) {
        result = true;
        d.timeLast = timeNow;
    }
    return result;
}
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
    const client = new Client(window.location.host);
    //wait for connection
    await client.connect();
    //wait for authentication
    await client.authenticate({ apiKey }); //not impl yet
    //create a storage for players, will be owned by our client
    if (!await client.hasSchema("players")) {
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
    //instantiate a player, will be owned by our client
    const inst = await client.instance("players");
    const localId = inst.response.id;
    console.log(`Our player id: ${localId}`);
    // //upload our initial player data
    await client.mutate("players", localId, {
        name: prompt("Enter player name", "testbot"),
        x: 0.5,
        y: 0.5
    });
    const players = new Map();
    const insts = await client.listInstances("players");
    const { list } = insts.response;
    function addPlayer(id, data) {
        players.set(id, data);
    }
    for (const id in list) {
        const p = list[id];
        addPlayer(id, p);
        console.log("Player identified in list", id);
    }
    await client.subscribe("players", (pid, change, isNewInstance) => {
        console.log("sub msg");
        if (isNewInstance) {
            console.log("Player instanced", pid);
            addPlayer(pid, { x: 0.5, y: 0.5, name: "" });
        }
        else {
            const original = players.get(pid);
            Object.assign(original, change);
        }
    });
    const mouseMoveDebounce = {
        timeLast: 0,
        timeWait: 50
    };
    const handlePointerMove = (x, y) => {
        if (!debounce(mouseMoveDebounce))
            return;
        client.mutate("players", localId, {
            x: x / window.innerWidth,
            y: y / window.innerHeight
        });
    };
    window.addEventListener("mousemove", (evt) => {
        handlePointerMove(evt.clientX, evt.clientY);
    });
    window.addEventListener("touchmove", (evt) => {
        const touch = evt.touches[0];
        handlePointerMove(touch.clientX, touch.clientY);
    });
    const canvas = document.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const animate = (timeAbs) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.fillStyle = "black";
        for (const [pid, p] of players) {
            ctx.fillRect(p.x * canvas.width, p.y * canvas.height, 10, 10);
            ctx.fillText(p.name, p.x, p.y - 20);
        }
        ctx.restore();
        window.requestAnimationFrame(animate);
    };
    const handleCanvasSize = () => {
        const r = canvas.getBoundingClientRect();
        canvas.width = Math.floor(r.width);
        canvas.height = Math.floor(r.height);
    };
    window.addEventListener("resize", handleCanvasSize);
    setTimeout(handleCanvasSize, 100);
    window.requestAnimationFrame(animate);
}
main();
