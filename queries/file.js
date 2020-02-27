import { sparqlEscapeString, sparqlEscapeUri, sparqlEscapeInt, sparqlEscapeDateTime, query, update, uuid as generateUuid } from 'mu';
import { parseSparqlResults } from './util';
import { RESOURCE_BASE } from '../config';

const getFilesById = async function (fileIds) {
  const q = `
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
PREFIX dbpedia: <http://dbpedia.org/ontology/>
PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

SELECT DISTINCT (?virtualFile AS ?uri) (?physicalFile AS ?physicalUri) (?uuid as ?id) ?name ?extension
WHERE {
    ?virtualFile a nfo:FileDataObject ;
        mu:uuid ?uuid .
    ?physicalFile a nfo:FileDataObject ;
       nie:dataSource ?virtualFile .
    OPTIONAL { ?virtualFile nfo:fileName ?name . }
    OPTIONAL { ?virtualFile dbpedia:fileExtension ?extension . }
    VALUES ?uuid {
        ${fileIds.map(sparqlEscapeString).join('\n        ')}
    }
}
`;
  const results = await query(q);
  return parseSparqlResults(results);
};

const createFile = async function (file, physicalUri) {
  const uri = RESOURCE_BASE + `/files/${file.id}`;
  const physicalUuid = generateUuid();
  const q = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
  PREFIX dbpedia: <http://dbpedia.org/ontology/>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

  INSERT DATA {
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
  }`;
  await update(q);
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
  const results = await query(q);
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
