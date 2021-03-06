import { updateSudo } from '@lblod/mu-auth-sudo';
import { sparqlEscapeString, sparqlEscapeUri, sparqlEscapeInt, sparqlEscapeDateTime, query, uuid as generateUuid } from 'mu';
import { parseSparqlResults } from './util';
import { RESOURCE_BASE } from '../config';

// const getFilesById = async function (fileIds) {
//   const BATCH_SIZE = 5;
//   let indexPointer = 0;
//   const nBatches = Math.ceil(fileIds.length / BATCH_SIZE);
//   let files = [];
//   console.log(`Fetching ${fileIds.length} fileIds total in ${nBatches} batches`);
//   for (let i = 0; i < nBatches; i++) {
//     const lastBatch = i === (nBatches - 1);
//     indexPointer = i * BATCH_SIZE;
//     let fileIdsBatch;
//     if (lastBatch) {
//       fileIdsBatch = fileIds.slice(indexPointer, fileIds.length);
//       if (fileIdsBatch.length === 0) {
//         break;
//       }
//     } else {
//       fileIdsBatch = fileIds.slice(indexPointer, indexPointer + BATCH_SIZE);
//     }
//     console.log(`Running batch ${i + 1}/${nBatches} for file id's`, fileIdsBatch);
//     const q = `
// PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
// PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
// PREFIX dbpedia: <http://dbpedia.org/ontology/>
// PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
//
// SELECT DISTINCT (?virtualFile AS ?uri) (?physicalFile AS ?physicalUri) (?uuid as ?id) ?name ?extension
// WHERE {
//     ?virtualFile a nfo:FileDataObject ;
//         mu:uuid ?uuid .
//     ?physicalFile a nfo:FileDataObject ;
//         nie:dataSource ?virtualFile .
//     ?virtualFile nfo:fileName ?name .
//     ?virtualFile dbpedia:fileExtension ?extension .
//     VALUES ?uuid {
//         ${fileIdsBatch.map(sparqlEscapeString).join('\n        ')}
//     }
// }
//     `;
//     const results = await query(q); // NO SUDO!
//     files = files.concat(parseSparqlResults(results));
//   }
//   console.log(`Returning ${files.length} files`);
//   return files;
// };

const getFilesById = async function (fileIds) {
  let files = [];
  for (let i = 0; i < fileIds.length; i++) {
    const q = `
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
PREFIX dbpedia: <http://dbpedia.org/ontology/>
PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

SELECT DISTINCT (?virtualFile AS ?uri) (?physicalFile AS ?physicalUri) (?uuid as ?id) ?name ?extension
WHERE {
    ?virtualFile a nfo:FileDataObject ;
        mu:uuid ${sparqlEscapeString(fileIds[i])} ;
        mu:uuid ?uuid .
    ?physicalFile a nfo:FileDataObject ;
        nie:dataSource ?virtualFile .
    ?virtualFile nfo:fileName ?name .
    ?virtualFile dbpedia:fileExtension ?extension .
}
    `;
    const results = await query(q); // NO SUDO!
    files = files.concat(parseSparqlResults(results));
  }
  return files;
};

const createFile = async function (file, physicalUri, graph) {
  const uri = RESOURCE_BASE + `/files/${file.id}`;
  const physicalUuid = generateUuid();
  const q = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
  PREFIX dbpedia: <http://dbpedia.org/ontology/>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

  INSERT DATA {
      GRAPH ${sparqlEscapeUri(graph)} {
          ${sparqlEscapeUri(uri)} a nfo:FileDataObject ;
                nfo:fileName ${sparqlEscapeString(file.name)} ;
                mu:uuid ${sparqlEscapeString(file.id)} ;
                dct:format ${sparqlEscapeString(file.format)} ;
                nfo:fileSize ${sparqlEscapeInt(file.size)} ;
                dbpedia:fileExtension ${sparqlEscapeString(file.extension)} ;
                dct:created ${sparqlEscapeDateTime(file.created)} ;
                dct:modified ${sparqlEscapeDateTime(file.created)} .
          ${sparqlEscapeUri(physicalUri)} a nfo:FileDataObject ;
                nie:dataSource ${sparqlEscapeUri(uri)} ;
                nfo:fileName ${sparqlEscapeString(`${physicalUuid}.${file.extension}`)} ;
                mu:uuid ${sparqlEscapeString(physicalUuid)} ;
                dct:format ${sparqlEscapeString(file.format)} ;
                nfo:fileSize ${sparqlEscapeInt(file.size)} ;
                dbpedia:fileExtension ${sparqlEscapeString(file.extension)} ;
                dct:created ${sparqlEscapeDateTime(file.created)} ;
                dct:modified ${sparqlEscapeDateTime(file.created)} .
      }
  }`;
  await updateSudo(q);
  file.uri = uri;
  return file;
};

const getFile = async function (file) {
  const uri = sparqlEscapeUri(file);
  const q = `
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
PREFIX dbpedia: <http://dbpedia.org/ontology/>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

SELECT (?uuid as ?id) ?name ?format ?size ?extension ?created ?modified
WHERE
{
    ${uri} a nfo:FileDataObject ;
          mu:uuid ?uuid .
    OPTIONAL { ${uri} nfo:fileName ?name }
    OPTIONAL { ${uri} dct:format ?format }
    OPTIONAL { ${uri} nfo:fileSize ?size }
    OPTIONAL { ${uri} dbpedia:fileExtension ?extension }
    OPTIONAL { ${uri} dct:created ?created }
    OPTIONAL { ${uri} dct:modified ?modified }
}
LIMIT 1
  `;
  const results = await query(q); // NO SUDO
  const parsedResults = parseSparqlResults(results);
  if (parsedResults.length > 0) {
    return parsedResults[0];
  } else {
    return null;
  }
};

module.exports = {
  getFilesById,
  createFile,
  getFile
};
