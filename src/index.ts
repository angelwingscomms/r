import { DurableObject } from 'cloudflare:workers';

export class R extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.ctx = ctx;
	}

	async send(data: object) {
		console.log(this.ctx.getWebSockets());
		this.ctx.getWebSockets().forEach((ws) => {
			console.log('sending to', ws);
			ws.send(JSON.stringify(data));
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
		try {
			let dataString: string;
			if (typeof body === 'string') {
				dataString = body;
			} else {
				dataString = new TextDecoder().decode(body);
			}
			const data = JSON.parse(dataString);
			try {
				const response = await fetch(this.env.i, {
					method: 'POST',
					body,
				});

				if (!response.ok) {
					let respText: string | undefined;
					try {
						respText = await response.text();
					} catch (_e) {
						respText = undefined;
					}
					const info = {
						error: 'HTTP error',
						status: response.status,
						statusText: response.statusText,
						request: {
							method: 'POST',
							url: this.env?.i,
							rawBody: typeof body === 'string' ? body : '[ArrayBuffer]',
							dataString,
							data,
						},
						response: {
							ok: response.ok,
							status: response.status,
							statusText: response.statusText,
							headers: Object.fromEntries(response.headers.entries()),
							bodyText: respText,
						},
					};
					throw new Error(JSON.stringify(info, null, 2));
				}
			} catch (e) {
				if (e instanceof Error) {
					console.error('r message save:', e.message, {
						name: e.name,
						stack: e.stack,
						cause: (e as any).cause,
					});
				} else {
					console.error('r message save: Non-Error thrown value', e);
				}
			}
		} catch (e) {
			// This will now catch both JSON parsing errors and fetch-related errors
			console.error('An error occurred:', e.message);
		}
	}

	async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
		ws.close(code, 'Durable Object is closing WebSocket');
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		let path = new URL(request.url).pathname;
		if (path.startsWith('/send')) {
			let name = path.split('/send/')[1];
			let id = env.R.idFromName(name);
			let r = env.R.get(id);
			await r.send(await request.json());
			return new Response();
		} else {
			let id = env.R.idFromName(path.slice(1));
			let r = env.R.get(id);
			return r.fetch(request);
		}
	},
};
