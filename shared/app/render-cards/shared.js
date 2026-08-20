import { archiveRecord } from "../constants.js";

function getCardDiscoveryMetadata(show, maxItems) {
  return archiveRecord.getCardDiscoveryMetadata(show, maxItems);
}

function formatCardDiscoveryMetadata(show, maxItems) {
  return getCardDiscoveryMetadata(show, maxItems).text;
}

export { formatCardDiscoveryMetadata, getCardDiscoveryMetadata };
