import {executePreparation} from "../src/lib/agent/preparation-jobs";
void executePreparation(process.argv[2],process.argv[3]).catch(error=>{console.error(error);process.exitCode=1;});
