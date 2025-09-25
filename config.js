
const RESOURCE_BASE = 'http://mu.semte.ch/services/file-bundling-service';
const MU_APPLICATION_FILE_STORAGE_PATH = process.env.MU_APPLICATION_FILE_STORAGE_PATH || '';
let STORAGE_PATH = `/share/${MU_APPLICATION_FILE_STORAGE_PATH}`;

if (!STORAGE_PATH.endsWith('/')) {
  STORAGE_PATH = `${STORAGE_PATH}/`;
}

const JOB = {
  STATUSES: {
    SCHEDULED: 'http://redpencil.data.gift/id/concept/JobStatus/scheduled',
    BUSY: 'http://redpencil.data.gift/id/concept/JobStatus/busy',
    SUCCESS: 'http://redpencil.data.gift/id/concept/JobStatus/success',
    FAILED: 'http://redpencil.data.gift/id/concept/JobStatus/failed',
  },
  RDF_TYPE: 'http://mu.semte.ch/vocabularies/ext/FileBundlingJob',
  JSONAPI_JOB_TYPE: 'file-bundling-jobs',
};

module.exports = {
  RESOURCE_BASE,
  STORAGE_PATH,
  JOB
};
