# File bundling service
A service for creating (zip) archives from [mu-files](https://github.com/mu-semtech/file-service). With caching support.

As archiving large amounts of files typically is a (timely) expensive operation, a job-like approach is used to create these archives. See [*The job datamodel*](#The-job-data-model) below for more info.

Besides the generic `/files/archive` endpoint, this service also provides Kaleidos-specific endpoints to bundle all documents related to an agenda, agendaitem, case or subcase (formerly provided by the separate [file-bundling-job-creation-service](https://github.com/kanselarij-vlaanderen/file-bundling-job-creation-service), which has been merged into this service).

*Why do the Kaleidos-specific endpoints exist next to the generic `files/archive`-endpoint?*
Some of Kaleidos' agendas consist of a large amount of documents (> 1K). For the generic endpoint, the request has to carry all file id's and the service will first verify if there doesn't yet exist a job that produced the exact archive we want. For this many files, this process takes a while and as a result, the HTTP request can time out.
The Kaleidos-specific endpoints gather the files server-side based on the Kaleidos data-model (including confidentiality filtering and document-name synchronization) and run the created bundling job in the background.

## Configuration snippets

#### docker-compose

Optional:
If the created file storage location needs to be in a subfolder of the share folder you need to add `MU_APPLICATION_FILE_STORAGE_PATH` to the config.

```yml
file-bundling:
  image: kanselarij/file-bundling-service
  environment:
    MU_APPLICATION_FILE_STORAGE_PATH: "path-to-file/"
  volumes:
    - ./data/files:/share
```

#### Dispatcher

```elixir
post "/files/archive/*path", @any do
  Proxy.forward conn, path, "http://file-bundling-service/files/archive/"
end
```

For the Kaleidos-specific endpoints:
```elixir
post "/agendas/:id/agendaitems/pieces/files/archive", @json_service do
  Proxy.forward conn, [], "http://file-bundling/agendas/" <> id <> "/agendaitems/documents/files/archive"
end

post "/agendaitems/:id/pieces/files/archive", @json_service do
  Proxy.forward conn, [], "http://file-bundling/agendaitems/" <> id <> "/documents/files/archive"
end

post "/cases/:id/pieces/files/archive", @json_service do
  Proxy.forward conn, [], "http://file-bundling/cases/" <> id <> "/documents/files/archive"
end

post "/subcases/:id/pieces/files/archive", @json_service do
  Proxy.forward conn, [], "http://file-bundling/subcases/" <> id <> "/documents/files/archive"
end
```

#### Authorization

Users of this service should have `:read`, `:write` and `:read-for-write` access to following rdf types
```
"http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#FileDataObject"
"http://www.w3.org/ns/prov#Collection"
"http://vocab.deri.ie/cogs#Job"
"http://mu.semte.ch/vocabularies/ext/FileBundlingJob"
```

#### Delta notifier

```js
{
  match: {
    predicate: {
      type: 'uri',
      value: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
    },
    object: {
      type: 'uri',
      value: 'http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#FileDataObject'
    }
  },
  callback: {
    url: 'http://file-bundling/delta',
    method: 'POST'
  },
  options: {
    resourceFormat: 'v0.0.1',
    gracePeriod: 250,
    ignoreFromSelf: false // Don't ignore from self in case of zip in zip
  }
},
{
  match: {
    predicate: {
      type: 'uri',
      value: 'http://mu.semte.ch/vocabularies/ext/status'
    },
    object: {
      type: 'uri'
    }
  },
  callback: {
    url: 'http://file-bundling/delta',
    method: 'POST'
  },
  options: {
    resourceFormat: 'v0.0.1',
    gracePeriod: 250,
    ignoreFromSelf: true
  }
},
```

#### Resources

`domain.lisp`:
```lisp
(define-resource file-bundling-job ()
  :class (s-prefix "ext:FileBundlingJob") ; "cogs:Job"
  :properties `((:created       :datetime  ,(s-prefix "dct:created"))
                (:status        :uri       ,(s-prefix "ext:status"))
                (:time-started  :datetime  ,(s-prefix "prov:startedAtTime"))
                (:time-ended    :datetime  ,(s-prefix "prov:endedAtTime"))
  )
  :has-one `((file              :via     ,(s-prefix "prov:generated")
                                :as "generated"))
  ; :resource-base (s-url "http://example.com/id/file-bundling-jobs/")
  :features '(include-uri)
  :on-path "file-bundling-jobs"
)
```

`repository.lisp`:
```lisp
(add-prefix "ext" "http://mu.semte.ch/vocabularies/ext/")
(add-prefix "dct" "http://purl.org/dc/terms/")
(add-prefix "prov" "http://www.w3.org/ns/prov#")
(add-prefix "cogs" "http://vocab.deri.ie/cogs#")
```

`dispatcher.ex`:
```elixir
match "/file-bundling-jobs/*path", @any do
  Proxy.forward conn, path, "http://cache/file-bundling-jobs/"
end
```

## REST API
#### POST /files/archive
Request the creation of an archive.

##### Request
The files to archive should be specified in the request body as an array of JSONAPI objects:
```json
{
  "data": [
    {
      "type": "files",
      "id": "85dbcf1e-f128-43bb-a64e-7dc8f3f3dd46",
    },
    {
      "type": "files",
      "id": "33fafdbf-8c17-4b8c-858d-588a42dc4c9e",
      "attributes": {
        "name": "custom_name_in_archive.txt"
      }
    }
  ]
}
```
Optionally the name by which the file should appear in the archive can be overridden by specifying the attribute `name`.
Note however that doing so may cause unwanted names when serving an archive from cache.

##### Response
###### 201 Created
On successful creation of a job.

```json
{
  "data": {
    "type": "file-bundling-jobs",
    "id": "5f680870-5984-11ea-98be-11315490e00b",
    "attributes": {
      "uri": "http://mu.semte.ch/services/file-bundling-service/file-bundling-jobs/5f680870-5984-11ea-98be-11315490e00b",
      "status": "http://vocab.deri.ie/cogs#Running",
      "created": "2020-02-27T17:12:45.943Z"
    }
  }
}
```

###### 200 OK
When an archive for the exact set of requested files *already is available*, the job that created this archive will be returned. The file this job previously generated, will be included in the JSONAPI response.

```json
{
  "data": {
    "type": "file-bundling-jobs",
    "id": "5f680870-5984-11ea-98be-11315490e00b",
    "attributes": {
      "uri": "http://mu.semte.ch/services/file-bundling-service/file-bundling-jobs/5f680870-5984-11ea-98be-11315490e00b",
      "status": "http://vocab.deri.ie/cogs#Success",
      "created": "2020-02-27T17:12:45.943Z"
    },
    "relationships": {
      "generated": {
        "data": {
          "id": "5f7527d0-5984-11ea-98be-11315490e00b",
          "type": "files"
        }
      }
    }
  },
  "included": [
    {
      "type": "files",
      "id": "6a989040-4c1c-11ea-bb67-a91f9ef5e3d1",
      "attributes": {
        "name": "archive.zip",
        "format": "application/zip",
        "size": "332",
        "extension": "zip",
        "created": "2020-02-10T15:45:51.985Z",
        "modified": "2020-02-10T15:45:51.985Z"
      }
    }
  ]
}
```
#### POST /agendas/:agenda_id/agendaitems/documents/files/archive
Request the creation of an archive of all files related to agenda `:agenda_id`.

Query parameters:
- `mandateeIds`: comma-separated string of mandatee id's. When provided, all documents linked to an agendaitem which is linked to one of the listed mandatees will be bundled, as well as all documents linked to an agendaitem with no linked mandatees. When not provided, all documents of the agenda will be bundled.
- `pdfOnly` (`true`/`false`): only bundle PDF files.
- `decisions` (`true`/`false`): bundle the decision documents instead of the agendaitem documents.
- `newDocumentsOnly` (`true`/`false`): only bundle documents that were added on this agenda version.

#### POST /agendaitems/:agendaitem_id/documents/files/archive
#### POST /cases/:case_id/documents/files/archive
#### POST /subcases/:subcase_id/documents/files/archive
Request the creation of an archive of all files related to a single agendaitem, case or subcase. The `pdfOnly` query parameter is supported.

##### Response (all Kaleidos-specific endpoints)
###### 201 Created
On successful creation of a job. Response payload similar to `POST /files/archive`. The job is run in the background; poll the job (e.g. via `/file-bundling-jobs/:id`) for its status and generated file.

###### 200 OK
When serving an already-existing job for the exact same set of files. Response payload similar to above.

## The job data-model

For modeling the jobs that create the archive files, this service makes use of the [COGS vocabulary](http://vocab.deri.ie/cogs#Job), which in its turn is based on the [PROV-O vocabulary](https://www.w3.org/TR/2013/REC-prov-o-20130430/#prov-o-at-a-glance)
