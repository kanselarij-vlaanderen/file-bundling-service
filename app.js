import cors from 'cors';
import { app, errorHandler } from 'mu';
import fs from 'fs';
import archiver from './utils/archiver';
import bodyParser from 'body-parser';

app.use(cors());
app.use(bodyParser.json({ type: 'application/*+json' }));

app.post('/bundleAllFiles', async (req, res) => {
  const agenda = JSON.parse(req.body.agenda);
  const meetingDate = req.body.meetingDate;
  const files = JSON.parse(req.body.files);

  const agendaitems = files.reduce((items, fileObject) => {
    const foundItem = items.find((item) => item.agendaitem_id === fileObject.agendaitem_id);
    if (!foundItem) {
      const item = {
        agendaitem_id: fileObject.agendaitem_id,
        agendaitemPrio: fileObject.agendaitemPrio,
        agendaitemName: `agendapunt_${fileObject.agendaitemPrio}`,
        filesToDownload: [createFileDetails(fileObject)]
      };
      items.push(item);
    } else {
      foundItem.filesToDownload.push(createFileDetails(fileObject));
    }
    return items;
  }, []);

  const path = await archiver.archiveFiles(meetingDate, agenda, agendaitems);
  fs.createReadStream(path).pipe(res);
});

const createFileDetails = (item) => {
  const name = `${item.name}.${item.extension}`;
  const path = item.download.split('share://')[1];

  return {
    name,
    download: path
  };
};

app.use(errorHandler);
