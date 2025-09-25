import { updateJobStatus, findScheduledJob } from '../queries/job';
import { JOB } from '../config'

async function runJob (jobUri, runner) {
  const job = await findScheduledJob(jobUri);
  if (!job) {
    console.log(`No job SCHEDULED found by uri <${jobUri}>`);
    return;
  }
  await updateJobStatus(job.uri, JOB.STATUSES.BUSY);
  try {
    await runner(job);
    await updateJobStatus(job.uri, JOB.STATUSES.SUCCESS);
  } catch (e) {
    console.trace(e);
    console.log(`Execution of job <${job.uri}> failed: ${e.message}`);
    await updateJobStatus(job.uri, JOB.STATUSES.FAILED, e.message);
  }
}

export {
  runJob
};
