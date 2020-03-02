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

async function findCollectionsHavingMembers (members) {
  /*
   * Finding collections that at least have the members we want.
   * Batched, because Virtuoso 7.2.5.1 doesn't like testing more than 96 members at the same time in our current setup:
   * Virtuoso 37000 Error SP031: SPARQL: Internal error: The length of generated SQL text has exceeded 10000 lines of code
   * Batched smaller , because Virtuoso 7.2.5.1 doesn't like testing more than 75 members at the same time in our current setup:
   * Virtuoso 42000 Error SR483: Stack Overflow
   */
  const BATCH_SIZE = 50;
  let membersToTest = members;
  let batchSize = membersToTest.length > BATCH_SIZE ? BATCH_SIZE : membersToTest.length;
  let isFinalBatch = membersToTest.length <= BATCH_SIZE;
  let membersBatch = membersToTest.slice(0, batchSize);
  const queryString = `
PREFIX prov: <http://www.w3.org/ns/prov#>
SELECT DISTINCT ?collection
WHERE {
    ?collection a prov:Collection ;
         prov:hadMember ${membersBatch.map(sparqlEscapeUri).join(',\n         ')} .
}
  `;
  let results = await query(queryString);
  let collections = parseSparqlResults(results).map(c => c.collection);
  if (isFinalBatch) {
    return collections;
  } else {
    membersToTest = membersToTest.slice(BATCH_SIZE);
  }
  while (collections.length > 0) {
    batchSize = membersToTest.length > BATCH_SIZE ? BATCH_SIZE : membersToTest.length;
    isFinalBatch = membersToTest.length <= BATCH_SIZE;
    membersBatch = membersToTest.slice(0, batchSize);
    const queryString = `
PREFIX prov: <http://www.w3.org/ns/prov#>
SELECT DISTINCT ?collection
WHERE {
    ?collection a prov:Collection ;
         prov:hadMember ${membersBatch.map(sparqlEscapeUri).join(',\n         ')} .
    VALUES ?collection {
        ${collections.map(sparqlEscapeUri).join('\n        ')}
    }
}
    `;
    results = await query(queryString);
    collections = parseSparqlResults(results).map(c => c.collection);
    if (isFinalBatch) {
      break;
    } else {
      membersToTest = membersToTest.slice(BATCH_SIZE);
    }
  }
  return collections;
}
async function findCollectionByMembers (members) {
  const collections = await findCollectionsHavingMembers(members);
  /*
   * Narrow down the collections to the ones having no more members than the ones we want.
   * Used as an alternative to FILTER ( NOT EXISTS { FILTER NOT IN ( ... ) } )
   * because Virtuoso 7.2.5.1 doesn't like that (Virtuoso 42000 Error SQ200: Stack Overflow in cost model)
   */
  if (collections.length > 1) {
    for (let i = 0; i < collections.length; i++) {
      const collection = collections[i];
      const filterQueryString = `
PREFIX prov: <http://www.w3.org/ns/prov#>
SELECT (COUNT(DISTINCT ?member) AS ?memberCount)
WHERE {
    ${sparqlEscapeUri(collection)} a prov:Collection ;
        prov:hadMember ?member .
}
       `;
      const memberCount = parseSparqlResults(await query(filterQueryString))[0].memberCount;
      if (memberCount === members.length) {
        return collection;
      }
    }
    return null;
  } else if (collections.length > 0) {
    return collections[0];
  } else {
    return null;
  }
}

export {
  createCollection,
  findCollectionByMembers
};
