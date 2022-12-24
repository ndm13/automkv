# automkv
Automate MKVToolNix with the power of Deno and YAML.

## Prerequisites
Install [MKVToolNix](https://mkvtoolnix.download/downloads.html), or add the
following executables to your path:
- `mkvpropedit`
- `mkvextract`

These are included with MKVToolNix.  Alternatively, you can set the paths to
these files directly in the `MKVPROPEDIT` and `MKVEXTRACT` environment
variables, respectively.

## Installation
Download the [latest release](https://github.com/ndm13/automkv/releases) for
your platform, or build yourself using Deno:
```shell
git clone https://github.com/ndm13/automkv.git
deno compile --allow-run --allow-env --allow-read --allow-write automkv.ts
```
We require the following permissions:
- `allow-run` to interface with `mkvpropedit`/`mkvextract`
- `allow-env` to load alternate paths from environment variables
- `allow-read` to load configuration files
- `allow-write` to verify MKV files aren't locked before editing

## Usage
```shell
automkv watch [automkv-yaml-file]
```
Watches all the directories specified in the provided `automkv.yml` file for
new media, and will apply the edits to those files.
```shell
automkv watch [folder-name]
```
Scans a folder recursively for any `automkv.yml` files, and watches for new
ones to be added.  For any files it finds it will watch all the directories
specified in those file for new media, and will apply the edits to those files.

```shell
automkv run [automkv-yaml-file]
```
Directly runs an `automkv.yml` script (one time) and applies the edits to the
files in the script.

## `automkv.yml`
This is the script format for automkv.  When using `automkv watch [folder]`,
any file that *ends* in `automkv.yml` is monitored, so you could use
`tv-show-name.automkv.yml` for instance.

Included is an example file (`automkv.example.yml`) to get you started:
```yml
batch:                                  # Every file has a root batch element
  - watch:                              # Watch as many folders as you want
      folder: Season 1                  # Folder name is static
      files: S01E\d{2}\.mkv             # but file name is a RegExp
    edits:                              # Edits are per-track
      - edit: track:a2                  # Specify using mkvpropedit syntax
        set:                            # Set values to update
          flag-commentary: 1            # Booleans are 1/0 as per spec
          name: Director's Commentary   # Strings don't need any special formatting
```
The commands under `edits` use the same formatting as `mkvpropedit` and are
passed more or less unchanged: see [the guide](https://mkvtoolnix.download/doc/mkvpropedit.html)
for more details.