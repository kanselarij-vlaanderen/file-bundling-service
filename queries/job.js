import { query, update, uuid as generateUuid, sparqlEscapeString, sparqlEscapeUri, sparqlEscapeDateTime } from 'mu';
import { querySudo, updateSudo } from '@lblod/mu-auth-sudo';
import { RESOURCE_BASE, JOB } from '../config';
import { parseSparqlResults, sparqlQueryWithRetry } from './util';

async function createJob () {
  const uuid = generateUuid();
  const job = {
    uri: RESOURCE_BASE + `/${JOB.JSONAPI_JOB_TYPE}/${uuid}`,
    id: uuid,
    status: JOB.STATUSES.BUSY,
    created: new Date()
  };
  const queryString = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX cogs: <http://vocab.deri.ie/cogs#>
  PREFIX adms: <http://www.w3.org/ns/adms#>

  INSERT DATA {
      ${sparqlEscapeUri(job.uri)} a cogs:Job , ${sparqlEscapeUri(JOB.RDF_TYPE)} ;
          mu:uuid ${sparqlEscapeString(job.id)} ;
          adms:status ${sparqlEscapeUri(job.status)} ;
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
      ${sparqlEscapeUri(job)} a ${sparqlEscapeUri(JOB.RDF_TYPE)} .
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
          ${sparqlEscapeUri(job)} a ${sparqlEscapeUri(JOB.RDF_TYPE)} .
      }
  }`;
  await updateSudo(queryString);
  return job;
}

async function updateJobStatus (uri, status, errorMessage) {
  const time = new Date();
  let timePred;
  if (status === JOB.STATUSES.SUCCESS || status === JOB.STATUSES.FAILED) { // final statusses
    timePred = 'http://www.w3.org/ns/prov#endedAtTime';
  } else {
    timePred = 'http://www.w3.org/ns/prov#startedAtTime';
  }
  const escapedUri = sparqlEscapeUri(uri);
  const queryString = `
  PREFIX cogs: <http://vocab.deri.ie/cogs#>
  PREFIX adms: <http://www.w3.org/ns/adms#>
  PREFIX schema: <http://schema.org/>

  DELETE {
      GRAPH ?g {
          ${escapedUri} adms:status ?status ;
              ${sparqlEscapeUri(timePred)} ?time .
      }
  }
  INSERT {
      GRAPH ?g {
          ${escapedUri} adms:status ${sparqlEscapeUri(status)} .
          ${
            status !== JOB.STATUSES.SCHEDULED
              ? `${sparqlEscapeUri(uri)} ${sparqlEscapeUri(timePred)} ${sparqlEscapeDateTime(time)} .`
              : ""
          }
          ${
            errorMessage
              ? `${sparqlEscapeUri(uri)} schema:error ${sparqlEscapeString(errorMessage)} .`
              : ""
          }
      }
  }
  WHERE {
      GRAPH ?g {
          ${escapedUri} a ${sparqlEscapeUri(JOB.RDF_TYPE)} .
          OPTIONAL { ${escapedUri} adms:status ?status }
          OPTIONAL { ${escapedUri} ${sparqlEscapeUri(timePred)} ?time }
      }
  }`;
  await updateSudo(queryString);
}

async function findScheduledJob (job) {
  const queryString = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX prov: <http://www.w3.org/ns/prov#>
  PREFIX adms: <http://www.w3.org/ns/adms#>

  SELECT (?uuid as ?id) ?status ?used WHERE {
      GRAPH ?g {
          ${sparqlEscapeUri(job)} a ${sparqlEscapeUri(JOB.RDF_TYPE)} ;
              mu:uuid ?uuid .
          OPTIONAL { ${sparqlEscapeUri(job)} prov:used ?used . }
          OPTIONAL { ${sparqlEscapeUri(job)} adms:status ?status . }
          FILTER (?status = ${sparqlEscapeUri(JOB.STATUSES.SCHEDULED)})
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

//
async function findJobUsingCollection (collection) {
  const queryString = `
  PREFIX cogs: <http://vocab.deri.ie/cogs#>
  PREFIX prov: <http://www.w3.org/ns/prov#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
  PREFIX adms: <http://www.w3.org/ns/adms#>
  PREFIX schema: <http://schema.org/>

  SELECT (?job AS ?uri) (?uuid as ?id) ?generated ?status ?created ?started ?ended ?message WHERE {
      ${sparqlEscapeUri(collection)} a prov:Collection .
      ?job a ${sparqlEscapeUri(JOB.RDF_TYPE)} ;
          mu:uuid ?uuid ;
          adms:status ?status ;
          prov:generated ?generated ;
          prov:used ${sparqlEscapeUri(collection)} .
      VALUES ?status {
        ${sparqlEscapeUri(JOB.STATUSES.SUCCESS)}
        ${sparqlEscapeUri(JOB.STATUSES.BUSY)}
      }
      ?generated a nfo:FileDataObject ;
          mu:uuid ?generatedId .
      OPTIONAL { ?job dct:created ?created }
      OPTIONAL { ?job prov:startedAtTime ?started }
      OPTIONAL { ?job prov:endedAtTime ?ended }
      OPTIONAL { ?job schema:error ?message }
  }`;
  const results = await query(queryString); // NO SUDO!
  const parsedResults = parseSparqlResults(results);
  if (parsedResults.length > 0) {
    return parsedResults[0];
  } else {
    return null;
  }
}

async function findAllJobArchives () {
  const queryString = `
  PREFIX prov: <http://www.w3.org/ns/prov#>
  PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
  PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
  PREFIX adms: <http://www.w3.org/ns/adms#>

  SELECT DISTINCT ?job ?physf WHERE {
    GRAPH ?g {
      ?job a ${sparqlEscapeUri(JOB.RDF_TYPE)} ;
          prov:generated ?file ;
          adms:status ${sparqlEscapeUri(JOB.STATUSES.SUCCESS)} .
      ?physf a nfo:FileDataObject ;
          nie:dataSource ?file .
    }
  }`;
  const results = await sparqlQueryWithRetry(querySudo, queryString);
  return parseSparqlResults(results);
}

export {
  createJob,
  attachCollectionToJob,
  attachResultToJob,
  updateJobStatus,
  findJobUsingCollection,
  findScheduledJob,
  findAllJobArchives
};
