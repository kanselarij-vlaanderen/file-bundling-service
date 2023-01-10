import fs from 'fs';

import { findJobsUsingFile, removeJobAndCollection, findJobsWithoutCollectionMembers } from '../queries/delta';
import { RDF_JOB_TYPE } from '../config';

// TODO file insert does not always invalidate current zip (for example adding a file as admin after archiving) 
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
    const jobsFromDelta = await findJobsUsingFile(deletedFile);
    const extraJobs = await findJobsWithoutCollectionMembers();
    const jobs = [...new Set([...jobsFromDelta, ...extraJobs])]; // Uniquify array
    console.log('Jobs to delete:', jobs);
    for (const job of jobs) {
      try {
        fs.unlinkSync(job.physf.replace('share://', '/share/'));
      } catch (e) {
        console.log(`Failed to delete archive file <${job.physf}> from disk`);
      }
-      await removeJobAndCollection(job);
    }
  }
}

function filterDeltaForCreatedJobs (deltaBody) {
  const insertionDeltas = deltaBody.map(d => d.inserts).reduce((ds, d) => Array.prototype.concat.apply(ds, d));
  if (insertionDeltas) {
    const insertedJobs = insertionDeltas.filter(delta => {
      return delta.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
        delta.object.value === RDF_JOB_TYPE;
    }).map(delta => delta.subject.value);
    return insertedJobs;
  }
}

function filterDeltaForStatusChangedJobs (deltaBody) {
  const deletionDeltas = deltaBody.map(d => d.deletes).reduce((ds, d) => Array.prototype.concat.apply(ds, d));
  if (deletionDeltas) {
    const changedStatusJobs = deletionDeltas.filter(delta => {
      return delta.predicate.value === 'http://mu.semte.ch/vocabularies/ext/status';
    }).map(delta => delta.subject.value);
    return changedStatusJobs;
  }

}

export {
  filterDeltaForDeletedFiles,
  handleFileDeletions,
  filterDeltaForCreatedJobs,
  filterDeltaForStatusChangedJobs
};
