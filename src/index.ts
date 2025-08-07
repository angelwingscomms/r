import { DurableObject } from 'cloudflare:workers';

const key = async (env: Env) => {
	// Ensure AES-GCM key length is valid (16, 24, or 32 bytes). Use SHA-256 to derive 32 bytes.
	const material = new TextEncoder().encode(env.s ?? '');
	const hash = await crypto.subtle.digest('SHA-256', material);
	return await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};

export const decrypt = async (env: Env, sB64: string, ivB64: string): Promise<string> => {
	const sBytes = Uint8Array.from(atob(sB64), (c) => c.charCodeAt(0));
	const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
	const d = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await key(env), sBytes);
	return new TextDecoder().decode(new Uint8Array(d));
};

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
			webSocket: client
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
		const url = new URL(request.url);
		const material = new TextEncoder().encode(env.s ?? '');
		const hash = await crypto.subtle.digest('SHA-256', material);
		const key = await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
		const exp = await decrypt(env, url.searchParams.get('s') ?? '', url.searchParams.get('iv') ?? '');
		if (Date.now() > +exp) {
			return new Response('expired s', { status: 401 });
		}

		let path = url.pathname.split('/');
		switch (path[1]) {
			case 'send': {
				let id = env.R.idFromName(path[2]);
				let r = env.R.get(id);
				await r.send(await request.text());
				return new Response();
				break;
			}
			case 'i': {
				return new Response(env.R.newUniqueId().toString());
				break;
			}
			default: {
				let id = env.R.idFromName(path[1].slice(1));
				let r = env.R.get(id);
				return r.fetch(request);
			}
		}
	}
};
