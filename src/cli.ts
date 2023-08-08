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

import { GameKeys } from './gamespy';
import { ServerArg, getServersGroupedByGame } from './handler';

const PACKAGE = require('../package.json');

const DEFAULT_SERVER_PORT = 2302;
const IP_REGEX = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

enum CLIMasterServer {
	ce      = 'Halo Custom Edition.',
	pc      = 'Halo: Combat Evolved (aka Halo PC).',
	trial   = 'Halo Trial.',
	mac     = 'Halo: Combat Evolved for Mac.',
	macdemo = 'Halo Trial for Mac.',
	beta    = 'Halo Beta.',
}
type CLIMasterServerName = keyof typeof CLIMasterServer;

const CLI_MASTER_NAME_TRANSLATE =
	Object.freeze<Record<CLIMasterServerName, keyof typeof GameKeys>>({
		beta:    'halo',
		trial:   'halod',
		macdemo: 'halomacd',
		mac:     'halomac',
		ce:      'halom',
		pc:      'halor',
	});

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
			...Object.entries(CLIMasterServer).map(([name, desc]) => (
				`\t${name.padEnd(10)}${desc}\n`
			)),
		].join(' '),
	)
	.option('-j --json', 'Output as JSON.', true)
	.option('-m --master-server-host <string>', 'Override default master server host / IP.', 'TODO')
	.option('-p --port <number>', 'Override default UDP port.', `${DEFAULT_SERVER_PORT}`)
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

/**
 * Parses CLI arguments for IPs into an intelligible list.
 * Translates human-friendly master server names to internal GameSpy names.
 * Parses IP/port addresses into objects, setting a default port if one wasn't
 * provided.
 */
function translateServer(value: string, defaultPort: number): ServerArg {
	if (Object.keys(CLIMasterServer).includes(value)) {
		return CLI_MASTER_NAME_TRANSLATE[value as CLIMasterServerName];
	} else {
		const [address, portStr] = value.split(':');
		const port = portStr ? Number.parseInt(portStr) : undefined;

		if (!IP_REGEX.test(address) || (
			port && (Number.isNaN(port) || port < 1 || port > 0xFFFF)
		)) {
			console.error(`Error: Invalid server argument "${value}"!`);
			console.error([
				'Server arguments must either be an IP in the form of',
				'111.222.333.444 or 111.222.333.4444:55555,',
				'or a known master server name',
				`(${Object.keys(CLIMasterServer)
					.map(name => `"${name}"`)
					.join(', ')
				}).`,
			].join(' '));
			process.exit(1);
		}

		return {
			address,
			port: port ?? defaultPort,
		};
	}
}

async function main() {
	const servers: string[] = cliArgs.processedArgs[0];
	const defaultPort = Number.parseInt(cliArgs.getOptionValue('port'));

	const parsed = servers.map(server => translateServer(server, defaultPort));
	const maps = await getServersGroupedByGame(parsed);
	console.log(maps);
}
main();
