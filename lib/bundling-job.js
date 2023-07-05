import sanitize from 'sanitize-filename';
import { attachResultToJob } from '../queries/job';
import { findCollectionFileMembers } from '../queries/collection';
import { createFile } from '../queries/file';
import { createArchive } from './archive';

async function runBundlingJob (job, archiveName = 'archive.zip') {
  const files = await findCollectionFileMembers(job.used);
  const archivingParams = files.map((f) => {
    return {
      path: f.physicalUri.replace('share://', '/share/'),
      name: sanitize(f.name, { replacement: '_' })
    };
  });
  const archiveFileMetadata = await createArchive(archiveName, archivingParams);
  const muFile = await createFile(archiveFileMetadata, archiveFileMetadata.path.replace(/^\/share\//, 'share://'), files[0].graph);
  await attachResultToJob(job.uri, muFile.uri);
}

export {
  runBundlingJob
};
