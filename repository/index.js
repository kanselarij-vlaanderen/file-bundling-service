import {query} from 'mu';

const targetGraph = 'http://mu.semte.ch/graphs/organizations/kanselarij';

const getAllAgendaItemsFromAgendaWithDocuments = async (agendaId) => {
  const queryString = `
    PREFIX vo-org: <https://data.vlaanderen.be/ns/organisatie#>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX vo-gen: <https://data.vlaanderen.be/ns/generiek#> 
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX besluitvorming: <http://data.vlaanderen.be/ns/besluitvorming#>
    PREFIX agenda: <http://data.lblod.info/id/agendas/>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX dbpedia: <http://dbpedia.org/ontology/>
    PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
    
   SELECT (MAX(?versionNumber) as ?maxVersionNumber) ?documentVersionId ?numberVR ?extension ?download ?agendaitemPrio ?agendaitem_id ?documentVersionName ?documentTitle  WHERE { 
       GRAPH <${targetGraph}> {
            ?agenda a besluitvorming:Agenda ;
                    mu:uuid "${agendaId}" ;
                    ext:agendaNaam ?agendaName ;
                    dct:hasPart ?agendaitem .
            ?agendaitem mu:uuid ?agendaitem_id .
            OPTIONAL { ?agendaitem ext:prioriteit ?agendaitemPrio . }
            OPTIONAL {
                ?agendaitem ext:bevatAgendapuntDocumentversie ?documentVersions .
                ?document besluitvorming:heeftVersie ?documentVersions .
                ?document besluitvorming:heeftVersie ?allVersions .
                ?allVersions mu:uuid ?documentVersionId .
                ?allVersions ext:versieNummer ?versionNumber .
                ?allVersions ext:file ?file .
                ?download nie:dataSource ?file .
                ?file dbpedia:fileExtension ?extension .
                OPTIONAL { ?document besluitvorming:stuknummerVR ?numberVR . }
                OPTIONAL { ?document dct:title ?documentTitle . }
                OPTIONAL { ?allVersions ext:gekozenDocumentNaam ?documentVersionName . }
            }
       } 
    } GROUP BY ?documentVersionId ?numberVR ?extension ?download ?agendaitemPrio ?agendaitem_id ?documentVersionName ?documentTitle`;
  const data = await query(queryString);
  return parseSparqlResults(data);
};

const parseSparqlResults = (data) => {
  if (!data) return;
  const vars = data.head.vars;
  return data.results.bindings.map((binding) => {
    let obj = {};
    vars.forEach((varKey) => {
      if (binding[varKey]) {
        obj[varKey] = binding[varKey].value;
      }
    });
    return obj;
  });
};

module.exports = {getAllAgendaItemsFromAgendaWithDocuments};
