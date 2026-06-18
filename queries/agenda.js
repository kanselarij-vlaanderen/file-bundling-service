import { sparqlEscapeString, sparqlEscapeUri, query } from 'mu';
import { parseSparqlResults } from './util';
import { DECISION_RESULT_CODES_LIST } from '../config';

const fetchFilesFromAgenda = async (agendaId, currentUser, extensions, areDecisionsReleased, newDocumentsOnly) => {
  let queryString = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX dbpedia: <http://dbpedia.org/ontology/>
  PREFIX dossier: <https://data.vlaanderen.be/ns/dossier#>
  PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
  PREFIX prov: <http://www.w3.org/ns/prov#>
  PREFIX pav: <http://purl.org/pav/>
  PREFIX sign: <http://mu.semte.ch/vocabularies/ext/handtekenen/>

  SELECT DISTINCT (?file AS ?uri) ?name ?extension ?document ?originalDocumentName ?flattenedDocumentName`
  if (currentUser.hasLimitedRole) {
    queryString += ' ?confidentialityLevel'
  }
  queryString += `
  WHERE {
      ?agenda a besluitvorming:Agenda ;
          mu:uuid ${sparqlEscapeString(agendaId)} ;
          dct:hasPart ?agendaitem .
      ?agendaitem a besluit:Agendapunt ;
          besluitvorming:geagendeerdStuk ?originalDocument .
      ?originalDocument a dossier:Stuk ;
          dct:title ?originalDocumentName .
      OPTIONAL { ?nextDocument pav:previousVersion ?originalDocument . }
      FILTER NOT EXISTS { ?agendaitem besluitvorming:geagendeerdStuk ?nextDocument . } `
  if (newDocumentsOnly) {
    queryString += `
      OPTIONAL { ?agendaitem prov:wasRevisionOf ?previousAgendaitem . }
      FILTER NOT EXISTS { ?previousAgendaitem besluitvorming:geagendeerdStuk ?originalDocument . }
    `
  }
    queryString += `
      {
          ?originalDocument prov:value ?originalFile .
      } UNION {
          ?originalDocument prov:value / ^prov:hadPrimarySource ?originalFile .
      }
      OPTIONAL {
          ?originalDocument sign:getekendStukKopie ?flattenedDocument .
          ?flattenedDocument prov:value ?flattenedFile .
          ?flattenedDocument dct:title ?flattenedDocumentName .
      }
      BIND(COALESCE(?flattenedDocument , ?originalDocument) AS ?document)
      BIND(COALESCE(?flattenedFile , ?originalFile) AS ?file)
  `
  if (areDecisionsReleased) {
    queryString += `
      OPTIONAL {
        ?agendaitem ^dct:subject/besluitvorming:heeftBeslissing/besluitvorming:resultaat ?decisionResultCode .
      }
      FILTER (?decisionResultCode NOT IN (${DECISION_RESULT_CODES_LIST
      .map((uri) => sparqlEscapeUri(uri))
      .join(", ")}))
    `
  }
  if (currentUser.hasLimitedRole) {
    queryString += `
      ?document besluitvorming:vertrouwelijkheidsniveau ?confidentialityLevel .`
  }
  if (extensions.length) {
    queryString += `
    VALUES ?extension { ${extensions.map(extension => sparqlEscapeString(extension).toLowerCase()).join(" ")} ${extensions.map(extension => sparqlEscapeString(extension).toUpperCase()).join(" ")} }`
  }
  queryString += `
      ?file a nfo:FileDataObject ;
          nfo:fileName ?name ;
          dbpedia:fileExtension ?extension .
  }`;
  const data = await query(queryString);
  return parseSparqlResults(data);
};

const fetchFilesFromAgendaByMandatees = async (agendaId, mandateeIds, currentUser, extensions, areDecisionsReleased, newDocumentsOnly) => {
  let queryString = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX dbpedia: <http://dbpedia.org/ontology/>
  PREFIX dossier: <https://data.vlaanderen.be/ns/dossier#>
  PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
  PREFIX prov: <http://www.w3.org/ns/prov#>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX pav: <http://purl.org/pav/>
  PREFIX sign: <http://mu.semte.ch/vocabularies/ext/handtekenen/>

  SELECT DISTINCT (?file AS ?uri) ?name ?extension ?document ?originalDocumentName ?flattenedDocumentName`
  if (currentUser.hasLimitedRole) {
    queryString += ' ?confidentialityLevel'
  }
  queryString += `
  WHERE {
      ?agendaitem a besluit:Agendapunt ;
          besluitvorming:geagendeerdStuk ?originalDocument .
      OPTIONAL { ?nextDocument pav:previousVersion ?originalDocument . }
      FILTER NOT EXISTS { ?agendaitem besluitvorming:geagendeerdStuk ?nextDocument . }`
  if (newDocumentsOnly) {
    queryString += `
      OPTIONAL { ?agendaitem prov:wasRevisionOf ?previousAgendaitem . }
      FILTER NOT EXISTS { ?previousAgendaitem besluitvorming:geagendeerdStuk ?originalDocument . }
    `
  }
  queryString += `
      {
        ?agenda a besluitvorming:Agenda ;
          mu:uuid ${sparqlEscapeString(agendaId)} ;
          dct:hasPart ?agendaitem .
        ?agendaitem ext:heeftBevoegdeVoorAgendapunt ?mandatee .
        ?mandatee mu:uuid ?mandateeId .
        FILTER (?mandateeId IN (${mandateeIds
          .map((id) => sparqlEscapeString(id))
          .join(", ")}))
      } UNION {
        ?agenda a besluitvorming:Agenda ;
          mu:uuid ${sparqlEscapeString(agendaId)} ;
          dct:hasPart ?agendaitem .
        FILTER NOT EXISTS { ?agendaitem ext:heeftBevoegdeVoorAgendapunt ?mandatee . }
      }
      ?originalDocument a dossier:Stuk ;
          dct:title ?originalDocumentName .
      {
          ?originalDocument prov:value ?originalFile .
      } UNION {
          ?originalDocument prov:value / ^prov:hadPrimarySource ?originalFile .
      }
      OPTIONAL {
          ?originalDocument sign:getekendStukKopie ?flattenedDocument .
          ?flattenedDocument prov:value ?flattenedFile .
          ?flattenedDocument dct:title ?flattenedDocumentName .
      }
      BIND(COALESCE(?flattenedDocument , ?originalDocument) AS ?document)
      BIND(COALESCE(?flattenedFile , ?originalFile) AS ?file)
      `
  if (areDecisionsReleased) {
    queryString += `
      OPTIONAL {
        ?agendaitem ^dct:subject/besluitvorming:heeftBeslissing/besluitvorming:resultaat ?decisionResultCode .
      }
      FILTER (?decisionResultCode NOT IN (${DECISION_RESULT_CODES_LIST
      .map((uri) => sparqlEscapeUri(uri))
      .join(", ")}))
    `
  }
  if (currentUser.hasLimitedRole) {
    queryString += `
      ?document besluitvorming:vertrouwelijkheidsniveau ?confidentialityLevel .`
  }
  if (extensions.length) {
    queryString += `
    VALUES ?extension { ${extensions.map(extension => sparqlEscapeString(extension).toLowerCase()).join(" ")} ${extensions.map(extension => sparqlEscapeString(extension).toUpperCase()).join(" ")} }`
  }
  queryString += `
      ?file a nfo:FileDataObject ;
          nfo:fileName ?name ;
          dbpedia:fileExtension ?extension .
  }`;
  const data = await query(queryString);
  return parseSparqlResults(data);
};

const fetchDecisionsByMandatees = async (agendaId, mandateeIds, currentUser) => {
  let queryString = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX dbpedia: <http://dbpedia.org/ontology/>
  PREFIX dossier: <https://data.vlaanderen.be/ns/dossier#>
  PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
  PREFIX prov: <http://www.w3.org/ns/prov#>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX sign: <http://mu.semte.ch/vocabularies/ext/handtekenen/>

  SELECT DISTINCT (?file AS ?uri) ?name ?extension ?document ?originalDocumentName ?flattenedDocumentName`
  if (currentUser.hasLimitedRole) {
    queryString += ' ?confidentialityLevel'
  }
  queryString += `
  WHERE {
      ?agendaitem a besluit:Agendapunt ;
          ^dct:subject/besluitvorming:heeftBeslissing/^besluitvorming:beschrijft ?originalDocument .
          {
              ?originalDocument prov:value ?originalFile .
          } UNION {
              ?originalDocument prov:value / ^prov:hadPrimarySource ?originalFile .
          }
      {
        select ?agendaitem WHERE {
          {
            ?agenda a besluitvorming:Agenda ;
              mu:uuid ${sparqlEscapeString(agendaId)} ;
              dct:hasPart ?agendaitem .
            ?agendaitem ext:heeftBevoegdeVoorAgendapunt ?mandatee .
            ?mandatee mu:uuid ?mandateeId .
            FILTER (?mandateeId IN (${mandateeIds
              .map((id) => sparqlEscapeString(id))
              .join(", ")}))
          } UNION {
            ?agenda a besluitvorming:Agenda ;
              mu:uuid ${sparqlEscapeString(agendaId)} ;
              dct:hasPart ?agendaitem .
            FILTER NOT EXISTS { ?agendaitem ext:heeftBevoegdeVoorAgendapunt ?mandatee }
          }
        }
      }

      OPTIONAL {
          ?originalDocument sign:getekendStukKopie ?flattenedDocument .
          ?flattenedDocument prov:value ?flattenedFile .
          ?flattenedDocument dct:title ?flattenedDocumentName .
      }
      BIND(COALESCE(?flattenedDocument , ?originalDocument) AS ?document)
      BIND(COALESCE(?flattenedFile , ?originalFile) AS ?file)

      ?originalDocument a dossier:Stuk ;
          dct:title ?originalDocumentName .`
  if (currentUser.hasLimitedRole) {
    queryString += `
      ?document besluitvorming:vertrouwelijkheidsniveau ?confidentialityLevel .`
  }
  queryString += `
      ?file a nfo:FileDataObject ;
          nfo:fileName ?name ;
          dbpedia:fileExtension ?extension .
  }`;
  const data = await query(queryString);
  return parseSparqlResults(data);
};

const fetchDecisionsFromAgenda = async (agendaId, currentUser) => {
  let queryString = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX dbpedia: <http://dbpedia.org/ontology/>
  PREFIX dossier: <https://data.vlaanderen.be/ns/dossier#>
  PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
  PREFIX prov: <http://www.w3.org/ns/prov#>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX sign: <http://mu.semte.ch/vocabularies/ext/handtekenen/>

  SELECT DISTINCT (?file AS ?uri) ?name ?extension ?document ?originalDocumentName ?flattenedDocumentName`
  if (currentUser.hasLimitedRole) {
    queryString += ' ?confidentialityLevel'
  }
  queryString += `
  WHERE {
      ?agenda a besluitvorming:Agenda ;
          mu:uuid ${sparqlEscapeString(agendaId)} ;
          dct:hasPart ?agendaitem .
      ?agendaitem a besluit:Agendapunt ;
          ^dct:subject/besluitvorming:heeftBeslissing/^besluitvorming:beschrijft ?originalDocument .
      {
          ?originalDocument prov:value ?originalFile .
      } UNION {
          ?originalDocument prov:value / ^prov:hadPrimarySource ?originalFile .
      }

      OPTIONAL {
          ?originalDocument sign:getekendStukKopie ?flattenedDocument .
          ?flattenedDocument prov:value ?flattenedFile .
          ?flattenedDocument dct:title ?flattenedDocumentName .
      }
      BIND(COALESCE(?flattenedDocument , ?originalDocument) AS ?document)
      BIND(COALESCE(?flattenedFile , ?originalFile) AS ?file)

      ?originalDocument a dossier:Stuk ;
          dct:title ?originalDocumentName . `
  if (currentUser.hasLimitedRole) {
    queryString += `
      ?document besluitvorming:vertrouwelijkheidsniveau ?confidentialityLevel .`
  }
  queryString += `
      ?file a nfo:FileDataObject ;
          nfo:fileName ?name ;
          dbpedia:fileExtension ?extension .
  }`;
  const data = await query(queryString);
  return parseSparqlResults(data);
}
const fetchAreDecisionsReleased = async (agendaId) => {
  const queryString = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
  PREFIX prov: <http://www.w3.org/ns/prov#>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

  ASK WHERE {
    ?agenda a besluitvorming:Agenda ;
            mu:uuid ${sparqlEscapeString(agendaId)} .
    ?meeting a besluit:Vergaderactiviteit .
    ?agenda besluitvorming:isAgendaVoor ?meeting .
    ?decisionPublicationActivity
      ext:internalDecisionPublicationActivityUsed ?meeting ;
      prov:startedAtTime ?decisionPublicationActivityStartDate .
  }
  `
  const response = await query(queryString);
  return response.boolean;
}

const fetchFilesFromAgendaitem = async(agendaitemId, currentUser, extensions) => {
  let queryString = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX dbpedia: <http://dbpedia.org/ontology/>
  PREFIX dossier: <https://data.vlaanderen.be/ns/dossier#>
  PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
  PREFIX prov: <http://www.w3.org/ns/prov#>
  PREFIX pav: <http://purl.org/pav/>
  PREFIX sign: <http://mu.semte.ch/vocabularies/ext/handtekenen/>

  SELECT DISTINCT (?file AS ?uri) ?name ?extension ?document ?originalDocumentName ?flattenedDocumentName`
  if (currentUser.hasLimitedRole) {
    queryString += ' ?confidentialityLevel'
  }
  queryString += `
  WHERE {
      ?agendaitem a besluit:Agendapunt ;
          mu:uuid ${sparqlEscapeString(agendaitemId)} ;
          besluitvorming:geagendeerdStuk ?originalDocument .
      ?originalDocument a dossier:Stuk ;
          dct:title ?originalDocumentName .
      OPTIONAL { ?nextDocument pav:previousVersion ?originalDocument . }
      FILTER NOT EXISTS { ?agendaitem besluitvorming:geagendeerdStuk ?nextDocument . }
      {
          ?originalDocument prov:value ?originalFile .
      } UNION {
          ?originalDocument prov:value / ^prov:hadPrimarySource ?originalFile .
      }
      OPTIONAL {
          ?originalDocument sign:getekendStukKopie ?flattenedDocument .
          ?flattenedDocument prov:value ?flattenedFile .
          ?flattenedDocument dct:title ?flattenedDocumentName .
      }
      BIND(COALESCE(?flattenedDocument , ?originalDocument) AS ?document)
      BIND(COALESCE(?flattenedFile , ?originalFile) AS ?file)
      `

  if (currentUser.hasLimitedRole) {
    queryString += `
      ?document besluitvorming:vertrouwelijkheidsniveau ?confidentialityLevel .`
  }
  if (extensions.length) {
    queryString += `
    VALUES ?extension { ${extensions.map(extension => sparqlEscapeString(extension).toLowerCase()).join(" ")} ${extensions.map(extension => sparqlEscapeString(extension).toUpperCase()).join(" ")} }`
  }
  queryString += `
      ?file a nfo:FileDataObject ;
          nfo:fileName ?name ;
          dbpedia:fileExtension ?extension .
  }`;
  const data = await query(queryString);
  return parseSparqlResults(data);
}

const fetchFilesFromCases = async(caseId, currentUser, extensions) => {
  // We wanted to use the relation of case.pieces, but move subcase does not trigger a sync of those documents
  // ?case dossier:Dossier.bestaatUit ?document .
  let queryString = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX dbpedia: <http://dbpedia.org/ontology/>
  PREFIX dossier: <https://data.vlaanderen.be/ns/dossier#>
  PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
  PREFIX prov: <http://www.w3.org/ns/prov#>
  PREFIX pav: <http://purl.org/pav/>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX sign: <http://mu.semte.ch/vocabularies/ext/handtekenen/>

  SELECT DISTINCT (?file AS ?uri) ?name ?extension ?document ?originalDocumentName ?flattenedDocumentName`
  if (currentUser.hasLimitedRole) {
    queryString += ' ?confidentialityLevel'
  }
  queryString += `
  WHERE {
      ?case a dossier:Dossier ;
          mu:uuid ${sparqlEscapeString(caseId)} .
      ?case dossier:Dossier.isNeerslagVan ?decisionmakingFlow .
      ?decisionmakingFlow dossier:doorloopt ?subcase .
      ?subcase a dossier:Procedurestap .
      ?submissionActivity a ext:Indieningsactiviteit ;
          ext:indieningVindtPlaatsTijdens ?subcase ;
          prov:generated ?originalDocument .
      ?originalDocument a dossier:Stuk ;
          dct:title ?originalDocumentName .
      FILTER NOT EXISTS { [] pav:previousVersion ?originalDocument }
      {
          ?originalDocument prov:value ?originalFile .
      } UNION {
          ?originalDocument prov:value / ^prov:hadPrimarySource ?originalFile .
      }
      OPTIONAL {
          ?originalDocument sign:getekendStukKopie ?flattenedDocument .
          ?flattenedDocument prov:value ?flattenedFile .
          ?flattenedDocument dct:title ?flattenedDocumentName .
      }
      BIND(COALESCE(?flattenedDocument , ?originalDocument) AS ?document)
      BIND(COALESCE(?flattenedFile , ?originalFile) AS ?file)
      `

  if (currentUser.hasLimitedRole) {
    queryString += `
      ?document besluitvorming:vertrouwelijkheidsniveau ?confidentialityLevel .`
  }
  if (extensions.length) {
    queryString += `
    VALUES ?extension { ${extensions.map(extension => sparqlEscapeString(extension).toLowerCase()).join(" ")} ${extensions.map(extension => sparqlEscapeString(extension).toUpperCase()).join(" ")} }`
  }
  queryString += `
      ?file a nfo:FileDataObject ;
          nfo:fileName ?name ;
          dbpedia:fileExtension ?extension .
  }`;
  const data = await query(queryString);
  return parseSparqlResults(data);
}

const fetchFilesFromSubcases = async(subcaseId, currentUser, extensions) => {
  let queryString = `
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX dbpedia: <http://dbpedia.org/ontology/>
  PREFIX dossier: <https://data.vlaanderen.be/ns/dossier#>
  PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
  PREFIX prov: <http://www.w3.org/ns/prov#>
  PREFIX pav: <http://purl.org/pav/>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX sign: <http://mu.semte.ch/vocabularies/ext/handtekenen/>

  SELECT DISTINCT (?file AS ?uri) ?name ?extension ?document ?originalDocumentName ?flattenedDocumentName`
  if (currentUser.hasLimitedRole) {
    queryString += ' ?confidentialityLevel'
  }
  queryString += `
  WHERE {
      ?subcase a dossier:Procedurestap ;
          mu:uuid ${sparqlEscapeString(subcaseId)} .
      ?submissionActivity a ext:Indieningsactiviteit ;
          ext:indieningVindtPlaatsTijdens ?subcase ;
          prov:generated ?originalDocument .
      ?originalDocument a dossier:Stuk ;
          dct:title ?originalDocumentName .
      FILTER NOT EXISTS { [] pav:previousVersion ?originalDocument }
      {
          ?originalDocument prov:value ?originalFile .
      } UNION {
          ?originalDocument prov:value / ^prov:hadPrimarySource ?originalFile .
      }
      OPTIONAL {
          ?originalDocument sign:getekendStukKopie ?flattenedDocument .
          ?flattenedDocument prov:value ?flattenedFile .
          ?flattenedDocument dct:title ?flattenedDocumentName .
      }
      BIND(COALESCE(?flattenedDocument , ?originalDocument) AS ?document)
      BIND(COALESCE(?flattenedFile , ?originalFile) AS ?file)
      `

  if (currentUser.hasLimitedRole) {
    queryString += `
      ?document besluitvorming:vertrouwelijkheidsniveau ?confidentialityLevel .`
  }
  if (extensions.length) {
    queryString += `
    VALUES ?extension { ${extensions.map(extension => sparqlEscapeString(extension).toLowerCase()).join(" ")} ${extensions.map(extension => sparqlEscapeString(extension).toUpperCase()).join(" ")} }`
  }
  queryString += `
      ?file a nfo:FileDataObject ;
          nfo:fileName ?name ;
          dbpedia:fileExtension ?extension .
  }`;
  const data = await query(queryString);
  return parseSparqlResults(data);
}

export {
  fetchFilesFromAgenda,
  fetchFilesFromAgendaByMandatees,
  fetchDecisionsByMandatees,
  fetchDecisionsFromAgenda,
  fetchAreDecisionsReleased,
  fetchFilesFromAgendaitem,
  fetchFilesFromCases,
  fetchFilesFromSubcases
};
