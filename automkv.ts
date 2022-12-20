import {getExe, printUsage} from "./utils.ts";
import Runner from "./runner.ts";
import {watchAutoFiles} from "./watch.ts";

const mkvpropedit = await getExe("mkvpropedit");
const mkvextract = await getExe("mkvextract");
const runner = new Runner(mkvpropedit);

console.log("Running automkv with versions:");
let process = Deno.run({cmd: [mkvpropedit, "--version"], stdout: "inherit", stderr: "inherit"});
await process.status();
process = Deno.run({cmd: [mkvextract, "--version"], stdout: "inherit", stderr: "inherit"});
await process.status();
console.log();

if (Deno.args.length < 2)
    printUsage();

switch (Deno.args[0]) {
    case "watch":
        watchAutoFiles(runner);
        break;
    case "run":
        runner.runBatch(Deno.args[1]);
        break;
    case "help":
    case "--help":
    case "-?":
        printUsage();
        break;
    default:
        console.error("Unexpected argument:", Deno.args[0]);
        printUsage();
        break;
}
