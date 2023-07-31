/*******************************************************************************
 * This file is part of halo-query, a Halo server query library for Node.js.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * halo-query is free software under the GNU Lesser General Public License v3.0.
 * See LICENSE.md or <https://www.gnu.org/licenses/lgpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
const gamespy = require('../../build/Release/gamespy.node');

/**
 * Decrypts a blob of data from GameSpy.
 *
 * This decryption uses ALuigi's "enctypex" decryption implementation.
 * http://aluigi.altervista.org/papers.htm#gsmsalg
 *
 * Wrapper around the native method to add type information.
 *
 * @param gameKey The encryption key for the specific game.
 * See: https://github.com/gbMichelle/gslist/blob/master/gslist.cfg
 * @param validateKey The one-time key sent with the GameSpy request.
 * @param data The encrypted data blob returned from GameSpy.
 * @returns A Buffer containing the decrypted data, or `null` if the data
 * couldn't be decrypted.
 */
export function decryptx(gameKey: string, validateKey: string, data: Buffer): Buffer | null {
	return gamespy.decryptx(gameKey, validateKey, data);
}
