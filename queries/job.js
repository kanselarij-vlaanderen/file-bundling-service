import { query, update, uuid as generateUuid, sparqlEscapeString, sparqlEscapeUri, sparqlEscapeDateTime } from 'mu';
// import { querySudo, updateSudo } from '@lblod/mu-auth-sudo';
import { RESOURCE_BASE } from '../config';
import { parseSparqlResults } from './util';

// const SCHEDULED = 'scheduled';
const RUNNING = 'http://vocab.deri.ie/cogs#Running';
const SUCCESS = 'http://vocab.deri.ie/cogs#Success';
const FAIL = 'http://vocab.deri.ie/cogs#Fail';

async function createJob () {
  const uuid = generateUuid();
  const job = {
    uri: RESOURCE_BASE + `/file-bundling-jobs/${uuid}`,
    id: uuid,
    status: RUNNING,
    created: new Date()
  };
  const queryString = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX cogs: <http://vocab.deri.ie/cogs#>

  INSERT DATA {
      ${sparqlEscapeUri(job.uri)} a cogs:Job , ext:FileBundlingJob ;
          mu:uuid ${sparqlEscapeString(job.id)} ;
          ext:status ${sparqlEscapeString(job.status)} ;
          dct:created ${sparqlEscapeDateTime(job.created)} .
  }`;
  await update(queryString);
  return job;
}

async function attachCollectionToJob (job, collection) {
  const queryString = `
  PREFIX cogs: <http://vocab.deri.ie/cogs#>
  PREFIX prov: <http://www.w3.org/ns/prov#>

  INSERT {
      ${sparqlEscapeUri(job)} prov:used ${sparqlEscapeUri(collection)} .
  }
  WHERE {
      ${sparqlEscapeUri(job)} a ext:FileBundlingJob .
      ${sparqlEscapeUri(collection)} a prov:Collection .
  }`;
  await update(queryString);
  return job;
}

async function attachResultToJob (job, result) {
  const queryString = `
  PREFIX cogs: <http://vocab.deri.ie/cogs#>
  PREFIX prov: <http://www.w3.org/ns/prov#>

  INSERT {
      ${sparqlEscapeUri(job)} prov:generated ${sparqlEscapeUri(result)} .
  }
  WHERE {
      ${sparqlEscapeUri(job)} a ext:FileBundlingJob .
  }`;
  await update(queryString);
  return job;
}

async function updateJobStatus (uri, status) {
  const time = new Date();
  let timePred;
  if (status === SUCCESS || status === FAIL) { // final statusses
    timePred = 'http://www.w3.org/ns/prov#endedAtTime';
  } else {
    timePred = 'http://www.w3.org/ns/prov#startedAtTime';
  }
  const escapedUri = sparqlEscapeUri(uri);
  const queryString = `
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX cogs: <http://vocab.deri.ie/cogs#>

  DELETE {
      ${escapedUri} ext:status ?status ;
          ${sparqlEscapeUri(timePred)} ?time .
   }
  INSERT {
      ${escapedUri} ext:status ${sparqlEscapeUri(status)} ;
          ${sparqlEscapeUri(timePred)} ${sparqlEscapeDateTime(time)} .
  }
  WHERE {
      ${escapedUri} a ext:FileBundlingJob .
      OPTIONAL { ${escapedUri} ext:status ?status }
      OPTIONAL { ${escapedUri} ${sparqlEscapeUri(timePred)} ?time }
  }`;
  await update(queryString);
}

async function findJobUsingCollection (collection) {
  const queryString = `
  PREFIX cogs: <http://vocab.deri.ie/cogs#>
  PREFIX prov: <http://www.w3.org/ns/prov#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>

  SELECT (?job AS ?uri) (?uuid as ?id) ?generated ?status ?created ?started ?ended WHERE {
      ${sparqlEscapeUri(collection)} a prov:Collection .
      ?job a ext:FileBundlingJob ;
          mu:uuid ?uuid ;
          ext:status ${sparqlEscapeUri(SUCCESS)} ;
          ext:status ?status ;
          prov:generated ?generated .
      ?generated a nfo:FileDataObject ;
          mu:uuid ?generatedId .
      OPTIONAL { ?job dct:created ?created }
      OPTIONAL { ?job prov:startedAtTime ?started }
      OPTIONAL { ?job prov:endedAtTime ?ended }
  }`;
  const results = await query(queryString);
  const parsedResults = parseSparqlResults(results);
  if (parsedResults.length > 0) {
    return parsedResults[0];
  } else {
    return null;
  }
}

export {
  createJob,
  attachCollectionToJob,
  attachResultToJob,
  updateJobStatus,
  RUNNING, SUCCESS, FAIL,
  findJobUsingCollection
};
