import {path, log} from "./deps.ts";

import Job, {Edit} from "./job.ts";

export default class Runner {
    private readonly decoder: TextDecoder = new TextDecoder();
    private readonly encoder: TextEncoder = new TextEncoder();
    private readonly mkvpropedit: string;
    private readonly mkvextract: string;

    /**
     * Create a new Runner using the provided instances of `mkvpropedit` and
     * `mkvextract`.
     *
     * @param mkvpropedit   Path to the `mkvpropedit` executable
     * @param mkvextract    Path to the `mkvextract` executable
     */
    constructor(mkvpropedit: string, mkvextract: string) {
        this.mkvpropedit = mkvpropedit;
        this.mkvextract = mkvextract;
    }

    /**
     * Directly run a job.  Loops through the batches in the job and runs
     * Runner#edits and Runner#chapters as appropriate.
     *
     * @param job   The job to run
     */
    async job(job: Job): Promise<number> {
        const promises = [];
        for (const batch of job.batches) {
            if (!batch.edits && !batch.chapters) continue;
            const folder = path.join(path.dirname(job.file), batch.watch.folder || '.');
            for await (const entry of Deno.readDir(folder))
                if (entry.name.match(batch.watch.files)) {
                    const file = path.join(folder, entry.name);
                    if (batch.edits)
                        promises.push(this.edits(file, batch.edits));
                    if (batch.chapters)
                        promises.push(this.chapters(file, batch.chapters));
                }
        }

        return Promise.all(promises).then((mods: number[]) => mods.reduce((a, b) => a + b));
    }

    /**
     * Apply `mkvpropedit` edits to an MKV file.  These edits are passed in a
     * `{edit: "key", set: "value"}` format, such that the behavior is
     * equivalent to:
     * ```
     * mkvpropedit <file> --edit key --set value
     * ```
     * Multiple edits are passed within the same command.
     *
     * @param file      The file to edit
     * @param edits     The edits to be performed
     */
    async edits(file: string, edits: Edit[]): Promise<number> {
        if (!edits || edits.length == 0)
            return 0;

        log.info(`Running edits ${JSON.stringify(edits)} on ${file}`);
        const cmd = [this.mkvpropedit, file];
        for (const edit of edits) {
            cmd.push("--edit", edit.edit);
            for (const [key, value] of edit.set.entries())
                cmd.push("--set", `${key}=${value}`);
        }
        log.debug(cmd.join(' '));
        return await Deno.run({cmd: cmd, stdout: "inherit", stderr: "inherit"})
            .status()
            .then(s => s.success ? 1 : 0);
    }

    /**
     * Sets the provided MKV's chapters to the provided values, as long as the
     * actual number of chapters matches the number provided.  Returns the
     * number of times the file was modified.
     *
     * @param file      The file whose chapters will be updated
     * @param chapters  The new chapters to write
     */
    async chapters(file: string, chapters: string[]): Promise<number> {
        if (!chapters)
            return 0;

        log.info(`Updating ${chapters.length} chapters for ${file}`);
        const markers = await this.getChapterMarkers(file);
        log.debug(`Found chapter markers at ${markers.join(', ')}`);
        if (chapters.length !== markers.length) {
            log.warning(`Expected ${chapters.length} chapters, found ${markers.length} for ${file}`);
            return 0;
        }
        let chapterData = "";
        for (const i in markers) {
            const id = ((i + 1) as string).padStart(2, "0");
            chapterData += "CHAPTER" + id + "=" + markers[i] + "\n";
            chapterData += "CHAPTER" + id + "NAME=" + chapters[i] + "\n";
        }
        const chapterFile = file + "-chapters";
        Deno.writeFileSync(chapterFile, this.encoder.encode(chapterData));
        const cmd = [this.mkvpropedit, file, "-c", chapterFile];
        log.debug(cmd.join(' '));
        return await Deno.run({cmd: cmd, stdout: "inherit", stderr: "inherit"})
            .status()
            .then(s => s.success ? 1 : 0);
    }

    /**
     * Gets the chapter markers from an MKV file using `mkvextract`.  Converts
     * the output into an array of timecodes.
     *
     * @param file  The file from which to extract chapter markers
     * @private     Internally used by Runner#chapters
     */
    private async getChapterMarkers(file: string) {
        const cmd = [this.mkvextract, "chapters", file, "-s"];
        log.debug(cmd.join(' '));
        const output = await Deno.run({cmd: cmd, stdout: "piped", stderr: "inherit"}).output();
        return this.decoder
            .decode(output)
            .split("\n")
            .filter((_e, i) => i % 2 == 0)
            .map(s => s.trim())
            .filter(s => s.length > 0)
            .map(s => s.split('=')[1]);
    }
}