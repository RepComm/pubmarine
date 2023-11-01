# pubmarine
pub/sub over websockets

At one point I wanted to create a big fancy realtime decentralized database, but now I realize the scope is too big.

I really need a pubish/subscribe data networking lib for the browser/node, so this is it.

The authentication will be pretty basic:
`client.authenticate({ apiKey: string }): Promise<ClientAuth>`
client sends apiKey to server over open WS connection, server allows client to request and receive data if apiKey is allowed.

You could modify the server to ask a database if the apiKey is allowed.
By default any apiKey is allowed.

