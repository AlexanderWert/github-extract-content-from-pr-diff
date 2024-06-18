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
    const regex = core.getInput("regex");
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

      parsedDiff.forEach(function (file) {
        if ((newFilesOnly && file.new) || !newFilesOnly) {
            console.log(JSON.stringify(file))
        }
      });
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
