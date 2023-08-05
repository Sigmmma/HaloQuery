/*******************************************************************************
 * This file is part of halo-query, a Halo server query library for Node.js.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * halo-query is free software under the GNU Lesser General Public License v3.0.
 * See LICENSE.md or <https://www.gnu.org/licenses/lgpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
import UDP from 'dgram';
import * as TCP from 'net';

interface UDPResponse {
	address: string;
	port: number;
	data: Buffer;
}

const DEFAULT_END_DELAY_MS = 500;
const DEFAULT_TIMEOUT_MS = 1000;

/**
 * A promisified wrapper around {@link UDP.Socket}.
 *
 * NOTE: UDP is a "fire-and-forget" protocol with no acknowledgement built in.
 * There is no guarantee any data received is a response to a previous message,
 * and there is no guarantee any data will be returned at all.
 */
export class UDPClient {
	private socket: UDP.Socket;

	constructor() {
		this.socket = UDP.createSocket('udp4');
	}

	/** Calls underlying {@link UDP.Socket}'s `close` method. */
	close(): this {
		this.socket.close();
		return this;
	}

	/**
	 * Reads the first available message from the socket.
	 * Resolves with the first packet of data received, or rejects if no data
	 * is received within the timeout.
	 *
	 * Note {@link UDPClient} for disclaimer on UDP packets.
	 */
	async read(timeout = DEFAULT_END_DELAY_MS): Promise<UDPResponse> {
		return new Promise((resolve, reject) => {
			const timeoutTimer = setTimeout(reject, timeout);

			this.socket.once('message', (msg, info) => {
				clearTimeout(timeoutTimer);
				resolve({
					address: info.address,
					port: info.port,
					data: msg,
				});
			});
			this.socket.once('error', reject);
		});
	}

	/**
	 * Reads all available data from the socket.
	 * We can receive messages from many sources, so the data is returned in a
	 * map grouped by address and port (or `null` if no data was received).
	 * This function is useful if {@link write} was called several times.
	 *
	 * Resolves `endDelay` milliseconds after the most recent received data.
	 * This delay strategy is the only way to promisify this operation, because:
	 * - UDP has no defined endpoint
	 * - We can receive messages from many sources.
	 * - It's non-trivial (sometimes impossible) to detect an end point by
	 *   analyzing the data itself.
	 */
	async readAll(endDelay = DEFAULT_END_DELAY_MS): Promise<Map<string, UDPResponse> | null> {
		return new Promise((resolve, reject) => {
			const messageGroups = new Map<string, UDPResponse[]>();

			// Groups received messages by sender. One sender may send multiple
			// messages, so we use an array. We'll reduce this later.
			// Define handler up here so we can remove it by reference later.
			const onData = (msg: Buffer, info: UDP.RemoteInfo): void => {
				const key = `${info.address}:${info.port}`;
				if (!messageGroups.has(key)) {
					messageGroups.set(key, []);
				}

				messageGroups.get(key)!.push({
					address: info.address,
					port: info.port,
					data: msg,
				});

				timeout.refresh(); // Defined below
			};

			// When this timer expires, resolve the Promise with the data.
			const timeout = setTimeout(() => {
				this.socket.removeListener('data', onData);

				// Reduce each sender's buffer array down to a single buffer
				resolve(messageGroups.size === 0
					? null
					: Array.from(messageGroups.keys()).reduce((map, key) => {
						// This list is guaranteed to have at least one message.
						const messages = messageGroups.get(key)!;
						return map.set(key, {
							address: messages[0].address,
							port: messages[0].port,
							data: Buffer.concat(messages.map(msg => msg.data)),
						});
					}, new Map<string, UDPResponse>())
				);
			}, endDelay);

			this.socket.on('message', onData);
			this.socket.once('error', (err) => {
				this.socket.removeListener('data', onData);
				clearTimeout(timeout);
				reject(err);
			});
		});
	}

	/** Convenience method that combines {@link read} and {@link write}. */
	async request(
		ip: string,
		port: number,
		message: Uint8Array | string,
		timeout = DEFAULT_TIMEOUT_MS,
	): Promise<UDPResponse> {
		await this.write(ip, port, message);
		return await this.read(timeout);
	}

	/**
	 * Writes the given data to the socket.
	 * Promise resolves once all data has been flushed.
	 */
	async write(ip: string, port: number, message: Uint8Array | string): Promise<number> {
		return new Promise((resolve, reject) => {
			this.socket.send(message, port, ip, (err, bytesWritten) => {
				if (err) reject(err);
				resolve(bytesWritten);
			});
		});
	}
}

/**
 * A promisified wrapper around {@link TCP.Socket}.
 *
 * Enables making TCP requests to a specific server and awaiting a response.
 */
export class TCPClient {
	private socket: TCP.Socket;

	constructor() {
		this.socket = new TCP.Socket();
	}

	/** Calls underlying {@link TCP.Socket}'s `destroy` method. */
	close(): this {
		this.socket.destroy();
		return this;
	}

	/** Calls underlying {@link TCP.Socket}'s `setTimeout` method. */
	setTimeout(ms: number): this {
		this.socket.setTimeout(ms);
		return this;
	}

	/**
	 * Calls underlying {@link TCPSocket}'s `connect` method with the given options.
	 * Resolves if successful, and rejects with the error if unsuccessful.
	 */
	async connect(options: TCP.SocketConnectOpts): Promise<void> {
		return new Promise((resolve, reject) => {
			this.socket.connect(options);
			this.socket.once('connect', resolve);
			this.socket.once('error', reject);
		});
	}

	/**
	 * Reads all available data from the socket.
	 * Resolves with a {@link Buffer} containing all the data received
	 * `endDelay` milliseconds after the most recent received data.
	 *
	 * This delay strategy is the only way to promisify this operation, because:
	 * - TCP has no defined endpoint
	 * - It's non-trivial (sometimes impossible) to detect an end point by
	 *   analyzing the data itself.
	 *
	 * It's kinda dumb, but it works.
	 */
	async read(endDelay = DEFAULT_END_DELAY_MS): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			const buffers: Buffer[] = [];

			// Define handler up here so we can remove it by reference later.
			const onData = (buffer: Buffer): void => {
				buffers.push(buffer);
				timeout.refresh(); // Defined below
			};

			// TCP has no defined end, and it is non-trivial to analyze the data
			// to detect an end point. Instead, we just resolve with the data
			// after a set timeout. This is stupid.
			const timeout = setTimeout(() => {
				this.socket.removeListener('data', onData);
				resolve(Buffer.concat(buffers));
			}, endDelay);

			this.socket.on('data', onData);
			this.socket.once('timeout', () => reject(new Error('Connection timed out!')));
			this.socket.once('error', reject);
		});
	}

	/** Convenience method that combines {@link read} and {@link write}. */
	async request(
		buffer: Uint8Array | string,
		endDelay = DEFAULT_END_DELAY_MS,
	): Promise<Buffer> {
		await this.write(buffer);
		return await this.read(endDelay);
	}

	/**
	 * Writes the given data to the socket.
	 * Promise resolves once all data has been flushed.
	 */
	async write(buffer: Uint8Array | string): Promise<void> {
		return new Promise((resolve, reject) => {
			this.socket.write(buffer, (error) => {
				if (error) reject(error);
				else resolve();
			});
		});
	}
}
