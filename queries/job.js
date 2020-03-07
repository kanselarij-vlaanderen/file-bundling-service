import { query, update, uuid as generateUuid, sparqlEscapeString, sparqlEscapeUri, sparqlEscapeDateTime } from 'mu';
import { querySudo, updateSudo } from '@lblod/mu-auth-sudo';
import { RESOURCE_BASE, RDF_JOB_TYPE } from '../config';
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
    created: new Date()
  };
  const queryString = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX cogs: <http://vocab.deri.ie/cogs#>

  INSERT DATA {
      ${sparqlEscapeUri(job.uri)} a cogs:Job , ${sparqlEscapeUri(RDF_JOB_TYPE)} ;
          mu:uuid ${sparqlEscapeString(job.id)} ;
          dct:created ${sparqlEscapeDateTime(job.created)} .
  }`;
  await update(queryString); // NO SUDO
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
      ${sparqlEscapeUri(job)} a ${sparqlEscapeUri(RDF_JOB_TYPE)} .
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
      GRAPH ?g {
        ${sparqlEscapeUri(job)} prov:generated ${sparqlEscapeUri(result)} .
      }
  }
  WHERE {
      GRAPH ?g {
          ${sparqlEscapeUri(job)} a ${sparqlEscapeUri(RDF_JOB_TYPE)} .
      }
  }`;
  await updateSudo(queryString);
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
      GRAPH ?g {
        ${escapedUri} ext:status ?status ;
            ${sparqlEscapeUri(timePred)} ?time .
      }
  }
  INSERT {
      GRAPH ?g {
          ${escapedUri} ext:status ${sparqlEscapeUri(status)} ;
              ${sparqlEscapeUri(timePred)} ${sparqlEscapeDateTime(time)} .
      }
  }
  WHERE {
      GRAPH ?g {
          ${escapedUri} a ${sparqlEscapeUri(RDF_JOB_TYPE)} .
          OPTIONAL { ${escapedUri} ext:status ?status }
          OPTIONAL { ${escapedUri} ${sparqlEscapeUri(timePred)} ?time }
      }
  }`;
  await updateSudo(queryString);
}

async function findJobTodo (job) {
  const queryString = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX prov: <http://www.w3.org/ns/prov#>

  SELECT (?uuid as ?id) ?status ?used WHERE {
      GRAPH ?g {
          ${sparqlEscapeUri(job)} a ${sparqlEscapeUri(RDF_JOB_TYPE)} ;
              mu:uuid ?uuid .
          OPTIONAL { ${sparqlEscapeUri(job)} prov:used ?used . }
          OPTIONAL {
              ${sparqlEscapeUri(job)} ext:status ?status .
              FILTER NOT EXISTS {
                  ${sparqlEscapeUri(job)} ext:status ?status .
                  VALUES ?status {
                      ${sparqlEscapeUri(SUCCESS)}
                      ${sparqlEscapeUri(FAIL)}
                  }
              }
          }
      }
  }`;
  const results = await querySudo(queryString);
  const parsedResults = parseSparqlResults(results);
  if (parsedResults.length > 0) {
    parsedResults[0].uri = job;
    return parsedResults[0];
  } else {
    return null;
  }
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
      ?job a ${sparqlEscapeUri(RDF_JOB_TYPE)} ;
          mu:uuid ?uuid ;
          ext:status ?status ;
          prov:generated ?generated ;
          prov:used ${sparqlEscapeUri(collection)} .
      VALUES ?status {
        ${sparqlEscapeUri(SUCCESS)}
        ${sparqlEscapeUri(RUNNING)}
      }
      ?generated a nfo:FileDataObject ;
          mu:uuid ?generatedId .
      OPTIONAL { ?job dct:created ?created }
      OPTIONAL { ?job prov:startedAtTime ?started }
      OPTIONAL { ?job prov:endedAtTime ?ended }
  }`;
  const results = await query(queryString); // NO SUDO!
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
  findJobUsingCollection,
  findJobTodo
};
