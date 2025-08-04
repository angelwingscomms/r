import { DurableObject } from 'cloudflare:workers';

export interface Env {
	R: DurableObjectNamespace<R>;
}

export class R extends DurableObject<Env> {
	sessions: WebSocket[];
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.sessions = [];
	}

	async fetch(request: Request) {
		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);

		this.ctx.acceptWebSocket(server);
		this.sessions.push(server);

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		console.log('message', message)
		console.log('sessions', this.sessions)
		this.sessions.forEach((ws) => {
			ws.send(message);
		});
	}

	async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
		this.sessions = this.sessions.filter((session) => session !== ws);
		ws.close(code, 'Durable Object is closing WebSocket');
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		if (request.headers.get('Upgrade') !== "websocket") {
			return new Response("Durable object expected header - Upgrade: websocket", {
				status: 426
			})
		}
		let id = env.R.idFromName(new URL(request.url).pathname)
		let r = env.R.get(id)
		return r.fetch(request)
	},
};
