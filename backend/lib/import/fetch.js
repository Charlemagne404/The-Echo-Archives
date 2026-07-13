function createFetchLimitError(label, detail) {
  const error = new Error(`${label} ${detail}`);
  error.code = "IMPORT_FETCH_FAILED";
  return error;
}

async function readResponseBuffer(response, { maxBytes, label }) {
  const contentLength = Number.parseInt(response.headers?.get?.("content-length") || "", 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw createFetchLimitError(label, `exceeded the ${maxBytes}-byte response limit.`);
  }

  if (!response.body || typeof response.body.getReader !== "function") {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) {
      throw createFetchLimitError(label, `exceeded the ${maxBytes}-byte response limit.`);
    }
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      await reader.cancel().catch(() => {});
      throw createFetchLimitError(label, `exceeded the ${maxBytes}-byte response limit.`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, totalBytes);
}

async function fetchBufferWithLimits(fetchImpl, url, init = {}, options = {}) {
  const timeoutMs = Math.max(1, Number(options.timeoutMs) || 15_000);
  const maxBytes = Math.max(1, Number(options.maxBytes) || 5 * 1024 * 1024);
  const label = String(options.label || "Import request");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    });
    const buffer = await readResponseBuffer(response, { maxBytes, label });
    return { response, buffer };
  } catch (error) {
    if (controller.signal.aborted) {
      throw createFetchLimitError(label, `timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTextWithLimits(fetchImpl, url, init = {}, options = {}) {
  const result = await fetchBufferWithLimits(fetchImpl, url, init, options);
  return {
    response: result.response,
    text: result.buffer.toString("utf8"),
  };
}

async function fetchJsonWithLimits(fetchImpl, url, init = {}, options = {}) {
  const result = await fetchTextWithLimits(fetchImpl, url, init, options);
  try {
    return {
      response: result.response,
      json: JSON.parse(result.text),
    };
  } catch (_error) {
    throw createFetchLimitError(String(options.label || "Import request"), "returned invalid JSON.");
  }
}

module.exports = {
  fetchBufferWithLimits,
  fetchJsonWithLimits,
  fetchTextWithLimits,
};
