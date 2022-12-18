# automkv
Automate MKVToolNix using Deno

## Usage
```shell
automkv watch folder
```
Scans a folder recursively for any `automkv.yml` files, and watches for new
ones to be added.  For any files it finds it will watch all the directories
specified in those file for new media, and will apply the edits to those files.

```shell
automkv run automkv.yml
```
Directly runs an `automkv.yml` script (one time) and applies the edits to the
files in the script.

## `automkv.yml`
This is the script format for automkv.  When using `automkv watch`, any file
that *ends* in `automkv.yml` is monitored, so you could use `tv-show-name.automkv.yml`
for instance.

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