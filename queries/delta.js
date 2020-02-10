import { sparqlEscapeUri } from 'mu';
import { querySudo, updateSudo } from '@lblod/mu-auth-sudo';
import { parseSparqlResults } from './util';

const WHERE_TEMPLATE = `
WHERE {
    GRAPH ?g {
        ?job a cogs:Job ;
            ?jobP ?jobO .
        ?job prov:used ?collection .
        ?collection a prov:Collection ;
            prov:hadMember #FILE_URI_PLACEHOLDER# ;
            ?collectionP ?collectionO .
        ?job prov:generated ?file .
        ?file a nfo:FileDataObject ;
            ?virtfP ?virtfO .
        ?physf a nfo:FileDataObject ;
            nie:dataSource ?file ;
            ?physfP ?physfO .
    }
}`;

async function findJobsUsingFile (fileUri) {
  const queryString = `
PREFIX cogs: <http://vocab.deri.ie/cogs#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

SELECT DISTINCT ?job ?collection ?file ?physf
` + WHERE_TEMPLATE.replace('#FILE_URI_PLACEHOLDER#', sparqlEscapeUri(fileUri)) + `
ORDER BY ?job ?collection
  `;

  const result = await querySudo(queryString);
  return parseSparqlResults(result);
}

async function removeJobsUsingFile (fileUri) {
  const queryString = `
PREFIX cogs: <http://vocab.deri.ie/cogs#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

DELETE {
    GRAPH ?g {
        ?job ?jobP ?jobO .
        ?collection ?collectionP ?collectionO .
        ?file ?virtfP ?virtfO .
        ?physf ?physfP ?physfO .
    }
}
  ` + WHERE_TEMPLATE.replace('#FILE_URI_PLACEHOLDER#', sparqlEscapeUri(fileUri));

  await updateSudo(queryString);
}

export {
  findJobsUsingFile,
  removeJobsUsingFile
};
