export type Batch = {
    watch: {
        folder: string;
        files: string;
    };
    edits: Edit[];
};

export type Edit = {
    edit: string;
    set: Map<string,string>;
};