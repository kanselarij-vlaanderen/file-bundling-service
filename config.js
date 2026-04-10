const ALLOWED_DELTA_SIZE = process.env.ALLOWED_DELTA_SIZE || '100mb';

const RESOURCE_BASE = 'http://mu.semte.ch/services/file-bundling-service';
const MU_APPLICATION_FILE_STORAGE_PATH = process.env.MU_APPLICATION_FILE_STORAGE_PATH || '';
let STORAGE_PATH = `/share/${MU_APPLICATION_FILE_STORAGE_PATH}`;

if (!STORAGE_PATH.endsWith('/')) {
  STORAGE_PATH = `${STORAGE_PATH}/`;
}

const RDF_JOB_TYPE = 'http://mu.semte.ch/vocabularies/ext/FileBundlingJob';

const ROLES = {
  ADMIN: 'http://themis.vlaanderen.be/id/gebruikersrol/9a969b13-e80b-424f-8a82-a402bcb42bc5',
  KANSELARIJ: 'http://themis.vlaanderen.be/id/gebruikersrol/ab39b02a-14a5-4aa9-90bd-e0fa268b0f3d',
  SECRETARIE: 'http://themis.vlaanderen.be/id/gebruikersrol/c2ef1785-bf28-458f-952d-aa40989347d2',
  MINISTER: 'http://themis.vlaanderen.be/id/gebruikersrol/01ace9e0-f810-474e-b8e0-f578ff1e230d',
  KABINET_DOSSIERBEHEERDER: 'http://themis.vlaanderen.be/id/gebruikersrol/6bcebe59-0cb5-4c5e-ab40-ca98b65887a4',
}

module.exports = {
  ALLOWED_DELTA_SIZE,
  RESOURCE_BASE,
  STORAGE_PATH,
  RDF_JOB_TYPE,
  ROLES
};
