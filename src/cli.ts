#!/usr/bin/env node
/*******************************************************************************
 * This file is part of halo-query, a Halo server query library for Node.js.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * halo-query is free software under the GNU Lesser General Public License v3.0.
 * See LICENSE.md or <https://www.gnu.org/licenses/lgpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
import { Command, Option } from 'commander';
import { GameKeys, ServerAddress, getMasterServerList } from './gamespy';
import { Optional } from 'utility-types';
const PACKAGE = require('../package.json');

const IP_REGEX = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

enum MasterServers {
	ce      = 'Halo Custom Edition.',
	pc      = 'Halo: Combat Evolved (aka Halo PC).',
	trial   = 'Halo Trial.',
	mac     = 'Halo: Combat Evolved for Mac.',
	macdemo = 'Halo Trial for Mac.',
	beta    = 'Halo Beta.',
}
type MasterServer = keyof typeof MasterServers;
type ServerArg = Optional<ServerAddress, 'port'> | MasterServer;

const CLI_MASTER_NAME_TRANSLATE =
	Object.freeze<Record<MasterServer, keyof typeof GameKeys>>({
		beta:    'halo',
		trial:   'halod',
		macdemo: 'halomacd',
		mac:     'halomac',
		ce:      'halom',
		pc:      'halor',
	});

/**
 * Parses CLI arguments for IPs into an intelligible list.
 */
function parseIPs(value: string, argList: ServerArg[] = []): ServerArg[] {
	let arg: ServerArg;

	if (Object.keys(MasterServers).includes(value)) {
		arg = value as MasterServer;
	} else {
		const [ip, portStr] = value.split(':');
		const port = portStr ? Number.parseInt(portStr) : undefined;

		if (!IP_REGEX.test(ip) || (
			port && (Number.isNaN(port) || port < 1 || port > 0xFFFF)
		)) {
			console.error(`Error: Invalid server argument "${value}"!`);
			console.error([
				'Server arguments must either be an IP in the form of',
				'111.222.333.444 or 111.222.333.4444:55555,',
				'or a known master server name',
				`(${Object.keys(MasterServers)
					.map(name => `"${name}"`)
					.join(', ')
				}).`,
			].join(' '));
			process.exit(1);
		}

		arg = { ip, port };
	}

	return [...argList, arg];
}

const cliArgs = new Command()
	.name('halo-query')
	.description('Queries and prints Halo game server information.')
	.allowExcessArguments(false)
	.allowUnknownOption(false)
	.argument(
		'<servers...>',
		[
			'A list of server IPs to query (e.g. 111.222.333.444:1234).\n\n',
			'Also supports several keywords for querying all servers known to',
			"the respective game's master server.\n",
			...Object.entries(MasterServers).map(([name, desc]) => (
				`\t${name.padEnd(10)}${desc}\n`
			)),
		].join(' '),
		parseIPs,
	)
	.option('-j --json', 'Output as JSON.', true)
	.option('-m --master-server-host <string>', 'Override default master server host / IP.', 'TODO')
	.option('-p --port <number>', 'Override default UDP port.', 'TODO')
	.option('-t --timeout <number>', 'Request timeout in milliseconds.', 'TODO')
	.addOption(new Option('-r, --raw', 'Output as raw query response string.')
		.default(false)
		.conflicts('json')
	)
	.addOption(new Option('--pretty', 'Pretty-print JSON output. Implies --json.')
		.default(false)
		.implies({ json: true })
	)
	.version(PACKAGE.version)
	.parse(process.argv);

async function main() {
	// FIXME all very temporary stuff to show things off for now.
	const server = cliArgs.processedArgs[0];
	if (!server) {
		throw new Error('Master server required (for now)');
	}
	// @ts-ignore
	const gameName = CLI_MASTER_NAME_TRANSLATE[server];

	const list = await getMasterServerList(gameName);

	console.log(JSON.stringify(list, null, 2));
}
main();