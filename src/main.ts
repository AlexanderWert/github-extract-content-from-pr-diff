import * as core from "@actions/core";
import { getOctokit, context } from "@actions/github";
import parse from "parse-diff";

async function getDiff(octokit, repository, pull_request) {
  const owner = repository?.owner?.login;
  const repo = repository?.name;
  const pull_number = pull_request?.number;
  core.info(`Getting diff for: ${owner}, ${repo}, ${pull_number}`);
  if (!owner || !repo || typeof(pull_number) !== 'number') {
    throw Error('Missing metadata required for fetching diff.');
  }
  const response = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number,
    headers: { accept: "application/vnd.github.v3.diff" },
  });

  const diff = response.data as unknown as string;
  return parse(diff);
}

function getBoolean(value){
  switch(value){
       case true:
       case "true":
       case 1:
       case "1":
       case "on":
       case "yes":
           return true;
       default: 
           return false;
   }
}

async function run() {
  try {
    // get information on everything
    const token = core.getInput("github-token", { required: true });
    const octokit = getOctokit(token);

    const pathToScan = core.getInput("pathToScan");
    const inputRegex = core.getInput("regex");
    if (!inputRegex) {
      core.setFailed("❌ Empty regex! Regex is required!")
      return;
    }
    var regex : RegExp;
    try {
      regex = new RegExp(inputRegex, "g");
    } catch (error: any) {
      core.setFailed("❌ Invalid regex:'" + inputRegex + "'")
      return;
    }
    const newFilesOnly = getBoolean(core.getInput("newFilesOnly"));

    const payload = context.payload;
    const pull_request = payload.pull_request;
    const repository = payload.repository;

    if (
      context.eventName !== "pull_request" &&
      context.eventName !== "pull_request_target"
    ) {
      // TODO(ApoorvGuptaAi) Should just return here and skip the rest of the check.
      core.warning("⚠️ Not a pull request, skipping PR body checks");
    } else {
      
      if (!pull_request) {
        core.setFailed("❌ Expecting pull_request metadata.")
        return;
      }
      if (!repository) {
        core.setFailed("❌ Expecting repository metadata.")
        return;
      }


      core.info("Checking diff contents");
      const parsedDiff = await getDiff(octokit, repository, pull_request);
      var extractedContent = '';
      outerLoop: for (let file of parsedDiff) {
        if ((newFilesOnly && file.new) || !newFilesOnly) {
          if((pathToScan && file.to?.startsWith(pathToScan)) || !pathToScan) {
            for (let chunk of file.chunks) {
              for (let change of chunk.changes) {
                if (change.type === "add"){
                    var matches = regex.exec(change.content);
                    if (matches?.length && matches?.length > 0){
                      extractedContent = matches[1];
                      break outerLoop;
                    }
                }
              }
            }
          }
        }
      }
      console.log(`Extracted content: ${JSON.stringify(extractedContent)}`)
      core.setOutput("capturedContent", extractedContent);
    }
  } catch (error: any) {
    if (error.name === "HttpError") {
      core.setFailed(
        "❌ There seems to be an error in an API request" +
          "\nThis is usually due to using a GitHub token without the adequate scope"
      );
    } else {
      core.setFailed("❌ " + error.stack);
    }
  }
}

run();
