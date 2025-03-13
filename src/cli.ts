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
import {
	Server,
	ServerResponse,
	queryServerInfo,
	resolveServers,
} from './handler';
import { ServerAddress } from './network';
import { parseServerInfo } from './response';

const PACKAGE = require('../package.json');

const DEFAULT_SERVER_PORT = 2302;

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
	.option('-m --master-server-host <string>', 'Override default master server host / IP.', parseCLIAddress)
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
		arg = parseCLIAddress(value);
	}

	return [...previous ?? [], arg];
}

/** Parses a string address into an IP and a port. */
function parseCLIAddress(value: string): CLIAddress {
	const [address, portStr] = value.split(':');
	const port = portStr ? parsePort(portStr) : undefined;
	return { address, port };
}

/** Parses and validates a port number. */
function parsePort(value: string): number {
	const port = Number.parseInt(value);
	if (Number.isNaN(port) || 0 > port || port > 0xFFFF) {
		throw new Error(`Invalid port: ${port}`);
	}
	return port;
}

/** Stringifies a Server. */
function serverString(server: Server | ServerResponse): string {
	return `\\game\\${server.game}\\ip\\${server.address}\\port\\${server.port}`;
}

async function main() {
	const serverArgs = (cliArgs.processedArgs[0] as CLIServerArg[]);
	const printAddressOnly: boolean          = cliArgs.getOptionValue('addressOnly');
	const msOverride: CLIAddress | undefined = cliArgs.getOptionValue('masterServerHost');
	const prettyPrintJson: boolean           = cliArgs.getOptionValue('pretty');
	const defaultPort: number                = cliArgs.getOptionValue('port') ?? DEFAULT_SERVER_PORT;
	const printRawText: boolean              = cliArgs.getOptionValue('raw');
	const timeout: number | undefined        = cliArgs.getOptionValue('timeout');

	let servers: Server[];
	try {
		servers = await resolveServers(
			serverArgs.map(arg => typeof arg === 'string' ? arg : {
				address: arg.address,
				port: arg.port ?? defaultPort,
			}),
			{
				host: msOverride?.address,
				port: msOverride?.port,
				timeout,
			}
		);
	} catch (err) {
		console.error((err as Error).message);
		process.exit(1);
	}

	if (printAddressOnly) {
		if (printRawText) {
			servers.forEach(server => {
				console.log(serverString(server));
			});
		}
		else {
			if (prettyPrintJson) {
				console.log(JSON.stringify(servers, null, 2));
			} else {
				console.log(JSON.stringify(servers));
			}
		}
	}
	else {
		const responses = await queryServerInfo(servers);

		if (printRawText) {
			responses?.forEach(response => {
				console.log(`${serverString(response)}${response.data}`);
			});
		}
		else {
			const parsed = responses?.map(resp => ({
				...resp,
				data: parseServerInfo(resp.data as string),
			}))

			if (prettyPrintJson) {
				console.log(JSON.stringify(parsed, null, 2));
			} else {
				console.log(JSON.stringify(parsed));
			}
		}
	}
}
main();
