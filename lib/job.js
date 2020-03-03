import {
  RUNNING, SUCCESS, FAIL, updateJobStatus, findJobTodo
} from '../queries/job';

async function runJob (jobUri, runner) {
  const job = await findJobTodo(jobUri);
  if (!job) {
    console.log(`No job TODO found by uri <${jobUri}>`);
    return;
  }
  await updateJobStatus(job.uri, RUNNING);
  try {
    await runner(job);
    await updateJobStatus(job.uri, SUCCESS);
  } catch (e) {
    console.log(e);
    await updateJobStatus(job.uri, FAIL);
  }
}

export {
  runJob
};
