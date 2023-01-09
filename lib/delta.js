import fs from 'fs';

import { findJobsUsingFile, removeJobsUsingFile } from '../queries/delta';
import { RDF_JOB_TYPE } from '../config';

function filterDeltaForDeletedFiles (deltaBody) {
  const deletionDeltas = deltaBody.map(d => d.deletes).reduce((ds, d) => Array.prototype.concat.apply(ds, d));
  if (deletionDeltas) {
    const deletedFiles = deletionDeltas.filter(delta => {
      return delta.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
        delta.object.value === 'http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#FileDataObject';
    }).map(delta => delta.subject.value);
    return deletedFiles;
  }
}

async function handleFileDeletions (deletedFiles) {
  for (var deletedFile of deletedFiles) {
    const jobs = await findJobsUsingFile(deletedFile);
    console.log('Jobs to delete:', jobs);
    for (const job of jobs) {
      try {
        fs.unlinkSync(job.physf.replace('share://', '/share/'));
      } catch (e) {
        console.log(`Failed to delete archive file <${job.physf}> from disk`);
      }
      await removeJobsUsingFile(deletedFile);
    }
  }
}

function filterDeltaForCreatedJobs (deltaBody) {
  const insertionDeltas = deltaBody.map(d => d.inserts).reduce((ds, d) => Array.prototype.concat.apply(ds, d));
  const insertedJobs = insertionDeltas.filter(delta => {
    return delta.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
      delta.object.value === RDF_JOB_TYPE;
  }).map(delta => delta.subject.value);
  return insertedJobs;
}

function filterDeltaForStatusChangedJobs (deltaBody) {
  const deletionDeltas = deltaBody.map(d => d.deletes).reduce((ds, d) => Array.prototype.concat.apply(ds, d));
  const changedStatusJobs = deletionDeltas.filter(delta => {
    return delta.predicate.value === 'http://mu.semte.ch/vocabularies/ext/status';
  }).map(delta => delta.subject.value);
  return changedStatusJobs;
}

export {
  filterDeltaForDeletedFiles,
  handleFileDeletions,
  filterDeltaForCreatedJobs,
  filterDeltaForStatusChangedJobs
};
