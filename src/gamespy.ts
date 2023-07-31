/*******************************************************************************
 * This file is part of halo-query, a Halo server query library for Node.js.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * halo-query is free software under the GNU Lesser General Public License v3.0.
 * See LICENSE.md or <https://www.gnu.org/licenses/lgpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
import { TCPClient } from './network';

const MASTER_HOST = 'hosthpc.com';
const MASTER_PORT = 28910;

import { writeFileSync } from 'fs';

async function getMasterServerList(game: string): Promise<void> {//ServerAddress[] {
	const client = new TCPClient();
	await client.connect({ host: MASTER_HOST, port: MASTER_PORT });

	const nonce = makeNonce();
	const query = encodeQueryData(game, nonce);
	const response = await client.request(query);

	writeFileSync('nonce.txt', nonce);
	writeFileSync('out.bin', response);

	client.close();
}
getMasterServerList('halom');

/**
 * Encodes a server list query in the form GameSpy wants.
 *
 * The query message is a byte array containing the following data:
 * - 1 byte padding.
 * - 1 byte message length.
 * - 1 byte padding.
 * - 6 bytes query settings (we hard-code these).
 * - The null-terminated game name (e.g. halom\0).
 * - The null-terminated game name again.
 * - The null-terminated nonce key.
 * - 5 bytes padding.
 *
 * For the curious, we give the game name twice because GameSpy supports
 * querying a different "sub-game", but Halo doesn't use that feature.
 */
function encodeQueryData(game: string, nonce: string): Uint8Array {
	// No idea what this actually means, but it gets us the list of
	// server IPs and ports so whatever.
	const QUERY_SETTINGS = [1, 3, 0, 0, 0, 0];

	const data = [
		0, // Padding
		0, // Replaced with message length later
		0, // Padding
		...QUERY_SETTINGS,
		...cstring(game),
		...cstring(game),
		...cstring(nonce),
		...Array(5).fill(0), // Padding
	];

	data[1] = data.length;

	return new Uint8Array(data);
}

/**
 * Converts the given string into a null-terminated byte array.
 */
function cstring(str: string): number[] {
	return [...str.split('').map(char => char.charCodeAt(0)), 0];
}

/**
 * Generates an 8 character alpha-numeric one-time-use key (aka "nonce", sorry brits).
 *
 * GameSpy doesn't actually care if this is cryptographically secure, as long
 * as each request has a unique key. Encrypting public server info is dumb
 * anyway, so we just do something easy.
 */
function makeNonce(): string {
	return (+new Date).toString(36).slice(-8);
}
