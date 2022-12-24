import {log, path, yaml} from "./deps.ts";

import {Batch} from "./types.ts";

export function printUsage() {
    console.log("Usage:");
    console.log("  automkv watch <file>");
    console.log("    Monitor the target 'automkv.yml' file's destination folder for any");
    console.log("    changes, and run the edits in the file when any updates have");
    console.log("    finished.")
    console.log("  automkv watch <folder>");
    console.log("    Monitor the target folder (and subfolders) for files ending in");
    console.log("    'automkv.yml'.  Any files found will have their destination folders");
    console.log("    monitored for changes, and the edits in the file will run when any");
    console.log("    updates have finished.");
    console.log("  automkv run <target_file>");
    console.log("    Apply the edits in a 'automkv.yml' file immediately to all target");
    console.log("    files in the target folder");
    Deno.exit(0);
}

export function readYaml(ymlPath: string): Batch[] {
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

async function getExeWindows(exe: string, decoder: TextDecoder) {
    return await Deno.run({
        cmd: ["powershell", "-c", `(gcm ${exe}).Source`],
        stdout: "piped"
    })
        .output()
        .then(o => decoder.decode(o))
        .then(o => {
            if (o.indexOf("is not recognized") > -1) return Promise.reject();
            return o;
        })
        .catch(() =>
            Deno.run({
                cmd: ["powershell", "[Environment]::GetFolderPath('ProgramFiles')"],
                stdout: "piped"
            })
                .output()
                .then(o => decoder.decode(o))
                .then(async programFiles => {
                    programFiles = programFiles.trim();
                    programFiles = path.join(programFiles, "MKVToolNix");
                    const dir = Deno.readDir(programFiles);
                    for await (const file of dir) {
                        if (file.name.toLowerCase() === exe.toLowerCase() + ".exe")
                            return path.join(programFiles, file.name);
                    }
                    return undefined;
                }))
        .catch(() => undefined);
}

export async function getExe(exe: string): Promise<string> {
    const env = exe.toUpperCase();
    let file = Deno.env.get(env);
    if (!file) {
        console.log(`Autodetecting ${exe}...`);
        const decoder = new TextDecoder();
        if (Deno.build.os == "windows") {
            file = await getExeWindows(exe, decoder);
        } else {
            const process = Deno.run({cmd: ["which", exe], stdout: "piped"});
            file = await process.status()
                .then(s => s.code)
                .then(s => {
                    if (s === 0) return process.output();
                    throw "Failed";
                })
                .then(o => decoder.decode(o))
                .catch(() => undefined);
        }
        if (file && (file = file.trim()).length > 0) {
            console.log("Detected " + file);
            console.log("To skip this in the future, set the environment variable", env);
        } else {
            console.error(`Failed to find ${exe}.  Ensure it's in your path, or provide it by setting`);
            console.error(`the environment variable ${env} to the correct value.`);
            Deno.exit(1);
        }
    }
    return file;
}

export function reduceVoid(a: () => void, b: () => void): () => void {
    return () => {
        a();
        b();
    };
}

export function reduceVoidPromise(a: Promise<void>, b: Promise<void>): Promise<void> {
    return Promise.all([a, b]).then(() => {
    });
}