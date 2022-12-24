import {log, path} from "./deps.ts";

import {reduceVoid, reduceVoidPromise} from "./utils.ts";
import Runner from "./runner.ts";
import Job from "./job.ts";

export type Watch = {
    /**
     * Cancels this watch, closing underlying system resources and preventing
     * new events from being received.
     */
    cancel: () => void;

    /**
     * A promise that returns when the underlying watch is closed.  This will
     * likely block until cancel is called.
     */
    promise: Promise<void>;
}

export default class Watcher {
    readonly runner;

    /**
     * Creates a Watcher.  See Watcher#file and Watcher#folder for more details
     * on usage.
     *
     * @param runner    The runner to use when changes are detected
     */
    constructor(runner: Runner) {
        this.runner = runner;
    }

    /**
     * Watch a job.  When any files covered by this job are modified, then this
     * job will be run against those files.
     *
     * @param job   The job to watch
     */
    file(job: Job): Watch {
        return job.batches.map(batch => this.watch(
            path.join(path.dirname(job.file), batch.watch.folder),
            batch.watch.files,
            file => {
                const promises = [];
                if (batch.edits)
                    promises.push(this.runner.edits(file, batch.edits));
                if (batch.chapters)
                    promises.push(this.runner.chapters(file, batch.chapters));
                return Promise
                    .all(promises)
                    .then((edits: number[]) => edits.reduce((a, b) => a + b));
            })
        ).reduce((last, current) => {
            return {
                cancel: reduceVoid(last.cancel, current.cancel),
                promise: reduceVoidPromise(last.promise, current.promise)
            };
        });
    }

    /**
     * Watch a folder for job files.  When these files are detected, their jobs
     * will be watched also.  Note that this will not run the detected jobs,
     * but will run them on any files changed after the watch has started.
     *
     * @param folder    The folder (and subfolders) to watch for jobs
     */
    folder(folder: string): Watch {
        const watching = new Map<string, Watch>();
        const dir = path.join(Deno.cwd(), folder)
        for (const entry of Deno.readDirSync(dir)) {
            if (entry.name.endsWith("automkv.yml")) {
                const file = path.join(dir, entry.name);
                log.info(`Watching ${file}`);
                const job = this.safeGetJob(file);
                if (job) watching.set(file, this.file(job));
            }
        }
        const watcher = Deno.watchFs(dir, {recursive: true});
        const promise = async () => {
            for await (const event of watcher) {
                if (event.paths.length < 1) continue;

                const file = event.paths[0];
                if (!file.endsWith("automkv.yml")) continue;

                switch (event.kind) {
                    case "create": {
                        log.info(`Discovered ${file}`);
                        const job = this.safeGetJob(file);
                        if (job) watching.set(file, this.file(job));
                        break;
                    }
                    case "modify": {
                        log.info(`Updating ${file}`);
                        if (watching.has(file))
                            (watching.get(file) as Watch).cancel();
                        const job = this.safeGetJob(file);
                        if (job) watching.set(file, this.file(job));
                        break;
                    }
                    case "remove": {
                        log.info(`Removing ${file}`);
                        (watching.get(file) as Watch).cancel();
                        watching.delete(file);
                        break;
                    }
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

    /**
     * Watch a folder for changes.  When any changes are detected in files that
     * match the provided filter, then the update will fire.  The update should
     * return the number of times the file was modified.
     *
     * @param folder    The folder to watch
     * @param filter    The filter to apply to files within that folder
     * @param update    The update to run - should return # of modifications
     * @private         Currently only used internally due to complexity
     */
    private watch(folder: string, filter: RegExp, update: (file: string) => Promise<number>): Watch {
        Deno.mkdirSync(folder, {recursive: true});
        const watcher = Deno.watchFs(folder);
        const promise = async () => {
            const latch = new Map<string, number>();
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

    /**
     * Creates a Job from the specified file path, logging to the console if it
     * fails and returning `undefined`.
     *
     * @param file  The file to pass to Job
     * @private     Logs to console, internal use
     */
    private safeGetJob(file: string): Job | undefined {
        try {
            return new Job(file);
        } catch (e) {
            if (e instanceof Job.InvalidJobException)
                log.error(`Skipping invalid job ${file}: ${e.message}`);
            else
                throw e;
        }
    }
}