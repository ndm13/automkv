import {yaml} from "./deps.ts";

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

export class InvalidJobException extends Error {
    constructor(message: string) {
        super(message);
        this.name = this.constructor.name;
    }
}

export default class Job {
    readonly file: string;
    readonly batches: Batch[];
    constructor(file: string) {
        this.file = file;
        const yml = (yaml.parse(Deno.readTextFileSync(file)) as { batch: Batch[] }).batch;
        if (!yml)
            throw new InvalidJobException("Improper YAML file: expected root element to be 'batch'");

        // While functionally a map, we need to make it official
        for (const batch of yml) {
            batch.watch.files = new RegExp(batch.watch.files);
            if (batch.edits)
                for (const edit of batch.edits)
                    edit.set = new Map(Object.entries(edit.set));
        }
        this.batches = yml;
    }
}