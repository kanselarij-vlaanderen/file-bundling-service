import cors from 'cors';
import bodyParser from 'body-parser';
import { app, errorHandler } from 'mu';
import sanitize from 'sanitize-filename';
import fs from 'fs';

import { getFilesById } from './queries/file';
import { muFileArchive } from './archive';
import { createCollection, findCollectionByMembers } from './queries/collection';
import { createJob, attachCollectionToJob, attachResultToJob, SUCCESS, FAIL, updateJobStatus, findJobUsingCollection } from './queries/job';
import { findJobsUsingFile, removeJobsUsingFile } from './queries/delta';

app.use(cors());

app.post('/files/archive', findJob, sendJob, runJob);

async function findJob (req, res, next) {
  req.files = req.body.data.filter(f => f.type === 'files');
  req.authorizedFiles = await getFilesById(req.files.map(f => f.id));
  const collectionUri = await findCollectionByMembers(req.authorizedFiles.map(f => f.uri));
  let job;
  if (collectionUri) {
    job = await findJobUsingCollection(collectionUri);
  }
  if (job) {
    res.status(200);
  } else {
    job = await createJob();
    res.status(201);
  }
  res.job = job;
  next();
}

async function sendJob (req, res, next) {
  res.send({
    type: 'jobs',
    id: res.job.id,
    attributes: {
      uri: res.job.uri,
      status: res.job.status,
      created: res.job.created,
      generated: res.job.generated
    }
  });
  if (res.statusCode === 201) {
    next();
  }
}

async function runJob (req, res) {
  try {
    const fileCollection = await createCollection(req.authorizedFiles.map(f => f.uri));
    await attachCollectionToJob(res.job.uri, fileCollection.uri);
    const filesToArchive = req.authorizedFiles.map((f) => {
      return {
        path: f.uri.replace('share://', '/share/'),
        name: sanitize(f.name, { replacement: '_' }) // TODO: overload with name that got posted
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
  console.log("New delta's");
  console.log(req.body);
  const deletionDeltas = req.body.map(d => d.deletes).reduce((ds, d) => Array.prototype.join.apply(ds, d));
  const deletedFiles = deletionDeltas.filter(delta => {
    return delta.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
      delta.object.value === 'http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#FileDataObject';
  }).map(delta => delta.subject.value);
  console.log("delted file's" + deletedFiles);
  for (var deletedFile of deletedFiles) {
    const jobs = await findJobsUsingFile(deletedFile);
    console.log("jobs to delete", jobs);
    for (const job of jobs) {
      try {
        fs.unlinkSync(job.physf.replace('share://', '/share/'));
      } catch (e) {
        console.log('Failed to delete archive file ' + job.physf);
        continue;
      }
      await removeJobsUsingFile(deletedFile);
    }
  }
});

app.use(errorHandler);
