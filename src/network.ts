/*******************************************************************************
 * This file is part of halo-query, a Halo server query library for Node.js.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * halo-query is free software under the GNU Lesser General Public License v3.0.
 * See LICENSE.md or <https://www.gnu.org/licenses/lgpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
import { Socket, SocketConnectOpts } from 'net';

const DEFAULT_END_DELAY = 500;

/** A promisified wrapper around {@link Socket}. */
export class TCPClient {
	private socket: Socket;

	constructor() {
		this.socket = new Socket();
	}

	/** Calls underlying {@link Socket}'s `destroy` method. */
	close(): this {
		this.socket.destroy();
		return this;
	}

	/** Calls underlying {@link Socket}'s `setTimeout` method. */
	setTimeout(ms: number): this {
		this.socket.setTimeout(ms);
		return this;
	}

	/**
	 * Calls underlying {@link Socket}'s `connect` method with the given options.
	 * Resolves if successful, and rejects with the error if unsuccessful.
	 */
	async connect(options: SocketConnectOpts): Promise<void> {
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
	async read(endDelay = DEFAULT_END_DELAY): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			const buffers: Buffer[] = [];

			// Define handler up here so we can remove it by reference later.
			const onData = (buffer: Buffer): void => {
				buffers.push(buffer);
				timeout.refresh(); // Defined below
			}

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
		endDelay = DEFAULT_END_DELAY,
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
