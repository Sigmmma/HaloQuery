/*******************************************************************************
 * This file is part of halo-query, a Halo server query library for Node.js.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * halo-query is free software under the GNU Lesser General Public License v3.0.
 * See LICENSE.md or <https://www.gnu.org/licenses/lgpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
import { decryptx } from './gamespy-crypto';
import { ServerAddress, TCPClient } from './network';

const DEFAULT_MASTER_HOST = 'hosthpc.com';
const DEFAULT_MASTER_PORT = 28910;
const DEFAULT_TIMEOUT_MS = 3000;

/** The end of the data is denoted by an IP matching this value. */
const DATA_END_IP_SENTINEL = '255.255.255.255';

/** Encoded IP/port data. 4 bytes for IP, 2 bytes for port. */
const IP_PORT_LEN = 6;

export enum GameKeys {
	halo     = 'QW88cv',
	halod    = 'yG3d9w',
	halomacd = 'e4Rd9J',
	halomac  = 'e4Rd9J',
	halom    = 'e4Rd9J',
	halor    = 'e4Rd9J',
}
export type MasterServer = keyof typeof GameKeys;

interface DecodedData {
	requestIp: string;
	commonPort: number;
	unknown1: string;
	unknown2: string;
	servers: ServerAddress[];
}

/**
 * Flags for game server info in the master server response data.
 * The meaning of these values is currently unknown.
 */
enum Flags {
	A = 0x02,
	B = 0x08,
	C = 0x10,
	D = 0x20,
	E = 0x40,
}

/**
 * Retrieves the list of all known public dedicated servers from the GameSpy
 * master server for the given game.
 *
 * @param game GameSpy game code. See {@link GameKeys}.
 */
export async function getMasterServerList(game: string): Promise<ServerAddress[]> {
	if (!Object.keys(GameKeys).includes(game)) {
		throw new Error(`Unsupported game key: ${game}`);
	}

	const client = new TCPClient();
	client.setTimeout(DEFAULT_TIMEOUT_MS);
	await client.connect({ host: DEFAULT_MASTER_HOST, port: DEFAULT_MASTER_PORT });

	const gameKey = GameKeys[game as keyof typeof GameKeys];
	const validationKey = makeValidationKey();

	const query = encodeMasterServerRequest(game, validationKey);
	const encryptedResponse = await client.request(query);
	client.close();

	const decryptedResponse = decryptx(gameKey, validationKey, encryptedResponse);
	if (!decryptedResponse) {
		throw new Error('Failed to decrypt master server response!');
	}

	const decodedResponse = decodeMasterServerResponse(decryptedResponse);
	if (!decodedResponse) {
		throw new Error('Failed to decode master server response!');
	}

	return decodedResponse.servers;
}

/** Converts the given string into a null-terminated byte array. */
function cstring(str: string): number[] {
	return [...str.split('').map(char => char.charCodeAt(0)), 0];
}

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
 * - The null-terminated validation key.
 * - 5 bytes padding.
 *
 * For the curious, we give the game name twice because GameSpy supports
 * querying a different "sub-game", but Halo doesn't use that feature.
 */
function encodeMasterServerRequest(
	game: string,
	validationKey: string,
): Uint8Array {
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
		...cstring(validationKey),
		...Array(5).fill(0), // Padding
	];

	data[1] = data.length;

	return new Uint8Array(data);
}

/**
 * Decodes the given *decrypted* byte array of GameSpy data into a usable form.
 * NOTE: Assumes the data is already decrypted! See {@link decryptx}.
 *
 * This function does very little to sanity check the data, and is largely
 * adapted from `enctypex_decoder_convert_to_ipport` in
 * file://./gamespy-crypto/enctypex_decoder.c.
 *
 * The given data should be byte array containing the following layout:
 * - 4 bytes containing the requester's IP.
 * - 2 bytes containing the "most used" port, or 0xFFFF if there was an error.
 * - n byte Pascal string (1 byte size, n bytes data) containing <something>.
 * - n byte Pascal string containing <something else>.
 * - Server info list. Each element has:
 *     - 1 byte element flags (see {@link Flags}).
 *     - 4 bytes containing server IP.
 *     - 2 bytes containing server port.
 *     - ??? bytes containing some unknown data. A cursory inspection shows
 *       192.168.x.x and 10.x.x.x addresses in here. Presumably one of the flags
 *       marks listen servers apart from dedicated servers, and the original
 *       code just skips over them.
 * @param data A decrypted response from the GameSpy master server.
 */
function decodeMasterServerResponse(data: Buffer): DecodedData | null {
	if (data.length < IP_PORT_LEN) {
		return null;
	}

	let scanner = 0;

	// Get the requester's IP and common port.
	const {
		address: requestIp,
		port: commonPort,
	} = extractAddress(data.subarray(scanner, IP_PORT_LEN));
	scanner += IP_PORT_LEN;

	if (commonPort === 0xFFFF) {
		throw new Error('GameSpy master server request error');
	}

	// I'm not sure Halo actually uses these values.
	// I'm also not sure if these are actually Pascal strings, but the data at
	// least matches their layout. Original code calls these "static data".
	const unknown1 = extractPascalString(data.subarray(scanner));
	scanner += unknown1.length + 1;

	const unknown2 = extractPascalString(data.subarray(scanner));
	scanner += unknown2.length + 1;

	// Parse out each server IP/port.
	const servers: ServerAddress[] = [];
	while (scanner < data.length) {
		const flag = data[scanner];
		scanner++;

		// Adapted from original code. Not sure what these flags mean, but my
		// current theory is at least one of these marks a listen server.
		let len = 0;
		if (flag & Flags.A) len += 3;
		if (flag & Flags.B) len += 4;
		if (flag & Flags.C) len += 2;
		if (flag & Flags.D) len += 2;

		const { address, port } =
			extractAddress(data.subarray(scanner, scanner + IP_PORT_LEN));
		scanner += IP_PORT_LEN + len - 1;

		if (flag === 0 && address === DATA_END_IP_SENTINEL) {
			break;
		}

		servers.push({ address, port });
	}

	return {
		requestIp,
		commonPort,
		unknown1,
		unknown2,
		servers,
	};
}

/** Extracts an IP and port from the given byte array. */
function extractAddress(slice: Buffer): ServerAddress {
	const [ip1, ip2, ip3, ip4, port1, port2] = slice;
	return {
		address: `${ip1}.${ip2}.${ip3}.${ip4}`,
		port: (port1 << 8) | port2,
	};
}

/**
 * Extracts a C-style string from the given byte array.
 * Assumes the string starts at the beginning of the data, and the first
 * null terminator (\0) is where the string ends.
 */
function extractCString(slice: Buffer): string {
	let size;
	for (size = 0; slice[size]; size++);
	return slice.subarray(0, size).toString();
}

/**
 * Extracts a Pascal-style string from the given byte array.
 * Assumes the first byte is the length of the string.
 */
function extractPascalString(slice: Buffer): string {
	const size = slice[0];
	return slice.subarray(1, size).toString();
}

/**
 * Generates an 8 character alpha-numeric one-time-use key.
 *
 * GameSpy doesn't actually care if this is cryptographically secure, as long
 * as each request has a unique key. Encrypting public server info is dumb
 * anyway, so we just do something easy.
 */
function makeValidationKey(): string {
	return (+new Date).toString(36).slice(-8);
}
