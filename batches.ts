import {log, yaml} from "./deps.ts";

export type Batch = {
    watch: {
        folder: string;
        files: RegExp;
    };
    edits?: Edit[];
    chapters?: string[];
};
export type Edit = {
    edit: string;
    set: Map<string, string>;
};

export function readAutoMKV(ymlPath: string): Batch[] {
    const yml = (yaml.parse(Deno.readTextFileSync(ymlPath)) as { batch: Batch[] }).batch;
    if (!yml) {
        log.warning(`Invalid file: ${ymlPath}`);
        log.warning("Expecting root element to be 'batch'");
        log.warning("This file will be skipped.")
        throw new Error("Improper YAML file");
    }
    // While functionally a map, we need to make it official
    for (const batch of yml) {
        batch.watch.files = new RegExp(batch.watch.files);
        if (batch.edits)
            for (const edit of batch.edits)
                edit.set = new Map(Object.entries(edit.set));
    }

    return yml;
}