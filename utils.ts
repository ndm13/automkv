import {path} from "./deps.ts";

/**
 * Internal Windows-specific search logic used by getExe.
 *
 * @param exe       The executable to find
 * @param decoder   A decoder for output text
 */
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

/**
 * Try resolving the path of an executable by name.  On Unix-like systems this
 * uses `which`.  On Windows, it will attempt to:
 * - Use `powershell`'s `gcm` to find the executable in the path
 * - Use `powershell` to get the Program Files directory and try to find an
 *   `MKVToolNix` folder, then try to find the executable there with an `.exe`
 *   extension
 *
 * In either case, it will first check for an environment variable that shares
 * its name with the executable and use that if set.
 *
 * @param exe   The executable to find
 */
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

/**
 * Shorthand for `() => { a(); b(); }`.
 *
 * @param a Void function to reduce
 * @param b Void function to reduce
 */
export function reduceVoid(a: () => void, b: () => void): () => void {
    return () => {
        a();
        b();
    };
}

/**
 * Shorthand for `Promise.all([a, b]).then(() => {})`.
 *
 * @param a Promise<void> to reduce
 * @param b Promise<void> to reduce
 */
export function reduceVoidPromise(a: Promise<void>, b: Promise<void>): Promise<void> {
    return Promise.all([a, b]).then(() => {});
}