(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EchoArchiveSocial = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULT_SOCIAL_IMAGE = "/images/generated/social/default.png";
  function socialPreview(kind = "default", record = null) {
    const family = { show: "shows", collection: "collections", entity: "creators" }[kind];
    if (!family || !record?.id) return { path: DEFAULT_SOCIAL_IMAGE, alt: "The Echo Archives — Audio Drama Discovery" };
    // IDs already follow the catalogue's slug contract. Never allow a filesystem path.
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.id)) throw new Error("Invalid social preview record ID");
    const label = kind === "show" ? "preview" : kind === "collection" ? "collection preview" : "creator catalogue preview";
    return { path: `/images/generated/social/${family}/${record.id}.png`, alt: `The Echo Archives ${label} for ${record.title || record.name || record.id}` };
  }
  return { DEFAULT_SOCIAL_IMAGE, socialPreview };
});
