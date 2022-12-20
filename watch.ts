import {path, log} from "./deps.ts";

import {readYaml} from "./utils.ts";
import Runner from "./runner.ts";

const watched = new Map<string, Deno.FsWatcher[]>();

export function watch(ymlPath: string, runner: Runner): void {
    const yml = readYaml(ymlPath);
    if (!yml) return;

    const watching = [];
    for (const batch of yml) {
        const folder = path.join(path.dirname(ymlPath), batch.watch.folder);
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
                setTimeout(() => {
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
                            if (!runner.runEdits(file, batch.edits)) {
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

export async function watchAutoFiles(runner: Runner) {
    const dir = path.join(Deno.cwd(), Deno.args[1]);
    for await (const entry of Deno.readDir(dir)) {
        if (entry.name.endsWith("automkv.yml")) {
            const file = path.join(dir, entry.name);
            log.info(`Watching ${file}`);
            watch(file, runner);
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
                watch(path, runner);
                break;
            case "modify":
                log.info(`Updating ${path}`);
                unwatch(path);
                watch(path, runner);
                break;
            case "remove":
                log.info(`Removing ${path}`);
                unwatch(path);
                break;
        }
    }
}