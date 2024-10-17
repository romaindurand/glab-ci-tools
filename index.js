#!/usr/bin/env node

import { exec, spawn } from "child_process";
import { select } from "@inquirer/prompts";
import colors from "yoctocolors";
import { formatDistance } from "date-fns";

async function main() {
  try {
    const pipelines = await execGlabCiList();
    const refMaxLength = pipelines.reduce((max, pipeline) => {
      return Math.max(max, pipeline.ref.length);
    }, 0);
    const pipelineChoices = getPipelineChoices(pipelines, refMaxLength);
    const pipelineSha = selectPipeline(pipelineChoices);

    selectPipelineAction(pipelineSha);
  } catch (error) {
    console.error(error);
  }
}

main();

/**
 * @param {PipelineChoice[]} pipelineChoices
 * @returns {Promise<string>}
 */
async function selectPipeline(pipelineChoices) {
  return select({
    message: "Select a pipeline",
    choices: pipelineChoices,
    theme: {
      style: {
        highlight(text) {
          return colors.bgWhite(text);
        },
      },
    },
    loop: false,
    pageSize: process.stdout.rows - 2,
  });
}

/**
 * @param {Pipeline[]} pipelines
 * @param {number} refMaxLength
 * @returns {{name: string, value: string}[]}
 */
function getPipelineChoices(pipelines, refMaxLength) {
  return pipelines.map((pipeline) => {
    return {
      name: colors.black(formatPipeline(pipeline, refMaxLength)),
      value: pipeline.sha,
    };
  });
}

/**
 *
 * @param {string} pipelineSha
 */
async function selectPipelineAction(pipelineSha) {
  const action = await select({
    message: "Select an action",
    choices: [
      { name: "View pipeline", value: "view" },
      { name: "Trigger job", value: "trigger" },
    ],
  });

  if (action === "view") {
    execViewPipeline(pipelineSha);
  } else if (action === "trigger") {
    const pipelineDetails = await execGlabCiGet(pipelineSha);
    const jobChoices = getJobChoices(pipelineDetails.jobs);

    const jobId = await select({
      message: "Select a job",
      choices: jobChoices,
    });

    const glabCiTrigger = await execGlabCiTrigger(jobId);
    console.log(glabCiTrigger);
  }
}

/**
 * @param {Job[]} jobs
 * @returns {{name: string, value: number}[]}
 */
function getJobChoices(jobs) {
  const jobChoices = jobs.map((job) => {
    const statusColor = {
      running: colors.yellow,
      success: colors.green,
      failed: colors.red,
      canceled: colors.gray,
      manual: colors.blue,
    }[job.status];
    return {
      name: `${colors.bold(job.name)}${" ".repeat(
        20 - job.name.length
      )}(${statusColor(job.status)})`,
      value: job.id,
    };
  });

  return jobChoices;
}

/**
 * @param {Pipeline[]} pipeline
 * @param {number} refMaxLength
 */
function formatPipeline(pipeline, refMaxLength) {
  const time = formatDistance(new Date(pipeline.created_at), new Date(), {
    addSuffix: true,
  });
  return (
    colors.green(`${pipeline.status} • #${pipeline.id}`) +
    colors.black(` (#${pipeline.iid}) ${pipeline.ref}`) +
    ` ${" ".repeat(refMaxLength - pipeline.ref.length)}` +
    ` (${colors.magenta(time)})`
  );
}

/**
 *
 * @returns {Promise<Pipeline[]>}
 */
async function execGlabCiList() {
  return new Promise((resolve, reject) => {
    exec("glab ci list -F json", (error, stdout) => {
      if (error) {
        reject(error);
      }
      const json = JSON.parse(stdout);
      resolve(json);
    });
  });
}

/**
 *
 * @param {number} pipelineId
 * @returns {Promise<PipelineDetails>}
 */
async function execGlabCiGet(pipelineId) {
  return new Promise((resolve, reject) => {
    exec(`glab ci get -b ${pipelineId} -F json`, (error, stdout) => {
      if (error) {
        reject(error);
      }
      const json = JSON.parse(stdout);
      resolve(json);
    });
  });
}

/**
 * @param {number} jobId
 * @returns {Promise<string>}
 */
async function execGlabCiTrigger(jobId) {
  return new Promise((resolve, reject) => {
    exec(`glab ci trigger ${jobId}`, (error, stdout) => {
      if (error) {
        reject(error);
      }

      const spawnTrace = spawn("glab", ["ci", "trace", jobId], {
        stdio: "inherit",
      });
      spawnTrace.on("exit", (code) => {
        resolve(stdout);
        process.exit(code);
      });
    });
  });
}

/**
 * @param {string} pipelineSha
 */
function execViewPipeline(pipelineSha) {
  const glabCiView = spawn("glab", ["ci", "view", "-b", pipelineSha], {
    stdio: "inherit",
  });
  glabCiView.on("exit", () => {
    return selectPipelineAction(pipelineSha);
  });
}

/**
 * @typedef {object} Job
 * @property {string} name - The name of the job.
 * @property {string} status - The stage of the job.
 * @property {number} id - The ID of the job.
 */

/**
 * @typedef {object} PipelineDetails
 * @property {Job[]} jobs - The jobs of the pipeline.
 *
 */

/**
 * @typedef {object} Pipeline
 * @property {number} id - The ID of the pipeline.
 * @property {number} iid - The internal ID of the pipeline.
 * @property {string} status - The status of the pipeline.
 * @property {string} ref - The reference of the pipeline.
 * @property {string} sha - The SHA of the pipeline.
 * @property {string} web_url - The web URL of the pipeline.
 * @property {string} updated_at - The last update timestamp of the pipeline.
 * @property {string} created_at - The creation timestamp of the pipeline.
 */

/**
 * @typedef {object} PipelineChoice
 * @property {string} name - The string displayed in the prompt.
 * @property {string} value - The sha of the pipeline.
 */
