import { GameKeys, MasterServer, getMasterServerList } from './gamespy';
import { ServerAddress, UDPClient, UDPResponse } from './network';

export type ServerArg = ServerAddress | MasterServer;
export type Server = ServerAddress & {
	game: string | null;
};
export type ServerResponse = Server & {
	data: string | Record<string, unknown>;
}

/**
 * Resolves a mixed list of addresses and master server names into a list of
 * game server addresses.
 *
 * @param args A list where each item is either an IP/port (address) for an
 * individual game server, or the internal GameSpy name of a game.
 * - If a game name is given, the game's master server is queried for a list of
 * all current server addresses.
 * - If an address is given, it is simply added to the resulting list with the
 * `game` key set to `null`, since we can't know what game it's for.
 */
export async function resolveServers(args: ServerArg[]): Promise<Server[]> {
	const servers: Server[] = [];

	for await (const arg of args) {
		if (typeof arg === 'string' && Object.keys(GameKeys).includes(arg)) {
			const serversForGame = await getMasterServerList(arg);
			servers.push(
				...serversForGame.map(server => ({
					...server,
					game: arg,
				}))
			);
		} else if (typeof arg === 'object') {
			servers.push({
				...arg,
				game: null,
			});
		} else {
			throw new Error(`Invalid server name: ${arg}`);
		}
	}

	return servers;
}

/** Queries info from the given game servers. */
export async function queryServerInfo(servers: Server[]): Promise<ServerResponse[] | null> {
	// Need map of ip:port -> game so we can map UDP responses to game.
	// The key is in the same format returned by UDPClient::readAll.
	const addressGameMap = servers.reduce((map, server) => {
		return map.set(`${server.address}:${server.port}`, server.game);
	}, new Map<string, string | null>());

	const client = new UDPClient();

	await Promise.all(servers.map(async (server) => (
		client.write(server.address, server.port, '\\')
	)));
	// TODO change this, this doesn't need to be a map.
	const responses = await client.readAll(/* TODO timeout */);

	client.close();

	return Array.from(responses!.values()).map(response => ({
		address: response.address,
		port: response.port,
		data: response.data.toString(),
		game: addressGameMap.get(`${response.address}:${response.port}`) ?? null,
	}));
}

/** Splits the \\key1\\value1\\key2\\value2 strings into an object. */
export function parseServerInfo(data: string): Record<string, unknown> {
	return data
		.split('\\')
		.reduce<string[][]>((groups, item, i) => {
			if (i % 2 === 0) {
				groups.push([item]);
			} else {
				groups[groups.length - 1].push(item);
			}
			return groups;
		}, [])
		.reduce<Record<string, unknown>>((record, [key, value]) => {
			record[key] = value;
			return record;
		}, {});
}
