import * as path from "https://deno.land/std/path/mod.ts";
import * as yaml from "https://deno.land/std@0.82.0/encoding/yaml.ts";
import * as log from "https://deno.land/std/log/mod.ts";

type Batch = {
    watch: {
        folder: string;
        files: string;
    };
    edits: Edit[];
};

type Edit = {
    edit: string;
    set: object;
};

function printUsage() {
    console.log("Usage:");
    console.log("  automkv watch <folder>");
    console.log("    Monitor the target folder (and subfolders) for files ending in");
    console.log("    'automkv.yml'.  Any files found will have their destination folders");
    console.log("    monitored for changes, and the edits in the file will run when any");
    console.log("    updates have finished.");
    console.log("  automkv run <target_file>");
    console.log("    Apply the edits in a 'automkv.yml' file immediately to all target");
    console.log("    files in the target folder");
    Deno.exit(0);
}

async function getExe(exe: string): Promise<string> {
    const env = exe.toUpperCase();
    let file = Deno.env.get(env);
    if (!file) {
        console.log(`Autodetecting ${exe}...`);
        const decoder = new TextDecoder();
        if (Deno.build.os == "windows") {
            file = await Deno.run({
                cmd: ["powershell", "-c", `(gcm ${exe}).Source`],
                stdout: "piped"
            })
                .output()
                .then(o => decoder.decode(o))
                .then(o => {
                    if (o.indexOf("is not recognized") > -1) return Promise.reject();
                    return o;
                })
                .catch(async () =>
                    Deno.run({
                        cmd: ["powershell", "[Environment]::GetFolderPath('ProgramFiles')"],
                        stdout: "piped"
                    })
                        .output()
                        .then(o => decoder.decode(o))
                        .then(async programFiles => {
                            programFiles = programFiles.trim();
                            programFiles = path.join(programFiles, "MKVToolNix");
                            const dir = Deno.readDir(programFiles);
                            for await (const file of dir) {
                                if (file.name.toLowerCase() === exe.toLowerCase() + ".exe")
                                    return path.join(programFiles, file.name);
                            }
                            return undefined;
                        }))
                .catch(() => undefined);
        } else {
            const process = Deno.run({cmd: ["which", exe], stdout: "piped"});
            file = await process.status()
                .then(s => s.code)
                .then(s => {
                    if (s === 0) return process.output();
                    throw "Failed";
                })
                .then(o => decoder.decode(o))
                .catch(() => undefined);
        }
        if (file && (file = file.trim()).length > 0) {
            console.log("Detected " + file);
            console.log("To skip this in the future, set the environment variable", env);
        } else {
            console.error(`Failed to find ${exe}.  Ensure it's in your path, or provide it by setting`);
            console.error(`the environment variable ${env} to the correct value.`);
            Deno.exit(1);
        }
    }
    return file;
}

const watched = new Map<string, Deno.FsWatcher[]>();
const mkvpropedit = await getExe("mkvpropedit");
const mkvextract = await getExe("mkvextract");

function readYaml(ymlPath: string): Batch[] | undefined {
    const yml = (yaml.parse(Deno.readTextFileSync(ymlPath)) as { batch: Batch[] }).batch;
    if (!yml) {
        log.warning(`Invalid file: ${ymlPath}`);
        log.warning("Expecting root element to be 'batch'");
        log.warning("This file will be skipped.")
        return undefined;
    }
    return yml;
}

function watch(ymlPath: string): void {
    const yml = readYaml(ymlPath);
    if (!yml) return;

    const watching = [];
    for (const batch of yml) {
        const folder = path.join(path.dirname(ymlPath), batch.watch.folder || '.');
        Deno.mkdirSync(folder, {recursive: true});
        const watcher = Deno.watchFs(folder);
        watching.push(watcher);
        (async function () {
            const processing = new Set<string>();
            const queued = new Set<string>();
            for await (const event of watcher) {
                if (event.paths.length < 1) continue;

                const file = event.paths[0];
                if (!file.match(batch.watch.files)) continue;
                if (["create", "modify"].indexOf(event.kind) < 0) continue;

                // If this update is because of us, ignore it
                if (processing.delete(file)) {
                    log.debug("unprocess", event.kind);
                    continue;
                }
                // Ensure operation is actually finished
                if (queued.has(file)) {
                    log.debug("queue skip", event.kind);
                    continue;
                }
                queued.add(file);
                setTimeout(async () => {
                    // Check for write locks
                    log.debug("Write test")
                    Deno.open(file, {write: true})
                        .then(h => Deno.close(h.rid))
                        .then(() => {
                            if (processing.has(file)) {
                                log.debug("skip", event.kind);
                                return;
                            }
                            processing.add(file);
                            log.debug("process", event.kind);
                            if (!runEdits(file, batch.edits)) {
                                processing.delete(file);
                            }
                        })
                        .catch(() => log.warning(`Waiting for file to become ready: ${file}`))
                        .then(() => queued.delete(file));
                }, 100);
            }
        })();
    }
    watched.set(ymlPath, watching);
}

function unwatch(automkv: string): void {
    if (watched.has(automkv)) {
        for (const watcher of watched.get(automkv) || [])
            watcher.close();
        watched.delete(automkv);
    }
}

function runBatch(automkv: string): void {
    const yml = readYaml(automkv);
    if (!yml) return;

    for (const batch of yml) {
        const folder = path.join(path.dirname(automkv), batch.watch.folder || '.');
        (async function () {
            for await (const file of Deno.readDir(folder))
                if (file.name.match(batch.watch.files))
                    await runEdits(path.join(folder, file.name), batch.edits);
        })();
    }
}

async function runEdits(file: string, edits: Edit[]): Promise<boolean> {
    if (!edits || edits.length == 0)
        return true;

    log.info(`Running edits ${JSON.stringify(edits)} on ${file}`);
    const cmd = [mkvpropedit, file];
    for (const edit of edits) {
        cmd.push("--edit", edit.edit);
        for (let [key, value] of Object.entries(edit.set))
            cmd.push("--set", `${key}=${value}`);
    }
    log.debug(cmd.join(' '));
    return Deno.run({cmd: cmd, stdout: "inherit", stderr: "inherit"})
        .status()
        .then(s => s.success);
}

/* Main code */

console.log("Running automkv with versions:");
let process = Deno.run({cmd: [mkvpropedit, "--version"], stdout: "inherit", stderr: "inherit"});
await process.status();
process = Deno.run({cmd: [mkvextract, "--version"], stdout: "inherit", stderr: "inherit"});
await process.status();
console.log();

if (Deno.args.length < 2)
    printUsage();

switch (Deno.args[0]) {
    case "watch":
        const dir = path.join(Deno.cwd(), Deno.args[1]);
        for await (const entry of Deno.readDir(dir)) {
            if (entry.name.endsWith("automkv.yml")) {
                const file = path.join(dir, entry.name);
                log.info(`Watching ${file}`);
                watch(file);
            }
        }
        const watcher = Deno.watchFs(dir, {recursive: true});
        for await (const event of watcher) {
            if (event.paths.length < 1) continue;

            const path = event.paths[0];
            if (!path.endsWith("automkv.yml")) continue;

            switch (event.kind) {
                case "create":
                    log.info(`Watching ${path}`);
                    watch(path);
                    break;
                case "modify":
                    log.info(`Updating ${path}`);
                    unwatch(path);
                    watch(path);
                    break;
                case "remove":
                    log.info(`Removing ${path}`);
                    unwatch(path);
                    break;
            }
        }
        break;
    case "run":
        runBatch(Deno.args[1]);
        break;
    case "help":
    case "--help":
    case "-?":
        printUsage();
        break;
    default:
        console.error("Unexpected argument:", Deno.args[0]);
        printUsage();
        break;
}
