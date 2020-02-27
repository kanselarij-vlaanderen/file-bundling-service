# File bundling service
A service for creating (zip) archives. With caching support.

As archiving large amounts of files typically is a (timely) expensive operation, a job-like approach is used to create these archives.

## Configuration snippets

#### docker-compose

```yml
file-bundling:
  image: kanselarij/file-bundling-service
  volumes:
    - ./data/files:/share
```

#### Dispatcher

```elixir
post "/files/archive/*path", @any do
  Proxy.forward conn, path, "http://file-bundling-service/files/archive/"
end
```

#### Authorization

Users of this service should have read and write access to following Classes
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
    ignoreFromSelf: false
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
                (:generated     :uri       ,(s-prefix "prov:generated"))
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
## Used data-models

For modeling the jobs that create the archive files, this service makes use of the [COGS vocabulary](http://vocab.deri.ie/cogs#Job), which in its turn is based on the [PROV-O vocabulary](https://www.w3.org/TR/2013/REC-prov-o-20130430/#prov-o-at-a-glance)
