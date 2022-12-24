import {path, log} from "./deps.ts";

import {Edit} from "./types.ts";
import {readYaml} from "./utils.ts";

export default class Runner {
    private readonly mkvpropedit: string;

    constructor(mkvpropedit: string) {
        this.mkvpropedit = mkvpropedit;
    }

    async batch(automkv: string): Promise<number> {
        const yml = readYaml(automkv);
        if (!yml) return 0;

        const promises = [];
        for (const batch of yml) {
            const folder = path.join(path.dirname(automkv), batch.watch.folder || '.');
            for await (const file of Deno.readDir(folder))
                if (file.name.match(batch.watch.files))
                    promises.push(this.edits(path.join(folder, file.name), batch.edits));
        }

        return Promise.all(promises).then((mods: number[]) => mods.reduce((a, b) => a + b));
    }

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
}