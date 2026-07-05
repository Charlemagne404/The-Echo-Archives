export function getSortedSelectedOptions(groupId, selectedValues, filterOptionsByGroup) {
  const optionLabels = filterOptionsByGroup.get(groupId) || new Map();

  return Array.from(selectedValues)
    .sort((left, right) => {
      const leftLabel = optionLabels.get(left) || left;
      const rightLabel = optionLabels.get(right) || right;
      return leftLabel.localeCompare(rightLabel);
    })
    .map((value) => ({
      id: value,
      label: optionLabels.get(value) || value,
    }));
}

function getBucketSelectionEntries(bucket, filters, filterOptionsByGroup) {
  const entries = [];

  bucket.groups.forEach((group) => {
    const selectedValues = filters[group.id];
    if (!selectedValues || selectedValues.size === 0) {
      return;
    }

    entries.push(...getSortedSelectedOptions(group.id, selectedValues, filterOptionsByGroup));
  });

  return entries;
}

export function formatFilterGroupCount(group, filters) {
  const selectedCount = filters[group.id]?.size || 0;
  if (selectedCount === 0) {
    return `${group.options.length} options`;
  }

  return `${selectedCount} selected`;
}

export function formatFilterBucketStatus(bucket, filters, filterOptionsByGroup) {
  const selectedEntries = getBucketSelectionEntries(bucket, filters, filterOptionsByGroup);
  if (selectedEntries.length === 0) {
    return "none";
  }

  if (selectedEntries.length === 1) {
    return "1 selected";
  }

  if (selectedEntries.length === 2) {
    return `${selectedEntries[0].label} • ${selectedEntries[1].label}`;
  }

  return `${selectedEntries[0].label}, ${selectedEntries[1].label} + ${selectedEntries.length - 2}`;
}

export function getBucketSelectionCount(bucket, filters) {
  return bucket.groups.reduce((count, group) => count + (filters[group.id]?.size || 0), 0);
}
