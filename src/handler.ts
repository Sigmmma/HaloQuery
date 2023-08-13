/*******************************************************************************
 * This file is part of halo-query, a Halo server query library for Node.js.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * halo-query is free software under the GNU Lesser General Public License v3.0.
 * See LICENSE.md or <https://www.gnu.org/licenses/lgpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
import { GameKeys, MasterServer, getMasterServerList } from './gamespy';
import { ServerAddress, UDPClient } from './network';

export type ServerArg = ServerAddress | MasterServer;
export type Server = ServerAddress & {
	game: string | null;
};
export type ServerResponse = Server & {
	data: string | Record<string, unknown>;
}

type InfoValue = string | number | null;

interface ServerInfo {
	hostname?: string;
	players?: {
		[key: string]: InfoValue;
	}[];
	teams?: {
		[key: string]: InfoValue;
	}[];
	[key: string]: unknown;
}

/** Allows us to extract hostnames with backslashes in them. */
const HOSTNAME_REGEX = /^\\hostname\\(.*)\\gamever/;

/** Extracts key and index from player values like "score_1". */
const PLAYER_VALUE_REGEX = /^(\w+)_(\d+)$/;
/** Extracts key and index from team values, like "score_t1". */
const TEAM_VALUE_REGEX = /^(\w+)_t(\d+)$/;

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
	const responses = await client.readAll(/* TODO timeout */);

	client.close();

	return responses?.map(response => ({
		address: response.address,
		port: response.port,
		data: response.data.toString(),
		game: addressGameMap.get(`${response.address}:${response.port}`) ?? null,
	})) ?? null;
}

/** Splits the \\key1\\value1\\key2\\value2 strings into an object. */
export function parseServerInfo(data: string): ServerInfo {
	// Annoyingly, "hostname" can have backslashes in it.
	// Thankfully, "gamever" always follows, so we can just read until we see that.
	const hostname = HOSTNAME_REGEX.exec(data)?.[1];

	const start = data.indexOf('gamever');
	const parts = data.substring(start).split('\\');

	return parts
		.reduce<string[][]>((groups, item, i) => {
			if (i % 2 === 0) {
				groups.push([item]);
			} else {
				groups[groups.length - 1].push(item);
			}
			return groups;
		}, [])
		.reduce<ServerInfo>((record, [key, value]) => {
			let parent: 'teams'|'players'|null = null;
			let match: RegExpExecArray | null;

			if (match = TEAM_VALUE_REGEX.exec(key)) {
				parent = 'teams';
			} else if (match = PLAYER_VALUE_REGEX.exec(key)) {
				parent = 'players';
			}

			if (parent && match) {
				const subKey = match[1];
				const index = Number.parseInt(match[2]);

				// If only we had Perl's auto-vivification...
				if (!record[parent])         record[parent] = [];
				if (!record[parent]![index]) record[parent]![index] = {};
				record[parent]![index][subKey] = parseValue(value);
			} else if (key === 'player_flags') {
				record[key] = value.split(',').map(num => Number.parseInt(num));
			} else {
				record[key] = parseValue(value);
			}

			return record;
		}, { hostname });
}

/** Parses a server response value into the most appropriate type. */
function parseValue(value: string): InfoValue {
	const num = Number.parseInt(value);
	if (Number.isNaN(num)) {
		return value === '' ? null : value;
	} else {
		return num;
	}
}
