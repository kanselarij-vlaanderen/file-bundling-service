import crypto from 'crypto';
import { uuid as generateUuid } from 'mu';
import { RESOURCE_BASE } from '../config';

function memberKey (file) {
  return `uri:${file.uri}|name:${file.name}`;
}

function computeMembersHash (files) {
  const sortedKeys = files
    .map(memberKey)
    .sort((a, b) => a.localeCompare(b));
  const hashFactory = crypto.createHash('sha256');
  return hashFactory.update(sortedKeys.join('')).digest('hex');
}

function createCollection (members) {
  const uuid = generateUuid();
  const uri = RESOURCE_BASE + `/collections/${uuid}`;
  const sha = computeMembersHash(members);
  return {
    uri,
    id: uuid,
    sha,
    members
  };
}

export {
  memberKey,
  computeMembersHash,
  createCollection
};
