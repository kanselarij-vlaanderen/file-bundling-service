import bodyParser from 'body-parser';
import { app, errorHandler } from 'mu';
import sanitize from 'sanitize-filename';

import { getFilesById, getFile } from './queries/file';
import { muFileArchive } from './archive';
import { createCollection, findCollectionByMembers } from './queries/collection';
import { createJob, attachCollectionToJob, attachResultToJob, SUCCESS, FAIL, updateJobStatus, findJobUsingCollection } from './queries/job';
import { filterDeltaForDeletedFiles, handleFileDeletions, filterDeltaForCreatedJobs } from './lib/delta';

app.post('/files/archive', findJob, sendJob, runJob);

async function findJob (req, res, next) {
  req.files = req.body.data.filter(f => f.type === 'files');
  req.authorizedFiles = await getFilesById(req.files.map(f => f.id));
  const collection = await findCollectionByMembers(req.authorizedFiles.map(f => f.uri));
  let job;
  if (collection) {
    job = await findJobUsingCollection(collection.uri);
  }
  if (job) {
    job.generated = await getFile(job.generated);
    res.status(200);
  } else {
    job = await createJob();
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
  try {
    const fileCollection = await createCollection(req.authorizedFiles.map(f => f.uri));
    await attachCollectionToJob(res.job.uri, fileCollection.uri);
    const filesToArchive = req.authorizedFiles.map((f) => {
      const fileWithRequestedName = req.files.filter((file) => file.id === f.id).filter((file) => {
        return file.attributes && file.attributes.name;
      })[0];
      const name = fileWithRequestedName ? fileWithRequestedName.attributes.name : f.name;
      return {
        path: f.physicalUri.replace('share://', '/share/'),
        name: sanitize(name, { replacement: '_' })
      };
    });
    const archiveName = req.query.name || 'archive.zip';
    const muFile = await muFileArchive(archiveName, filesToArchive);
    await attachResultToJob(res.job.uri, muFile.uri);
    updateJobStatus(res.job.uri, SUCCESS);
  } catch (e) {
    console.log(e);
    updateJobStatus(res.job.uri, FAIL);
  }
}

app.post('/delta', bodyParser.json(), async (req, res) => {
  // Handle invalidation of archive file cache on file deletes
  const deletedFiles = await filterDeltaForDeletedFiles(req.body);
  if (deletedFiles.length > 0) {
    console.log(`Received ${deletedFiles.length} file delete(s) through delta's. Handling now.`);
    await handleFileDeletions(deletedFiles);
  }
  // Handle running of inserted bundling jobs
  const createdJobs = await filterDeltaForCreatedJobs(req.body);
  if (createdJobs.length > 0) {
    console.log(`Received ${createdJobs.length} new file bundling job(s) through delta's. Handling now.`);
    // TODO
  }
});

app.use(errorHandler);
