import bodyParser from 'body-parser';
import { app, errorHandler } from 'mu';

import { ALLOWED_DELTA_SIZE, ROLES, EXTENSION_PDF, JSONAPI_JOB_TYPE } from './config';
import { getFilesById, getFile } from './queries/file';
import { runBundlingJob as bundlingJobRunner } from './lib/bundling-job';
import { runJob as jobRunner } from './lib/job';
import { findCollectionByMembers, createCollection } from './queries/collection';
import {
  createJob, findJobUsingCollection, attachCollectionToJob, insertAndAttachCollectionToJob,
  updateJobStatus, findAllJobArchives, findUnfinishedJobs, RUNNING
} from './queries/job';
import { removeJobAndCollection } from "./queries/delta";
import {
  filterDeltaForDeletedFiles, handleFileDeletions,
  filterDeltaForCreatedJobs, filterDeltaForStatusChangedJobs
} from './lib/delta';
import { verifyArchive } from './lib/archive';
import { isLoggedIn, sessionHasRole } from './lib/session';
import {
  fetchFilesFromAgenda,
  fetchFilesFromAgendaByMandatees,
  fetchDecisionsByMandatees,
  fetchDecisionsFromAgenda,
  fetchAreDecisionsReleased,
  fetchFilesFromAgendaitem,
  fetchFilesFromCases,
  fetchFilesFromSubcases
} from './queries/agenda';
import { addSourceFilesForSignedPdfs } from './queries/document';
import { fetchCurrentUser, filterByConfidentiality } from './queries/user';
import { overwriteFilenames } from './lib/overwrite-filename';

function jobPayload (job) {
  return {
    data: {
      type: JSONAPI_JOB_TYPE,
      id: job.id,
      attributes: {
        uri: job.uri,
        status: job.status,
        created: job.created,
        started: job.started,
        ended: job.ended
      }
    }
  };
}

/*
 * Generic file bundling
 *
 * TODO: Javascript template body parser only allows up to 100kb of payload size (https://github.com/expressjs/body-parser#limit).
 * This is insufficiënt when sending archiving requests for many files
 */
app.post('/files/archive', findJob, sendJob, runJob);

async function findJob (req, res, next) {
  req.files = req.body.data.filter(f => f.type === 'files');
  req.authorizedFiles = await getFilesById(req.files.map(f => f.id));
  const collection = await findCollectionByMembers(req.authorizedFiles);
  let job;
  if (collection) {
    job = await findJobUsingCollection(collection.uri, true);
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
  const payload = jobPayload(res.job);
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

/*
 * Kaleidos-specific bundling of all documents related to an entity
 * (agenda, agendaitem, case, subcase)
 */

app.post('/agendas/:agenda_id/agendaitems/documents/files/archive', kaleidosArchiveRoute(
  async (req, currentUser, extensions) => {
    const agendaId = req.params.agenda_id;
    const mandateeIdsString = req.query.mandateeIds;
    const decisions = req.query.decisions === 'true';
    const newDocumentsOnly = req.query.newDocumentsOnly === 'true';
    const areDecisionsReleased = await fetchAreDecisionsReleased(agendaId);
    let files;
    if (mandateeIdsString) {
      const mandateeIds = mandateeIdsString.split(',');
      if (decisions) {
        files = await fetchDecisionsByMandatees(agendaId, mandateeIds, currentUser);
      } else {
        files = await fetchFilesFromAgendaByMandatees(agendaId, mandateeIds, currentUser, extensions, areDecisionsReleased, newDocumentsOnly);
      }
    } else {
      if (decisions) {
        files = await fetchDecisionsFromAgenda(agendaId, currentUser);
      } else {
        files = await fetchFilesFromAgenda(agendaId, currentUser, extensions, areDecisionsReleased, newDocumentsOnly);
      }
    }
    return { files, decisions };
  }
));

app.post('/agendaitems/:agendaitem_id/documents/files/archive', kaleidosArchiveRoute(
  (req, currentUser, extensions) => fetchFilesFromAgendaitem(req.params.agendaitem_id, currentUser, extensions)
));

app.post('/cases/:case_id/documents/files/archive', kaleidosArchiveRoute(
  (req, currentUser, extensions) => fetchFilesFromCases(req.params.case_id, currentUser, extensions)
));

app.post('/subcases/:subcase_id/documents/files/archive', kaleidosArchiveRoute(
  (req, currentUser, extensions) => fetchFilesFromSubcases(req.params.subcase_id, currentUser, extensions)
));

function kaleidosArchiveRoute (fetchFiles) {
  return async (req, res, next) => {
    try {
      const pdfOnly = req.query.pdfOnly === 'true';
      const extensions = pdfOnly ? [EXTENSION_PDF] : [];
      const currentUser = await fetchCurrentUser(req.headers['mu-session-id']);
      const fetchResult = await fetchFiles(req, currentUser, extensions);
      let { files, decisions } = Array.isArray(fetchResult) ? { files: fetchResult, decisions: false } : fetchResult;
      files = await filterByConfidentiality(files, currentUser, decisions);
      if (!pdfOnly) {
        files = await addSourceFilesForSignedPdfs(files);
      }
      await createBundlingJobAndRespondWithPayload(files, res);
    } catch (err) {
      console.trace(err);
      const error = new Error(err.message || 'Something went wrong during the gathering of the documents.');
      error.status = 500;
      return next(error);
    }
  };
}

async function documentBundlingJob (job, files) {
  await overwriteFilenames(files);
  await insertAndAttachCollectionToJob(job, files);
  await updateJobStatus(job.uri, null); // Unset the "RUNNING" status that prevented premature pickup while the collection was being prepared
  /*
   * Run the job directly instead of relying on the ext:status delta to trigger the pickup:
   * the delta subscription is configured with ignoreFromSelf, so status changes made by
   * this service itself never come back through /delta.
   */
  await jobRunner(job.uri, bundlingJobRunner);
}

async function createBundlingJobAndRespondWithPayload (files, res) {
  const collection = await findCollectionByMembers(files);
  let job;
  if (collection) {
    job = await findJobUsingCollection(collection.uri);
  }
  if (job) {
    res.status(200);
  } else if (files && files.length > 0) {
    // The job is created with a "RUNNING" status upfront, so it can't get picked up before its collection is attached
    job = await createJob(RUNNING);
    documentBundlingJob(job, files); // Fire but don't await
    res.status(201);
  } else {
    res.status(500);
    res.send('No zippable documents found');
    return;
  }
  res.send(jobPayload(job));
}

/*
 * Job management
 *
 * Debug endpoint that restarts all unstarted jobs.
 * Call from a logged in session in the browser console using:
 * fetch('/file-bundling/restart-unfinished-tasks', {
 *      method: 'POST'
 *    })
 */
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
    for (let i = 0; i < unfinishedJobs.length; i++) {
      const job = unfinishedJobs[i];
      await jobRunner(job.job, bundlingJobRunner);
      console.log(`Restarted file bundling job ${i+1} of ${unfinishedJobs.length}`);
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
