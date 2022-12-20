import {path, log} from "./deps.ts";

import {Edit} from "./types.ts";
import {readYaml} from "./utils.ts";

export default class Runner {
    private readonly mkvpropedit: string;

    constructor(mkvpropedit: string) {
        this.mkvpropedit = mkvpropedit;
    }

    async runBatch(automkv: string): Promise<boolean> {
        const yml = readYaml(automkv);
        if (!yml) return true;

        for (const batch of yml) {
            const folder = path.join(path.dirname(automkv), batch.watch.folder || '.');
            for await (const file of Deno.readDir(folder))
                if (file.name.match(batch.watch.files))
                    return this.runEdits(path.join(folder, file.name), batch.edits);
        }

        return true;
    }

    async runEdits(file: string, edits: Edit[]): Promise<boolean> {
        if (!edits || edits.length == 0)
            return true;

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
            .then(s => s.success);
    }
}