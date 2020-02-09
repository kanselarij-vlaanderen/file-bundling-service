import cors from 'cors';
import { app, errorHandler } from 'mu';
import sanitize from 'sanitize-filename';

import { getFilesById } from './queries/file';
import { muFileArchive } from './archive';
import { createCollection } from './queries/collection';
import { createJob, attachCollectionToJob, attachResultToJob, SUCCESS, FAIL, updateJobStatus } from './queries/job';

app.use(cors());

app.post('/files/archive', async (req, res) => {
  const job = await createJob();
  res.send({
    type: 'jobs',
    id: job.id,
    attributes: {
      uri: job.uri,
      status: job.status,
      created: job.created
    }
  });
  try {
    console.log(req.body);
    const files = req.body.data.filter(f => f.type === 'files');
    const authorizedFiles = await getFilesById(files.map(f => f.id));
    const fileCollection = await createCollection(authorizedFiles.map(f => f.uri));
    await attachCollectionToJob(job.uri, fileCollection.uri);
    const filesToArchive = authorizedFiles.map((f) => {
      return {
        path: f.uri.replace('share://', '/share/'),
        name: sanitize(f.name, { replacement: '_' }) // TODO: overload with name that got posted
      };
    });
    const archiveName = req.query.name || 'archive.zip';
    const muFile = await muFileArchive(archiveName, filesToArchive);
    await attachResultToJob(job.uri, muFile.uri);
    updateJobStatus(job.uri, SUCCESS);
  } catch (e) {
    console.log(e);
    updateJobStatus(job.uri, FAIL);
  }
});

app.post('/delta', async (req, res) => {
  // TODO
});

app.use(errorHandler);
