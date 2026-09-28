export function getShowSearchText(show) {
  if (!show) return "";
  const creatorNames = Array.isArray(show.creators)
    ? show.creators.flatMap((creator) => typeof creator === "string" ? [creator] : [creator?.name, creator?.id])
    : [];
  return [
    show.title,
    show.subtitle,
    show.description,
    ...creatorNames,
    ...(Array.isArray(show.genres) ? show.genres : []),
    ...(Array.isArray(show.tags) ? show.tags : []),
    ...(Array.isArray(show.aliases) ? show.aliases : []),
  ].filter(Boolean).join(" ").toLocaleLowerCase("en");
}
