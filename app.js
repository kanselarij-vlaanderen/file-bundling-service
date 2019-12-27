import cors from 'cors';
import { app, errorHandler } from 'mu';
import { getAllAgendaItemsFromAgendaWithDocuments } from "./repository";
import fs from "fs";
import archiver from "./utils/archiver";
import bodyParser from "body-parser";

const latinAdverbialNumberals = {
  1: '',
  2: 'bis',
  3: 'ter',
  4: 'quater',
  5: 'quinquies',
  6: 'sexies',
  7: 'septies',
  8: 'octies',
  9: 'novies',
  10: 'decies',
  11: 'undecies',
  12: 'duodecies',
  13: 'ter decies',
  14: 'quater decies',
  15: 'quindecies',
};

fs.mkdir(`${__dirname}/tmp`, () => {
});
fs.mkdir(`${__dirname}/complete`, () => {
});

app.use(cors());
app.use(bodyParser.json({
  type: function (req) {
    return /^application\/json/.test(req.get('content-type'));
  },
  limit: '5gb'
}));
app.use(bodyParser.urlencoded({ extended: false }));

app.post('/bundleAllFiles', async (req, res) => {
  const agenda_id = req.query.agenda_id;
  let filename;
  try {
    const allAgendaItemsWithDocuments = await getAllAgendaItemsFromAgendaWithDocuments(agenda_id);
    const files = allAgendaItemsWithDocuments.filter((item) => item.download);

    const agendaitems = files.reduce((items, fileObject) => {
      const foundItem = items.find((item) => item.agendaitem_id === fileObject.agendaitem_id);
      if (!foundItem) {
        const item = {
          agendaitem_id: fileObject.agendaitem_id,
          agendaitemPrio: fileObject.agendaitemPrio,
          agendaitemName: `agendapunt_${fileObject.agendaitemPrio}`,
          filesToDownload: [createUsefulAgendaItem(fileObject)],
        };
        items.push(item);
      } else {
        foundItem.filesToDownload.push(createUsefulAgendaItem(fileObject));
      }
      return items;
    }, []);

    filename = `${agenda_id}.${new Date().valueOf()}.zip`;

    res.status(200).send(filename);

    const tempPath = constructTempPath(filename);
    await archiver.archiveFiles(tempPath, agendaitems);

    fs.renameSync(tempPath, constructNewPath(filename));
  } catch (error) {
    console.log(`[${new Date().toString()}] - Error while bundling the agenda with id: ${agenda_id}`);
    if (filename) {
      cleanup(filename)
    }
  }
});

app.get('/downloadBundle', async (req, res) => {
  const filename = req.query.path;
  res.sendFile(
      constructNewPath(filename),
      {
        headers: {
          'Content-Type': 'application/zip',
          'Content-disposition': 'attachment'
        }
      },
      (err) => {
        if (err) {
          if (err.status === 404) {
            res.status(202).send()
          } else {
            console.log(`[${new Date().toString()}] - Error while getting the file with path: ${filename} \n ${err}`);
            res.status(500).send('Something went wrong while downloading files.')
          }
        } else {
          cleanup(filename);
        }
      })
});

const createUsefulAgendaItem = (item) => {
  const latinVersionNumber = item.maxVersionNumber && latinAdverbialNumberals[item.maxVersionNumber].toUpperCase();
  const name = `${item.maxVersionNumber && item.documentTitle
    ? `${item.documentTitle} ${latinVersionNumber}`.trim()
    : item.documentTitle || item.numberVR || item.documentVersionName || item.documentVersionId}.${
    item.extension
  }`;
  let download;
  if (item && item.download) {
    download = item.download.split('share://')[1];
  }

  return {
    name,
    download,
  };
};

function cleanup(filename) {
  fs.unlink(constructNewPath(filename), () => {
  });
  fs.unlink(constructTempPath(filename), () => {
  });
}

function constructNewPath(filename) {
  return `${__dirname}/complete/${filename}`;
}

function constructTempPath(filename) {
  return `${__dirname}/tmp/${filename}`;
}

app.use(errorHandler);
