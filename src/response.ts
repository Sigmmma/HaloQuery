/*******************************************************************************
 * This file is part of halo-query, a Halo server query library for Node.js.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * halo-query is free software under the GNU Lesser General Public License v3.0.
 * See LICENSE.md or <https://www.gnu.org/licenses/lgpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
import { Bitfield, Struct } from './bitfield';

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

/* Shoutout to Chaosvex for their work on Halo-Status, which was a hugely
 * helpful resource in figuring out the flag bitfields used here.
 * https://github.com/Chaosvex/Halo-Status
 * https://github.com/Chaosvex/Halo-Status/blob/master/script/FlagDecoder.class.php
 * https://github.com/Chaosvex/Halo-Status/blob/master/script/flags.php
 */
type PlayerFlags = {
	lives: number;
	health_percent: number;
	shields_enabled: number;
	respawn_time: number;
	respawn_growth: number;
	odd_man_out: number;
	invisible: number;
	suicide_penalty: number;
	infinite_grenades: number;
	weapon_set: number;
	default_equipment: number;
	indicator: number;
	players_on_radar: number;
	friend_indicators: number;
	friendly_fire: number;
	friendly_fire_penalty: number;
	auto_balance: number;
};
type VehicleFlags = {
	respawn_time: number;
	red_team: number;
	blue_team: number;
};

type GameFlags =
	| BaseGameFlags
	| CTFFlags
	| SlayerFlags
	| OddballFlags
	| KingFlags
	| RaceFlags;

type BaseGameFlags = {
	game_type: number;
}

type CTFFlags = BaseGameFlags & {
	assault: number;
	flag_must_reset: number;
	flag_must_be_home: number;
	single_flag_time: number;
};

type SlayerFlags = BaseGameFlags & {
	death_bonus: number;
	kill_penalty: number;
	kill_in_order: number;
};

type OddballFlags = BaseGameFlags & {
	random_start: number;
	ball_speed_percent: number;
	trait_with_ball: number;
	trait_without_ball: number;
	ball_type: number;
	num_balls: number;
}

type KingFlags = BaseGameFlags & {
	moving_hill: number;
}

type RaceFlags = BaseGameFlags & {
	race_type: number;
	team_scoring: number;
}

/** Allows us to extract hostnames with backslashes in them. */
const HOSTNAME_REGEX = /^\\hostname\\(.*)\\gamever/;

/** Extracts key and index from player values like "score_1". */
const PLAYER_VALUE_REGEX = /^(\w+)_(\d+)$/;
/** Extracts key and index from team values, like "score_t1". */
const TEAM_VALUE_REGEX = /^(\w+)_t(\d+)$/;


/**
 * Parses the string responses from game server queries.
 *
 * Splits the \\key1\\value1\\key2\\value2 strings into an object.
 */
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
				const [playerFlags, vehicleFlags] = value
					.split(',')
					.map(num => Number.parseInt(num));

				record['player_flags'] = playerFlags;
				record['player_flags_decoded'] = decodePlayerFlags(playerFlags);

				record['vehicle_flags'] = vehicleFlags;
				record['vehicle_flags_decoded'] = decodeVehicleFlags(vehicleFlags);
			} else if (key === 'game_flags') {
				const gameFlags = Number.parseInt(value);
				record['game_flags'] = gameFlags;
				record['game_flags_decoded'] = decodeGameFlags(gameFlags);
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

function decodePlayerFlags(value: number): PlayerFlags {
	return new Struct<PlayerFlags>([
		{ name: 'lives', size: 2 },
		{ name: 'health_percent', size: 3 },
		{ name: 'shields_enabled', size: 1 },
		{ name: 'respawn_time', size: 2 },
		{ name: 'respawn_growth', size: 2 },
		{ name: 'odd_man_out', size: 1 },
		{ name: 'invisible', size: 1 },
		{ name: 'suicide_penalty', size: 2 },
		{ name: 'infinite_grenades', size: 1 }, // Keep this off, you animals
		{ name: 'weapon_set', size: 4 },
		{ name: 'default_equipment', size: 1 },
		{ name: 'indicator', size: 2 },
		{ name: 'players_on_radar', size: 2 },
		{ name: 'friend_indicators', size: 1 },
		{ name: 'friendly_fire', size: 2 },
		{ name: 'friendly_fire_penalty', size: 2 },
		{ name: 'auto_balance', size: 1 },
	]).decode(value);
}

function decodeVehicleFlags(value: number): VehicleFlags {
	return new Struct<VehicleFlags>([
		{ name: 'respawn_time', size: 3 },
		{ name: 'red_team', size: 4 },
		{ name: 'blue_team', size: 4 },
	]).decode(value);
}

function decodeGameFlags(value: number): GameFlags {
	// We didn't make a Union type, so we do this instead.
	const gameType = value & 0x3;
	const gameTypeField: Bitfield<BaseGameFlags> =
			{ name: 'game_type', size: 3 };

	switch (gameType) {
		// This is not a valid type in the vanilla server, but apparently
		// some extensions use game_type = 0 for custom game types.
		// In this case, we don't know what the flags mean.
		case 0: return { game_type: 0 };

		case 1: return new Struct<CTFFlags>([
			gameTypeField,
			{ name: 'assault', size: 2 }, // Second bit unused
			{ name: 'flag_must_reset', size: 1 },
			{ name: 'flag_must_be_home', size: 1 },
			{ name: 'single_flag_time', size: 3 },
		]).decode(value);

		case 2: return new Struct<SlayerFlags>([
			gameTypeField,
			{ name: 'death_bonus', size: 2 }, // Second bit unused
			{ name: 'kill_penalty', size: 1 },
			{ name: 'kill_in_order', size: 1 },
		]).decode(value);

		case 3: return new Struct<OddballFlags>([
			gameTypeField,
			{ name: 'random_start', size: 2 }, // Second bit unused
			{ name: 'ball_speed_percent', size: 2 },
			{ name: 'trait_with_ball', size: 2 },
			{ name: 'trait_without_ball', size: 2 },
			{ name: 'ball_type', size: 2 },
			{ name: 'num_balls', size: 5 },
		]).decode(value);

		case 4: return new Struct<KingFlags>([
			gameTypeField,
			{ name: 'moving_hill', size: 1 },
		]).decode(value);

		case 5: return new Struct<RaceFlags>([
			gameTypeField,
			{ name: 'race_type', size: 2 },
			{ name: 'team_scoring', size: 2 },
		]).decode(value);

		default: throw new Error(`Unrecognized gametype code ${gameType} in flags ${value}`);
	}
}
