import cors from 'cors';
import { app, errorHandler } from 'mu';
import fs from 'fs';
import archiver from './utils/archiver';
import bodyParser from 'body-parser';
import sanitize from 'sanitize-filename';

app.use(cors());
app.use(bodyParser.json({ type: 'application/*+json' }));

app.post('/bundleAllFiles', async (req, res) => {
  console.log(req.body);
  const files = req.body.data;
  const filesToArchive = files.map((file) => {
    return {
      path: file.attributes.uri.replace('share://', '/share/'),
      name: sanitize(file.attributes.name, { replacement: '_' })
    };
  });

  const path = await archiver.archiveFiles(filesToArchive);
  fs.createReadStream(path).pipe(res);
});

app.use(errorHandler);
