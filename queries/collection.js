import crypto from 'crypto';
import { query, update, sparqlEscapeString, sparqlEscapeUri, uuid as generateUuid } from 'mu';
import { querySudo } from '@lblod/mu-auth-sudo';
import { RESOURCE_BASE } from '../config';
import { parseSparqlResults } from './util';

async function createCollection (members) {
  const uuid = generateUuid();
  const uri = RESOURCE_BASE + `/collections/${uuid}`;
  const escapedUri = sparqlEscapeUri(uri);
  const sortedMembers = members.sort((a, b) => a.localeCompare(b));
  const hashFactory = crypto.createHash('sha256');
  const sha = hashFactory.update(sortedMembers.join('')).digest('hex');
  const queryString = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX prov: <http://www.w3.org/ns/prov#>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

  INSERT DATA {
      ${escapedUri} a prov:Collection ;
            mu:uuid ${sparqlEscapeString(uuid)} ;
            ext:sha256 ${sparqlEscapeString(sha)} ;
            prov:hadMember ${members.map(sparqlEscapeUri).join(',\n              ')} .
  }
  `;
  await update(queryString);
  return {
    uri,
    id: uuid,
    members
  };
}

async function findCollectionFileMembers (collection) {
  // Returns an array of URIs
  const q = `
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

SELECT DISTINCT ?graph (?file as ?uri) ?name ?physicalUri
WHERE {
    GRAPH ?graph {
        ${sparqlEscapeUri(collection)} a prov:Collection ;
            prov:hadMember ?file ;
            ext:sha256 ?sha .
        ?file a nfo:FileDataObject ;
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
  const sortedMembers = members.sort((a, b) => a.localeCompare(b));
  const hashFactory = crypto.createHash('sha256');
  const sha = hashFactory.update(sortedMembers.join('')).digest('hex');
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
  console.log('parsed results:', parsedResults);
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
