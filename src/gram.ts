import { Gram } from "@gram-ai/functions";
import { executeReadQueryGram } from "./tools/execute-read-query.ts";
import { executeWriteQueryGram } from "./tools/execute-write-query.ts";

const gram = new Gram()
  .extend(executeReadQueryGram)
  .extend(executeWriteQueryGram);

export default gram;
