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
    const apiKey = "blah";
    //create a client that should connect to a server
    const client = new Client(window.location.host);
    //wait for connection
    await client.connect();
    //wait for authentication
    await client.authenticate({ apiKey }); //not impl yet
    //check if player schema exists yet
    if (!await client.hasSchema("players")) {
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
    //a map to track the players for rendering purposes
    const renderedPlayers = new Map();
    const existingPlayers = (await client.listInstances("players")).response.list;
    function addPlayer(id, data) {
        renderedPlayers.set(id, data);
    }
    //add pre-existing players
    for (const id in existingPlayers) {
        const p = existingPlayers[id];
        addPlayer(id, p);
    }
    //listen to mutations to players, as well as future instantiations of players
    await client.subscribe("players", (pid, change, isNewInstance) => {
        if (isNewInstance) {
            //track new players as they join (including ours when it does)
            addPlayer(pid, { x: 0.5, y: 0.5, name: "" });
        }
        else {
            //otherwise track changes by applying them to our copy of the data
            const original = renderedPlayers.get(pid);
            Object.assign(original, change);
        }
    });
    //instantiate a player, will be owned by our client
    const localId = (await client.instance("players")).response.id;
    //upload our initial player data
    await client.mutate("players", localId, {
        name: prompt("Enter player name", "testbot"),
        x: 0.5,
        y: 0.5
    });
    //some debouncing of pointer move so we don't spam the server
    const mouseMoveDebounce = {
        timeLast: 0,
        timeWait: 50
    };
    const handlePointerMove = (x, y) => {
        //don't bother if it has been an insignificant amount of time
        //since last time we tried to update
        if (!debounce(mouseMoveDebounce))
            return;
        //publish our changed player data to the server
        client.mutate("players", localId, {
            x: x / window.innerWidth,
            y: y / window.innerHeight
        });
    };
    window.addEventListener("mousemove", (evt) => {
        handlePointerMove(evt.clientX, evt.clientY);
    });
    //mobile support!
    window.addEventListener("touchmove", (evt) => {
        const touch = evt.touches[0];
        handlePointerMove(touch.clientX, touch.clientY);
    });
    //grab the canvas from the HTML
    const canvas = document.querySelector("canvas");
    //get a 2d drawing context
    const ctx = canvas.getContext("2d");
    //runs for every frame
    const animate = (timeAbs) => {
        //clear the canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        //save canvas state so we can revert view transformations
        ctx.save();
        //draw black squares at each player coord
        ctx.fillStyle = "black";
        for (const [pid, p] of renderedPlayers) {
            ctx.fillRect(p.x * canvas.width, p.y * canvas.height, 10, 10);
            ctx.fillText(p.name, p.x * canvas.width, p.y * canvas.height);
        }
        ctx.restore(); //revert view transformations
        //ask politely to be called next frame
        window.requestAnimationFrame(animate);
    };
    //start intial frame request
    window.requestAnimationFrame(animate);
    //call when the canvas needs to be resized
    const handleCanvasSize = () => {
        const r = canvas.getBoundingClientRect();
        canvas.width = Math.floor(r.width);
        canvas.height = Math.floor(r.height);
    };
    //listen to window resize to adjust canvas
    window.addEventListener("resize", handleCanvasSize);
    //call canvas resize once upon app start
    setTimeout(handleCanvasSize, 100);
}
main();
