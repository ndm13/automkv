import {path} from "./deps.ts";

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