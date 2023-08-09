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
import { Optional } from 'utility-types';

import { GameKeys, MasterServer } from './gamespy';
import { resolveServers } from './handler';
import { ServerAddress } from './network';

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
type CLIAddress = Optional<ServerAddress, 'port'>;
type CLIServerArg = CLIAddress | MasterServer;

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
		parseServer,
	)
	.option('-a --address-only', 'Only output server addresses', false)
	.option('-j --json', 'Output as JSON.')
	.option('-m --master-server-host <string>', 'Override default master server host / IP.')
	.option('-p --port <number>', 'Override default UDP port for game servers.', parsePort)
	.option('-t --timeout <number>', 'Request timeout in milliseconds.', Number.parseInt)
	.addOption(new Option('-r, --raw', 'Output as raw query response string.')
		.default(false)
		.conflicts('json')
	)
	.addOption(new Option('--pretty', 'Pretty-print JSON output. Implies --json.')
		.default(false)
		.conflicts('raw')
	)
	.version(PACKAGE.version)
	.parse(process.argv);

/**
 * Parses CLI arguments for IPs into an intelligible list.
 * Translates human-friendly master server names to internal GameSpy names.
 * Parses IP/port addresses into objects.
 */
function parseServer(value: string, previous: CLIServerArg[]): CLIServerArg[] {
	let arg: CLIServerArg;

	if (Object.keys(CLIMasterServer).includes(value)) {
		arg = CLI_MASTER_NAME_TRANSLATE[value as CLIMasterServerName];
	} else {
		const [address, portStr] = value.split(':');
		const port = portStr ? Number.parseInt(portStr) : undefined;

		if (!IP_REGEX.test(address) || (port && !isValidPort(port))) {
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

		arg = { address, port };
	}

	return [...previous ?? [], arg];
}

/** Parses and validates a port number. */
function parsePort(value: string): number {
	const port = Number.parseInt(value);
	if (!isValidPort(port)) {
		throw new Error(`Invalid port: ${port}`);
	}
	return port;
}

function isValidPort(port: number): boolean {
	return !Number.isNaN(port) && 0 < port && port < 0xFFFF;
}

async function main() {
	const serverArgs = (cliArgs.processedArgs[0] as CLIServerArg[]);
	const defaultPort = cliArgs.getOptionValue('port') ?? DEFAULT_SERVER_PORT;

	const servers = await resolveServers(
		serverArgs.map(arg => typeof arg === 'string' ? arg : {
			address: arg.address,
			port: arg.port ?? defaultPort,
		})
	);

	if (cliArgs.getOptionValue('addressOnly')) {
		if (cliArgs.getOptionValue('raw')) {
			servers.forEach(server => {
				console.log(`\\game\\${server.game}\\ip\\${server.address}\\port\\${server.port}`);
			});
		}
		else {
			if (cliArgs.getOptionValue('pretty')) {
				console.log(JSON.stringify(servers, null, 2));
			} else {
				console.log(JSON.stringify(servers));
			}
		}
	}
	else {

	}
}
main();
