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
    const uniqueName = duplicateName ? makeUniqueName(fileNames, f.name) : f.name;
    fileNames.add(uniqueName);
    return {
      path: f.physicalUri.replace('share://', '/share/'),
      name: sanitize(uniqueName, { replacement: '_' })
    };
  });
  const archiveFileMetadata = await createArchive(archiveName, archivingParams);
  const muFile = await createFile(archiveFileMetadata, archiveFileMetadata.path.replace(/^\/share\//, 'share://'), files[0].graph);
  await attachResultToJob(job.uri, muFile.uri);
}

function makeUniqueName (fileNames, fileToRename) {
    // makes names unique both without any useful context like documentContainer position
    const fileParts = fileToRename.split(".");
    const prefix =
    fileNames[fileToRename] != null ? ++fileNames[fileToRename] : (fileNames[fileToRename] = 1);
    if (prefix) fileParts[Math.max(fileParts.length - 2, 0)] += ` (${prefix})`;
    return fileParts.join(".");
  }

export {
  runBundlingJob
};
