import { query, update, sparqlEscapeString, sparqlEscapeUri, uuid as generateUuid } from 'mu';
import { RESOURCE_BASE } from '../config';

async function createCollection (members) {
  const uuid = generateUuid();
  const uri = RESOURCE_BASE + `/collections/${uuid}`;
  const escapedUri = sparqlEscapeUri(uri);
  const queryString = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX cogs: <http://vocab.deri.ie/cogs#>
  PREFIX prov: <http://www.w3.org/ns/prov#>

  INSERT DATA {
      ${escapedUri} a prov:Collection ;
          mu:uuid ${sparqlEscapeString(uuid)} ;
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

async function findCollectionByMembers (members) {
  const queryString = `
    PREFIX prov: <http://www.w3.org/ns/prov#>
    SELECT ?collection
    WHERE {
        ?collection a prov:Collection ;
             prov:hadMember ${members.map(sparqlEscapeUri).join(',\n                 ')} .
        ?collection prov:hadMember ?member .
        FILTER (?member in (
            ${members.map(sparqlEscapeUri).join(',\n            ')}
        ))
    }
  `;
  const results = await query(queryString);
  if (results.results.bindings.length > 0) {
    return results.results.bindings[0].collection.value;
  } else {
    return null;
  }
}

export {
  createCollection,
  findCollectionByMembers
};
