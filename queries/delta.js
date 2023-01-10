import { sparqlEscapeUri } from 'mu';
import { querySudo, updateSudo } from '@lblod/mu-auth-sudo';
import { parseSparqlResults } from './util';

const WHERE_TEMPLATE = `
WHERE {
    GRAPH ?g {
        ?job a ext:FileBundlingJob ;
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
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

SELECT DISTINCT ?job ?collection ?file ?physf
` + WHERE_TEMPLATE.replace('#FILE_URI_PLACEHOLDER#', sparqlEscapeUri(fileUri)) + `
ORDER BY ?job ?collection
  `;

  const result = await querySudo(queryString);
  return parseSparqlResults(result);
}

async function findJobsWithoutCollectionMembers () {
  const queryString = `
  PREFIX prov: <http://www.w3.org/ns/prov#>
  PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
  PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

  SELECT DISTINCT ?job ?collection ?file ?physf WHERE {
      GRAPH ?g {
          ?job a ext:FileBundlingJob ;
              prov:used ?collection .
          ?collection a prov:Collection .
          ?job prov:generated ?file .
          ?file a nfo:FileDataObject .
          ?physf a nfo:FileDataObject ;
              nie:dataSource ?file .
          FILTER NOT EXISTS { ?collection prov:hadMember ?o .}
      }
  }`

  const result = await querySudo(queryString);
  return parseSparqlResults(result);
}

async function removeJobAndCollection (jobObject) {
  const job = jobObject.job;
  if (job) {
    await removePhysicalFilesOfJob(job);
    await removeVirtualFilesOfJob(job); 
    await removeCollectionsOfJob(job);
    await removeJob(job);
  }
}

async function removePhysicalFilesOfJob (jobUri) {
  // the files on disk should already be removed, this query takes care of the metadata of the physical file.
  const queryString = `
  PREFIX prov: <http://www.w3.org/ns/prov#>
  PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
  PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  
  DELETE {
      GRAPH ?g {
        ?physf ?physfP ?physfO .
      }
  }
  WHERE {
    GRAPH ?g {
      ${sparqlEscapeUri(jobUri)} a ext:FileBundlingJob ;
      prov:generated ?file .
      ?physf a nfo:FileDataObject ;
          nie:dataSource ?file ;
          ?physfP ?physfO .
    }
  }` 
  await updateSudo(queryString);
}

async function removeVirtualFilesOfJob (jobUri) {
  const queryString = `
  PREFIX prov: <http://www.w3.org/ns/prov#>
  PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
  PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  
  DELETE {
      GRAPH ?g {
          ?file ?virtfP ?virtfO .
      }
  }
  WHERE {
    GRAPH ?g {
      ${sparqlEscapeUri(jobUri)} a ext:FileBundlingJob ;
          prov:generated ?file .
      ?file a nfo:FileDataObject ;
          ?virtfP ?virtfO .
    }
  }` 
  await updateSudo(queryString);
}

async function removeCollectionsOfJob (jobUri) {
  const queryString = `
  PREFIX prov: <http://www.w3.org/ns/prov#>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  
  DELETE {
      GRAPH ?g {
          ?collection ?collectionP ?collectionO .
      }
  }
  WHERE {
    GRAPH ?g {
      ${sparqlEscapeUri(jobUri)} a ext:FileBundlingJob ;
            prov:used ?collection .
        ?collection a prov:Collection ;
            ?collectionP ?collectionO .
    }
  }`
  await updateSudo(queryString);
}

async function removeJob (jobUri) {
  const queryString = `
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  
  DELETE {
      GRAPH ?g {
        ${sparqlEscapeUri(jobUri)} ?jobP ?jobO .
      }
  }
  WHERE {
      GRAPH ?g {
          ${sparqlEscapeUri(jobUri)} a ext:FileBundlingJob ;
              ?jobP ?jobO .
      }
  }`
  await updateSudo(queryString);
}

export {
  findJobsUsingFile,
  findJobsWithoutCollectionMembers,
  removeJobAndCollection
};
