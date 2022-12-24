import {log, path} from "./deps.ts";

import {readYaml, reduceVoid, reduceVoidPromise} from "./utils.ts";
import Runner from "./runner.ts";
import {Watch} from "./types.ts";

export default class Watcher {
    readonly runner;

    constructor(runner: Runner) {
        this.runner = runner;
    }

    file(configPath: string): Watch {
        return readYaml(configPath).map(batch => this.watch(
            path.join(path.dirname(configPath), batch.watch.folder),
            batch.watch.files,
            file => this.runner.edits(file, batch.edits))
        ).reduce((last, current) => {
            return {
                cancel: reduceVoid(last.cancel, current.cancel),
                promise: reduceVoidPromise(last.promise, current.promise)
            };
        });
    }

    folder(folder: string): Watch {
        const watching = new Map<string, Watch>();
        const dir = path.join(Deno.cwd(), folder)
        for (const entry of Deno.readDirSync(dir)) {
            if (entry.name.endsWith("automkv.yml")) {
                const file = path.join(dir, entry.name);
                log.info(`Watching ${file}`);
                watching.set(file, this.file(file));
            }
        }
        const watcher = Deno.watchFs(dir, {recursive: true});
        const promise = async () => {
            for await (const event of watcher) {
                if (event.paths.length < 1) continue;

                const path = event.paths[0];
                if (!path.endsWith("automkv.yml")) continue;

                switch (event.kind) {
                    case "create":
                        log.info(`Discovered ${path}`);
                        watching.set(path, this.file(path));
                        break;
                    case "modify":
                        log.info(`Updating ${path}`);
                        if (watching.has(path))
                            (watching.get(path) as Watch).cancel();
                        watching.set(path, this.file(path));
                        break;
                    case "remove":
                        log.info(`Removing ${path}`);
                        (watching.get(path) as Watch).cancel();
                        watching.delete(path);
                        break;
                }
            }
            for (const watch of watching.values())
                watch.cancel();
        };
        return {
            cancel: () => watcher.close(),
            promise: promise()
        };
    }

    private watch(folder: string, filter: RegExp, update: (file: string) => Promise<number>): Watch {
        Deno.mkdirSync(folder, {recursive: true});
        const watcher = Deno.watchFs(folder);
        const promise = async () => {
            const latch = new Map<string,number>();
            for await (const event of watcher) {
                if (event.paths.length < 1) continue;
                const file = event.paths[0];
                if (event.kind !== "modify") continue;
                if (!filter.test(file)) continue;

                /*
                Countdown latch pattern: if an update makes multiple
                modifications, then we want to wait for them all to finish
                before watching for external changes.
                 */
                if (latch.has(file)) {
                    const countdown = latch.get(file) as number;
                    if (countdown <= 0) {
                        latch.delete(file);
                    } else {
                        latch.set(file, countdown - 1);
                        continue;
                    }
                }

                await Deno.open(file, {write: true})
                    .then(h => Deno.close(h.rid))
                    .then(() => update(file))
                    .then(i => latch.set(file, i))
                    .catch(() => log.warning(`Waiting for file to become ready: ${file}`));
            }
        };
        return {
            cancel: () => watcher.close(),
            promise: promise()
        }
    }
}