import { DurableObject } from 'cloudflare:workers';

export class R extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.ctx = ctx;
	}

	async send(message: string) {
		console.log(this.ctx.getWebSockets());
		this.ctx.getWebSockets().forEach((ws) => {
			ws.send(message);
		});
	}

	async fetch(request: Request) {
		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);

		this.ctx.acceptWebSocket(server);

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}

	async webSocketMessage(ws: WebSocket, body: string | ArrayBuffer) {
		this.ctx.getWebSockets().forEach((ws) => {
			ws.send(body);
		});
	}

	async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
		ws.close(code, 'Durable Object is closing WebSocket');
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		let path = new URL(request.url).pathname;
		if (path.startsWith('/send/')) {
			let name = path.split('/send/')[1];
			let id = env.R.idFromName(name);
			let r = env.R.get(id);
			await r.send(await request.text());
			return new Response();
		} else {
			let id = env.R.idFromName(path.slice(1));
			let r = env.R.get(id);
			return r.fetch(request);
		}
	},
};
