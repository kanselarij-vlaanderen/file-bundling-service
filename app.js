import cors from 'cors';

import { app, query, errorHandler } from 'mu';
const fs = require('fs');
const bodyParser = require('body-parser');
const archiver = require('./utils/archiver');

app.use(cors());
app.use(bodyParser.json({ type: 'application/*+json' }));

app.post('/bundleAllFiles', async (req, res) => {
  const agenda = JSON.parse(req.body.agenda);
  const meetingDate = req.body.meetingDate;
  const files = JSON.parse(req.body.files);

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

  const path = await archiver.archiveFiles(meetingDate, agenda, agendaitems);
  fs.createReadStream(path).pipe(res);
});

const createUsefullAgendaItem = (item) => {
  const name = `${item.numberVR || '-'}.${item.extension}`;
  let download;
  if (item && item.download) {
    download = item.download.split('share://')[1];
  }

  return {
    title: item.numberVR || name,
    name,
    download,
  };
};

app.use(errorHandler);
