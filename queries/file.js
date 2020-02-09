import { sparqlEscapeString, sparqlEscapeUri, sparqlEscapeInt, sparqlEscapeDateTime, query, update, uuid as generateUuid } from 'mu';
import { parseSparqlResults } from './util';
import { RESOURCE_BASE } from '../config';

const getFilesById = async function (fileIds) {
  const q = `
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
PREFIX dbpedia: <http://dbpedia.org/ontology/>

SELECT DISTINCT (?file AS ?uri) ?name ?extension
WHERE {
    ?file a nfo:FileDataObject ;
        mu:uuid ?uuid .
    OPTIONAL { ?file nfo:fileName ?name . }
    OPTIONAL { ?file dbpedia:fileExtension ?extension . }
    VALUES ?uuid {
        ${fileIds.map(sparqlEscapeString).join('        \n')}
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

module.exports = {
  getFilesById,
  createFile
};
