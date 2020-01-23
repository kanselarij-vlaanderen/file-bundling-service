import fs from 'fs';
import archiver from 'archiver';

const archiveFiles = async (files) => {
  const path = `${__dirname}/test.zip`;
  const output = fs.createWriteStream(path);

  const archive = archiver('zip', {
    zlib: { level: 9 }
  });
  archive.pipe(output);

  await Promise.all(
    files.map((file) => {
      return archive.append(fs.createReadStream(file.path), {
        name: file.name
      });
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

module.exports = { archiveFiles };
