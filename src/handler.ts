/*******************************************************************************
 * This file is part of halo-query, a Halo server query library for Node.js.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * halo-query is free software under the GNU Lesser General Public License v3.0.
 * See LICENSE.md or <https://www.gnu.org/licenses/lgpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
import {
	GameKeys,
	MasterServer,
	MasterServerFetchOpts,
	getMasterServerList,
} from './gamespy';
import { ServerAddress, UDPClient } from './network';

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
 * @param opts Options to configure the master server fetch.
 */
export async function resolveServers(
	args: ServerArg[],
	opts?: MasterServerFetchOpts,
): Promise<Server[]> {
	const servers: Server[] = [];

	for await (const arg of args) {
		if (typeof arg === 'string' && Object.keys(GameKeys).includes(arg)) {
			const serversForGame = await getMasterServerList(arg, opts);
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
export async function queryServerInfo(
	servers: Server[],
	timeout?: number,
): Promise<ServerResponse[] | null> {
	// Need map of ip:port -> game so we can map UDP responses to game.
	// The key is in the same format returned by UDPClient::readAll.
	const addressGameMap = servers.reduce((map, server) => {
		return map.set(`${server.address}:${server.port}`, server.game);
	}, new Map<string, string | null>());

	const client = new UDPClient();

	await Promise.all(servers.map(async (server) => (
		// Game servers recognize a single backslash as an info query.
		client.write(server.address, server.port, '\\')
	)));
	const responses = await client.readAll(timeout);

	client.close();

	return responses?.map(response => ({
		address: response.address,
		port: response.port,
		data: response.data.toString(),
		game: addressGameMap.get(`${response.address}:${response.port}`) ?? null,
	})) ?? null;
}
