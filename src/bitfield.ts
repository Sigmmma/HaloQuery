/*******************************************************************************
 * This file is part of halo-query, a Halo server query library for Node.js.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * halo-query is free software under the GNU Lesser General Public License v3.0.
 * See LICENSE.md or <https://www.gnu.org/licenses/lgpl-3.0.en.html>
 * for more information.
 ******************************************************************************/

// This is a great candidate to be pulled out to a library, because there's
// apparently somehow no package for Node.js that does this.

/** Represents a single field in the {@link Struct}. */
export interface Bitfield<T> {
	/** Name of field in final parsed value. */
	name: keyof T;
	/** Size of field in bits. */
	size: number;
}

/**
 * Defines a bitfield struct that can decode values into named fields.
 *
 * @param T The type to unpack into.
 * NOTE: due to a quirk in TypeScript, this type needs to be defined using
 * `type XYZ = {...}`, not `interface XYZ {...}`
 * https://github.com/microsoft/TypeScript/issues/15300#issuecomment-371353444
 */
export class Struct<T extends Record<string, number> = Record<string, number>> {
	private fields: Bitfield<T>[];
	private decodedFields: T;
	private size: number;

	/**
	 * Creates a new bitfield struct handler that can encode and decode numbers
	 * according to the given size and fields.
	 *
	 * @param size Size of packed value (e.g. 32 for a 32 bit integer).
	 * @param fields The named fields of the bitfield, in left-to-right order.
	 */
	constructor(size: number, fields: Bitfield<T>[]) {
		this.size = size;
		this.fields = fields;
		this.decodedFields = {} as T;
		// TODO probably verify the sum of fieldDef sizes is <= size.
	}

	/**
	 * Decodes the given value into fields according to the {@link Bitfield}s
	 * this {@link Struct} was initialized with.
	 */
	decode(value: number): T {
		let offset = 0;
		this.decodedFields = this.fields.reduce<T>((record, def) => {
			const shift = this.size - (offset + def.size);
			const mask = Array(def.size)
				.fill(null)
				.reduce((value) => (value << 1) | 1, 0);

			// Need this cast because TypeScript complains that T[keyof T]
			// might not be a number, but TypeScript also complains if we try to
			// pass in a type for T where that happens, so this is probably safe.
			(record[def.name] as number) = (value >> shift) & mask;

			console.log(def, shift, mask);

			offset += def.size;
			return record;
		}, {} as T);

		return this.decodedFields;
	}

	/**
	 * Encodes the current field values into a number according to the
	 * {@link Bitfield}s this {@link Struct} was initialized with.
	 */
	encode(): number {
		// TODO we don't actually need this functionality right now, but this
		// class is pretty close to being more generally useful as its own
		// library. We'll implement this if we ever pull this out.
		return 0;
	}

	/**
	 * A reference to the currently decoded data.
	 * If no data has been decoded yet, this can still be used to set
	 * field values and encode them.
	 */
	get data(): T {
		return this.decodedFields;
	}
}
