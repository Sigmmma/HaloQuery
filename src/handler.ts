import { GameKeys, MasterServer, getMasterServerList } from './gamespy';
import { ServerAddress, UDPClient, UDPResponse } from './network';

export type ServerArg = ServerAddress | MasterServer;
export type Server = ServerAddress & {
	game: string | null;
};

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
}
