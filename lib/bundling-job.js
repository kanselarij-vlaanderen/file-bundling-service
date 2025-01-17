import sanitize from 'sanitize-filename';
import { attachResultToJob } from '../queries/job';
import { findCollectionFileMembers } from '../queries/collection';
import { createFile } from '../queries/file';
import { createArchive } from './archive';

async function runBundlingJob (job, archiveName = 'archive.zip') {
  const files = await findCollectionFileMembers(job.used);
  // If we encounter a filename we've seen before, we append
  // the file's ID
  const fileNames = new Set();
  const archivingParams = files.map((f) => {
    const duplicateName = fileNames.has(f.name);
    fileNames.add(f.name);
    return {
      path: f.physicalUri.replace('share://', '/share/'),
      name: sanitize(`${f.name}${duplicateName ? ` ${f.id}` : ''}`, { replacement: '_' })
    };
  });
  const archiveFileMetadata = await createArchive(archiveName, archivingParams);
  const muFile = await createFile(archiveFileMetadata, archiveFileMetadata.path.replace(/^\/share\//, 'share://'), files[0].graph);
  await attachResultToJob(job.uri, muFile.uri);
}

export {
  runBundlingJob
};
