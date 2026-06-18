import { updateSudo } from '@lblod/mu-auth-sudo';
import { sparqlEscapeString, sparqlEscapeUri , query } from 'mu';
import { parseSparqlResults } from './util';

async function renameFileFromDocument (doc, file, newFileName) {
  /*
   * Note that this query renames files in all graphs, while they only really need to be in one.
   * Renaming the files in all graphs however, keeps distributed data in sync. It also isn't a lost effort, since
   * renaming will have to be done anyway when someone with access to another graph requests a file-bundling-job.
   */
  const q = `
  PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
  PREFIX dossier: <https://data.vlaanderen.be/ns/dossier#>
  PREFIX prov: <http://www.w3.org/ns/prov#>

  DELETE {
      GRAPH ?g {
          ${sparqlEscapeUri(file)} nfo:fileName ?fileName .
      }
  }
  INSERT {
      GRAPH ?g {
          ${sparqlEscapeUri(file)} nfo:fileName ${sparqlEscapeString(newFileName)} .
      }
  }
  WHERE {
      GRAPH ?g {
          { ${sparqlEscapeUri(doc)} a dossier:Stuk ;
              prov:value ${sparqlEscapeUri(file)} . }
          UNION
          { ${sparqlEscapeUri(doc)} a dossier:Stuk ;
              prov:value / ^prov:hadPrimarySource ${sparqlEscapeUri(file)} . }
          ${sparqlEscapeUri(file)} a nfo:FileDataObject ;
              nfo:fileName ?fileName .
          FILTER (?fileName != ${sparqlEscapeString(newFileName)})
      }
  }`;
  await updateSudo(q);
}

async function renameFlattenedPieceFromDocument(doc, file, newPieceName) {
  /*
   * Note that this query renames pieces in all graphs, while they only really need to be in one.
   * Renaming the pieces in all graphs however, keeps distributed data in sync. It also isn't a lost effort, since
   * renaming will have to be done anyway when someone with access to another graph requests a file-bundling-job.
   */
  const q = `
  PREFIX dossier: <https://data.vlaanderen.be/ns/dossier#>
  PREFIX prov: <http://www.w3.org/ns/prov#>
  PREFIX dct: <http://purl.org/dc/terms/>

  DELETE {
      GRAPH ?g {
          ${sparqlEscapeUri(doc)} dct:title ?pieceName .
      }
  }
  INSERT {
      GRAPH ?g {
          ${sparqlEscapeUri(doc)} dct:title ${sparqlEscapeString(newPieceName)} .
      }
  }
  WHERE {
      GRAPH ?g {
          ${sparqlEscapeUri(doc)} a dossier:Stuk ;
            prov:value ${sparqlEscapeUri(file)} ;
            dct:title ?pieceName .
          FILTER (?pieceName != ${sparqlEscapeString(newPieceName)})
      }
  }`;
  await updateSudo(q);
}


async function getMandateesForDocument (documentUri, isDecision) {
  if (!documentUri) {
    return [];
  }
  let queryString = `PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
PREFIX prov: <http://www.w3.org/ns/prov#>

SELECT DISTINCT ?mandatee WHERE {
    ?submissionActivity prov:generated ${sparqlEscapeUri(documentUri)} ;
                        ext:indieningVindtPlaatsTijdens ?subcase  .
    ?subcase ext:heeftBevoegde ?mandatee .
}`
  if (isDecision) {
    queryString = `PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>

SELECT DISTINCT ?mandatee WHERE {
     ${sparqlEscapeUri(documentUri)} besluitvorming:beschrijft ?decisionActivity .
     ?decisionActivity ext:beslissingVindtPlaatsTijdens ?subcase .
     ?subcase ext:heeftBevoegde ?mandatee .
}`
  }

  const data = await query(queryString);
  return parseSparqlResults(data);
}

/* Returns the array of files passed, plus any source files for the signed PDFs, if any */
async function addSourceFilesForSignedPdfs(files) {
  if (files.length === 0)
    return [];
  let filesToReturn = [...files];
  const FILE_SOURCE_QUERY_BATCH_SIZE = 20; // avoid the query getting too long for large agendas
  const nrOfBatches = Math.ceil((1.0 * files.length) / FILE_SOURCE_QUERY_BATCH_SIZE);
  for (let i = 0; i < nrOfBatches; i++) {
    let filesInBatch = files.slice(i*FILE_SOURCE_QUERY_BATCH_SIZE, i*FILE_SOURCE_QUERY_BATCH_SIZE + FILE_SOURCE_QUERY_BATCH_SIZE);
    let queryString = `PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX prov: <http://www.w3.org/ns/prov#>
    PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
    PREFIX dbpedia: <http://dbpedia.org/ontology/>
    PREFIX sign: <http://mu.semte.ch/vocabularies/ext/handtekenen/>

      SELECT DISTINCT ?uri ?name ?extension ?document ?originalDocumentName WHERE {
          VALUES (?file ?originalDocumentName) {
            ${filesInBatch.map((f) =>{
              return `(${sparqlEscapeUri(f.uri)} ${sparqlEscapeString(f.originalDocumentName)})`
            }).join(' ')}
          }
          ?file ^prov:value ?piece  .
          ?piece ^sign:getekendStukKopie ?document .
          ?document prov:value ?uri .
          ?uri nfo:fileName ?name ;
            dbpedia:fileExtension ?extension .
          ?uri ^prov:hadPrimarySource ?derived .
      }`; // we only want the source files
    const data = await query(queryString);
    const sourceFiles = parseSparqlResults(data);
    filesToReturn = [...filesToReturn, ...sourceFiles];
  }
  return filesToReturn;
}

export {
  renameFileFromDocument,
  getMandateesForDocument,
  renameFlattenedPieceFromDocument,
  addSourceFilesForSignedPdfs
};
