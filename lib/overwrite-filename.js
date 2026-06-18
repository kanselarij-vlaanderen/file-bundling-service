import sanitize from 'sanitize-filename';
import { renameFileFromDocument, renameFlattenedPieceFromDocument } from '../queries/document';

async function overwriteFilenames (files) {
  /*
   * Currently, relations in our semantic model regarding documents look like this:
   * Document (dossier:Stuk) -> Logical file (nfo:FileDataObject) -> Physical file (nfo:FileDataObject)
   * Naming data is stored on the document as well as on the file, but *document* is master.
   * Services regarding files (file-bundling-service) however, only have knowledge of the *file* model (and its properties).
   * We here thus make sure that also the files carry the right name, as the file-bundling-service will use those.
   */
  for (const file of files) {
    const currentFileName = file.name;
    let fromDocName = `${file.originalDocumentName}.${file.extension}`;
    let expected = sanitize(fromDocName, { replacement: '_' });
    // if the file is the flattened one, we check the name and also replace flattened piece title since it is often without VR number
    if (file.flattenedDocumentName) {
        const newFlattenedDocName = `${file.originalDocumentName} (ondertekend)`;
        fromDocName = `${newFlattenedDocName}.${file.extension}`;
        expected = sanitize(fromDocName, { replacement: '_' });
        if (file.flattenedDocumentName !== newFlattenedDocName) {
          await renameFlattenedPieceFromDocument(file.document, file.uri, newFlattenedDocName);
        }
    }
    if (currentFileName !== expected) {
      await renameFileFromDocument(file.document, file.uri, expected);
    }
  }
}

export {
  overwriteFilenames
};
