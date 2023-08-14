# Halo Query

<a href="LICENSE.md"><img align="right" alt="AGPL-3.0 Logo"
src="https://www.gnu.org/graphics/agplv3-155x51.png">
</a>

A library and command-line application for querying Gearbox Halo multiplayer
game servers and master servers.

Works with:
- Halo: Combat Evolved
- Halo Custom Edition
- Halo Trial
- Halo: Combat Evolved for Mac
- Halo Trial for Mac
- Halo Beta

## Examples

```bash
# Outputs info for all Halo Custom Edition game servers as a JSON list.
halo-query ce

# Outputs info for the game servers hosted at these IPs and ports
halo-query 1.2.3.4:5555 6.7.8.9:1111

# Outputs the game server info as a string instead of JSON
halo-query --raw 1.2.3.4:5555

# Get the full usage
halo-query --help
```

## Installation

```bash
git clone https://github.com/Sigmmma/HaloQuery.git
cd HaloQuery
npm install
npm build
npm link .
```

Now you can run the script from your shell as `halo-query`.

## License

Copyright 2023 [Mimickal](https://github.com/Mimickal)<br/>
This code is licensed under the [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0-standalone.html) license.<br/>
Basically, any modifications to this code must be made open source.
