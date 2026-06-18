import { query, update, sparqlEscapeString, sparqlEscapeUri } from 'mu';
import { querySudo } from '@lblod/mu-auth-sudo';
import { parseSparqlResults } from './util';
import { createCollection as createCollectionObject, computeMembersHash } from '../lib/collection';

async function createCollection (members) {
  const collection = createCollectionObject(members);
  const queryString = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX prov: <http://www.w3.org/ns/prov#>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

  INSERT DATA {
      ${sparqlEscapeUri(collection.uri)} a prov:Collection ;
            mu:uuid ${sparqlEscapeString(collection.id)} ;
            ext:sha256 ${sparqlEscapeString(collection.sha)} ;
            prov:hadMember ${collection.members.map(m => sparqlEscapeUri(m.uri)).join(',\n              ')} .
  }
  `;
  await update(queryString);
  return collection;
}

async function findCollectionFileMembers (collection) {
  // Returns an array of URIs
  const q = `
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

SELECT DISTINCT ?graph (?file as ?uri) ?id ?name ?physicalUri
WHERE {
    GRAPH ?graph {
        ${sparqlEscapeUri(collection)} a prov:Collection ;
            prov:hadMember ?file ;
            ext:sha256 ?sha .
        ?file a nfo:FileDataObject ;
            mu:uuid ?id ;
            nfo:fileName ?name .
        ?physicalUri a nfo:FileDataObject ;
            nie:dataSource ?file .
    }
}
  `;
  const results = await querySudo(q);
  const parsedResults = parseSparqlResults(results);

  return parsedResults;
}

async function findCollectionByMembers (members) {
  /*
   * Searches based on a hash of members instead of their literal triples,
   * as the latter causes computational heavy queries (inner joins) which the DB cannot handle
   */
  const sha = computeMembersHash(members);
  const q = `
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
SELECT DISTINCT (?collection as ?uri)
WHERE {
    ?collection a prov:Collection ;
        ext:sha256 ${sparqlEscapeString(sha)} .
}
  `;
  const results = await query(q); // NO SUDO!
  const parsedResults = parseSparqlResults(results);
  if (parsedResults.length > 0) {
    return parsedResults[0];
  } else {
    return null;
  }
}

export {
  createCollection,
  findCollectionFileMembers,
  findCollectionByMembers
};
