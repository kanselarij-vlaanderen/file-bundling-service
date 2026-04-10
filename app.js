import bodyParser from 'body-parser';
import { app, errorHandler } from 'mu';

import { ALLOWED_DELTA_SIZE, ROLES } from './config';
import { getFilesById, getFile } from './queries/file';
import { runBundlingJob as bundlingJobRunner } from './lib/bundling-job';
import { runJob as jobRunner } from './lib/job';
import { findCollectionByMembers, createCollection } from './queries/collection';
import { createJob, findJobUsingCollection, attachCollectionToJob, findAllJobArchives, findUnfinishedJobs } from './queries/job';
import { removeJobAndCollection } from "./queries/delta";
import {
  filterDeltaForDeletedFiles, handleFileDeletions,
  filterDeltaForCreatedJobs, filterDeltaForStatusChangedJobs
} from './lib/delta';
import { verifyArchive } from './lib/archive';
import { isLoggedIn, sessionHasRole } from './lib/session';

/*
 * TODO: Javascript template body parser only allows up to 100kb of payload size (https://github.com/expressjs/body-parser#limit).
 * This is insufficiënt when sending archiving requests for many files
 */
app.post('/files/archive', findJob, sendJob, runJob);

async function findJob (req, res, next) {
  req.files = req.body.data.filter(f => f.type === 'files');
  req.authorizedFiles = await getFilesById(req.files.map(f => f.id));
  const collection = await findCollectionByMembers(req.authorizedFiles.map(f => `uri:${f.uri}|name:${f.name}`));
  let job;
  if (collection) {
    job = await findJobUsingCollection(collection.uri);
  }
  if (job) {
    job.generated = await getFile(job.generated);
    res.status(200);
  } else {
    job = await createJob();
    const fileCollection = await createCollection(req.authorizedFiles);
    await attachCollectionToJob(job.uri, fileCollection.uri);
    res.status(201);
  }
  res.job = job;
  next();
}

async function sendJob (req, res, next) {
  const payload = {};
  payload.data = {
    type: 'file-bundling-jobs',
    id: res.job.id,
    attributes: {
      uri: res.job.uri,
      status: res.job.status,
      created: res.job.created
    }
  };
  if (res.statusCode === 200) {
    payload.data.relationships = {
      generated: {
        data: { id: res.job.generated.id, type: 'files' }
      }
    };
    payload.included = [{
      type: 'files',
      id: res.job.generated.id,
      attributes: {
        name: res.job.generated.name,
        format: res.job.generated.format,
        size: res.job.generated.size,
        extension: res.job.generated.extension,
        created: res.job.generated.created,
        modified: res.job.generated.modified
      }
    }];
  }
  res.send(payload);
  if (res.statusCode === 201) {
    next();
  }
}

async function runJob (req, res) {
  jobRunner(res.job.uri, bundlingJobRunner);
}

app.post('/restart-unfinished-tasks', async (req, res, next) => {
  try {
    const sessionUri = req.headers['mu-session-id'];
    if (!(await isLoggedIn(sessionUri))) {
      return next({ message: 'Unauthorized access to this endpoint is not permitted', status: 401 });
    }
    const hasCorrectRole = await sessionHasRole(sessionUri, [ROLES.ADMIN]);
    if (!hasCorrectRole) {
      return next({ message: 'Unauthorized access to this endpoint is not permitted', status: 403 });
    }
    const unfinishedJobs = await findUnfinishedJobs();
    if (unfinishedJobs.length === 0) {
      console.log('No unfinished file bundling jobs found.');
      return res.status(200).send({ message: 'No unfinished jobs found.' });
    }
    console.log(`Found ${unfinishedJobs.length} unfinished file bundling job(s). Restarting now.`);
    for (const job of unfinishedJobs) {
      await jobRunner(job.job, bundlingJobRunner);
    }
    return res.status(200).send({ message: `Restarted ${unfinishedJobs.length} unfinished job(s).` });
  } catch (err) {
    console.trace(err);
    const error = new Error(err.message || 'Something went wrong while restarting unfinished tasks.');
    error.status = 500;
    return next(error);
  }
});

app.post('/delta', bodyParser.json({ limit: ALLOWED_DELTA_SIZE }), async (req, res) => {
  res.status(202).end();
  // Handle invalidation of archive file cache on file deletes
  const deletedFiles = await filterDeltaForDeletedFiles(req.body);
  if (deletedFiles.length > 0) {
    console.log(`Received ${deletedFiles.length} file delete(s) through delta's. Handling now.`);
    await handleFileDeletions(deletedFiles);
  }
  // Handle running of inserted bundling jobs
  const createdJobs = await filterDeltaForCreatedJobs(req.body);
  const changedStatusJobs = await filterDeltaForStatusChangedJobs(req.body);
  const jobsToRun = [...new Set([...createdJobs, ...changedStatusJobs])]; // Uniquify array
  if (jobsToRun.length > 0) {
    console.log(`Received ${jobsToRun.length} pending file bundling job(s) through delta's. Handling now.`);
    for (const jobUri of jobsToRun) {
      await jobRunner(jobUri, bundlingJobRunner);
    }
  }
});

// on startup
verifyArchiveFiles();

async function verifyArchiveFiles() {
  console.log(`Verifying all current archives from finished jobs`);
  const jobs = await findAllJobArchives();
  if (jobs) {
    console.log(`${jobs.length} archives to verify`);
    for (const job of jobs) {
      try {
        const isFileOnDisk = await verifyArchive(job.physf.replace('share://', '/share/'));
        if (isFileOnDisk) {
          console.log(`Archive for job <${job.job}> found on disk`);
        } else {
          console.log(`Archive for job <${job.job}> not found on disk, removing metadata`);
          await removeJobAndCollection(job);
        }
      } catch (e) {
        console.log(`Failed to verify archive for job <${job.job}>`);
      }
    }
  }
  console.log(`Verifying current archives finished`);
}

app.use(errorHandler);
