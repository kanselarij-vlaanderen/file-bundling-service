import fs from 'fs';
import archiver from 'archiver';
import { uuid as generateUuid } from 'mu';
import { STORAGE_PATH } from './config';

const createArchive = async (name, files, archiveType = 'zip') => {
  const fileUuid = generateUuid();
  const filename = `${fileUuid}.${archiveType}`;
  const filePath = STORAGE_PATH + filename;
  await archiveFiles(files, filePath);
  const archiveMimeType = 'application/zip'; // TODO: make dependent from archive type

  const filestats = fs.statSync(filePath);
  const archiveFile = {
    path: filePath,
    id: fileUuid,
    name,
    extension: archiveType,
    format: archiveMimeType,
    size: filestats.size,
    created: filestats.birthtime
  };
  return archiveFile;
};

const archiveFiles = async (files, path, type = 'zip') => {
  const output = fs.createWriteStream(path);

  const archive = archiver(type, {
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
    archive.on('warning', function (err) {
      if (err.code === 'ENOENT') {
        console.warn('warning', err);
      } else {
        reject(err);
      }
    });

    archive.on('error', function (err) {
      reject(err);
    });

    output.on('close', function () {
      console.log(archive.pointer() + ' total bytes');
      console.log('archiver has been finalized and the output file descriptor has closed.');
      resolve(path);
    });

    output.on('end', function () {
      console.log('Data has been drained');
      resolve(path);
    });
  });
};

export {
  createArchive,
  archiveFiles
};
