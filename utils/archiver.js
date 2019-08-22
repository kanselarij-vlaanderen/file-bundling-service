const fs = require('fs');
const archiver = require('archiver');

const archiveFiles = async (meetingDate, agenda, agendaitems) => {
  const path = `${__dirname}/archives_downloaded/${meetingDate}_${agenda.name}.zip`;
  const output = fs.createWriteStream(path);

  const archive = archiver('zip', {
    zlib: {
      level: 9,
    },
  });
  archive.pipe(output);

  await Promise.all(
    agendaitems.map((item) => {
      return Promise.all(
        item.filesToDownload.map((file) => {
          return appendFile(archive, file, item.agendaitemName);
        })
      );
    })
  );

  archive.finalize();

  return new Promise((resolve, reject) => {
    archive.on('warning', function(err) {
      if (err.code === 'ENOENT') {
        console.warn('warning', err);
      } else {
        reject(err);
      }
    });

    archive.on('error', function(err) {
      reject(err);
    });

    output.on('close', function() {
      console.log(archive.pointer() + ' total bytes');
      console.log('archiver has been finalized and the output file descriptor has closed.');
      resolve(path);
    });

    output.on('end', function() {
      console.log('Data has been drained');
      resolve(path);
    });
  });
};

const appendFile = (archive, item, prefixPath) => {
  const file1 = `/share/${item.download}`;

  return archive.append(fs.createReadStream(file1), {
    name: `${item.name.replace('/', '_')}`,
  });
};

module.exports = { archiveFiles };
