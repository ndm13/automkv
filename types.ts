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
    set: Map<string,string>;
};

export type Watch = {
    cancel: () => void;
    promise: Promise<void>;
}