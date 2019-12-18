import cors from 'cors';
import {app, errorHandler} from 'mu';

const {getAllAgendaItemsFromAgendaWithDocuments} = require('./repository');
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

app.use(cors());
app.use(bodyParser.json({
  type: function (req) {
    return /^application\/json/.test(req.get('content-type'));
  },
  limit: '5gb'
}));
app.use(bodyParser.urlencoded({ extended: false }));

app.get('/bundleAllFiles', async (req, res) => {
  const agenda_id = req.query.agenda_id;
  const meetingDate = req.query.meeting_date;
  console.log(meetingDate)
  try {
    const allAgendaItemsWithDocuments = await getAllAgendaItemsFromAgendaWithDocuments(agenda_id);
    const files = allAgendaItemsWithDocuments.filter((item) => item.download)

    const agendaitems = files.reduce((items, fileObject) => {
      const foundItem = items.find((item) => item.agendaitem_id == fileObject.agendaitem_id);
      if (!foundItem) {
        const item = {
          agendaitem_id: fileObject.agendaitem_id,
          agendaitemPrio: fileObject.agendaitemPrio,
          agendaitemName: `agendapunt_${fileObject.agendaitemPrio}`,
          filesToDownload: [createUsefullAgendaItem(fileObject)],
        };
        items.push(item);
      } else {
        foundItem.filesToDownload.push(createUsefullAgendaItem(fileObject));
      }
      return items;
    }, []);

    const path = await archiver.archiveFiles(meetingDate, agendaitems);

    res.sendFile(path, {headers: {
        'Content-Type': 'application/zip',
        'Content-disposition': `attachment; filename=agenda_van_${meetingDate}.zip`
      }})
  } catch (error) {
    console.log(`[${new Date().toString()}] - Error while bundling the agenda with id: ${agenda_id}`)
    res.status(500).send('Something went wrong while bundling all the files.')
  }

});

const createUsefullAgendaItem = (item) => {
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

app.use(errorHandler);
