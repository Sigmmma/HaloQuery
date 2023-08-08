import { GameKeys, MasterServer, getMasterServerList } from './gamespy';
import { ServerAddress, UDPClient, UDPResponse } from './network';

export type ServerArg = ServerAddress | MasterServer;
type ServerMap = Map<MasterServer | null, ServerAddress[]>;

/**
 * Given a list of servers, returns the servers in a map grouped by game.
 *
 * @param servers A list of either IP/port (address), or the name of a game.
 * - If the name of a game is given, the game's master server is queried for a
 * list of all current server addresses.
 * - If an address is given, it is simply grouped under the `null` key, since we
 * can't know what game it's for.
 */
export async function getServersGroupedByGame(servers: ServerArg[]): Promise<ServerMap> {
	const groups: ServerMap = new Map();

	for await (const server of servers) {
		if (typeof server === 'string' && Object.keys(GameKeys).includes(server)) {
			const serversForGame = await getMasterServerList(server);
			groups.set(server, serversForGame);
		}
		else if (typeof server === 'object') {
			if (!groups.has(null)) {
				groups.set(null, []);
			}

			groups.get(null)!.push(server);
		}
		else {
			throw new Error(`Invalid server name: ${server}`);
		}
	}

	return groups;
}
