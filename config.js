
const RESOURCE_BASE = 'http://mu.semte.ch/services/file-bundling-service';
const MU_APPLICATION_FILE_STORAGE_PATH = process.env.MU_APPLICATION_FILE_STORAGE_PATH || '';
let STORAGE_PATH = `/share/${MU_APPLICATION_FILE_STORAGE_PATH}`;

if (!STORAGE_PATH.endsWith('/')) {
  STORAGE_PATH = `${STORAGE_PATH}/`;
}

const RDF_JOB_TYPE = 'http://mu.semte.ch/vocabularies/ext/FileBundlingJob';

module.exports = {
  RESOURCE_BASE,
  STORAGE_PATH,
  RDF_JOB_TYPE
};
