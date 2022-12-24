import {getExe, printUsage} from "./utils.ts";
import Runner from "./runner.ts";
import Watcher from "./watch.ts";

const mkvpropedit = await getExe("mkvpropedit");
const mkvextract = await getExe("mkvextract");
const runner = new Runner(mkvpropedit);
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
            await watcher.file(Deno.args[1]).promise;
        if (stat.isDirectory)
            await watcher.folder(Deno.args[1]).promise;
        console.error("Argument for watch is not a file or directory!");
        printUsage();
        break;
    }
    case "run": {
        await runner.runBatch(Deno.args[1]);
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
