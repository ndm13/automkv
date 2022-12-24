import {getExe} from "./utils.ts";
import Runner from "./runner.ts";
import Watcher from "./watcher.ts";
import Job from "./job.ts";

function printUsage() {
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

const mkvpropedit = await getExe("mkvpropedit");
const mkvextract = await getExe("mkvextract");
const runner = new Runner(mkvpropedit, mkvextract);
const watcher = new Watcher(runner);

console.log("Running automkv with versions:");
let process = Deno.run({cmd: [mkvpropedit, "--version"], stdout: "inherit", stderr: "inherit"});
await process.status();
process = Deno.run({cmd: [mkvextract, "--version"], stdout: "inherit", stderr: "inherit"});
await process.status();
console.log();

if (Deno.args.length < 2)
    printUsage();

switch (Deno.args[0]) {
    case "watch": {
        const stat = Deno.statSync(Deno.args[1]);
        if (stat.isFile)
            await watcher.file(new Job(Deno.args[1])).promise;
        if (stat.isDirectory)
            await watcher.folder(Deno.args[1]).promise;
        console.error("Argument for watch is not a file or directory!");
        printUsage();
        break;
    }
    case "run": {
        await runner.batch(new Job(Deno.args[1]));
        break;
    }
    case "help":
    case "--help":
    case "-?": {
        printUsage();
        break;
    }
    default: {
        console.error("Unexpected argument:", Deno.args[0]);
        printUsage();
        break;
    }
}
