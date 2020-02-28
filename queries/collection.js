import { query, update, sparqlEscapeString, sparqlEscapeUri, uuid as generateUuid } from 'mu';
import { RESOURCE_BASE } from '../config';
import { parseSparqlResults } from './util';

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
SELECT DISTINCT ?collection
WHERE {
    ?collection a prov:Collection ;
         prov:hadMember ${members.map(sparqlEscapeUri).join(',\n         ')} .
}
  `;
  const results = await query(queryString);
  if (results.results.bindings.length > 1) {
    const collections = parseSparqlResults(results).map(c => c.collection);
    /*
     * Matches the collections that are no good.
     * Used as an alternative to FILTER ( NOT EXISTS { FILTER NOT IN ( ... ) } )
     * because Virtuoso 7.2.5.1 doesn't like that (Virtuoso 42000 Error SQ200: Stack Overflow in cost model)
     */
    for (let i = 0; i < collections.length; i++) {
      const collection = collections[i];
      const filterQueryString = `
PREFIX prov: <http://www.w3.org/ns/prov#>
ASK {
    ${sparqlEscapeUri(collection)} a prov:Collection ;
        prov:hadMember ?member .
    FILTER( ?member NOT IN (
        ${members.map(sparqlEscapeUri).join(',\n                ')}
    ))
}
       `;
      const withMoreExists = (await query(filterQueryString)).boolean;
      if (!withMoreExists) {
        return collection;
      }
    }
    return null;
  } else if (results.results.bindings.length > 0) {
    return results.results.bindings[0].collection.value;
  } else {
    return null;
  }
}

export {
  createCollection,
  findCollectionByMembers
};
