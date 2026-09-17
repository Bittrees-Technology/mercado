import sharp from "sharp";
import { imageUpload } from "./catalog.mjs";
const fail = (message, status = 502) =>
  Object.assign(Error(message), { status });
export async function prepareImage(value) {
  const parsed = imageUpload(value);
  try {
    const data = await sharp(Buffer.from(parsed.data, "base64"), {
      limitInputPixels: 25000000,
      animated: false,
    })
      .rotate()
      .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
    if (data.length > 1048576) throw Error("Too large");
    return { data, mime: "image/webp", bytes: data.length };
  } catch {
    throw fail("Choose a valid JPEG, PNG or WebP image up to 1 MB.", 400);
  }
}
async function bounded(response, max) {
  const reader = response.body?.getReader();
  if (!reader) throw fail("Image storage returned an empty response.");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max)
        throw fail("Image storage returned an oversized response.");
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks);
}
export function ipfsConfig(env = process.env) {
  const api = env.IPFS_API_URL,
    token = env.IPFS_API_BEARER_TOKEN,
    gateway = env.IPFS_GATEWAY_BASE_URL;
  if (!api || !token || !gateway)
    throw fail("Image uploads are not configured yet.", 503);
  for (const value of [api, gateway]) {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.search ||
      u.hash
    )
      throw fail("Image storage configuration is invalid.", 503);
  }
  const add = new URL(api);
  add.pathname =
    add.pathname.replace(/\/$/, "").replace(/\/api\/v0(?:\/add)?$/, "") +
    "/api/v0/add";
  add.search = new URLSearchParams({
    pin: "true",
    "cid-version": "1",
    "wrap-with-directory": "false",
    progress: "false",
    "stream-channels": "false",
  }).toString();
  return {
    add: add.href,
    token,
    gateway: gateway.replace(/\/$/, "").replace(/\/ipfs$/, ""),
  };
}
export async function publishImage(
  image,
  { fetcher = fetch, env = process.env } = {},
) {
  const c = ipfsConfig(env);
  const form = new FormData();
  form.append(
    "file",
    new Blob([image.data], { type: image.mime }),
    "image.webp",
  );
  try {
    const response = await fetcher(c.add, {
      method: "POST",
      headers: { Authorization: "Bearer " + c.token },
      body: form,
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw Error("Upload failed");
    const lines = (await bounded(response, 16384))
      .toString()
      .trim()
      .split("\n");
    const cid = JSON.parse(lines.at(-1)).Hash;
    if (typeof cid !== "string" || !/^b[a-z2-7]{20,120}$/.test(cid))
      throw Error("Invalid CID");
    const url = c.gateway + "/ipfs/" + cid;
    const read = await fetcher(url, {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!read.ok || !(await bounded(read, 1048576)).equals(image.data))
      throw Error("Readback failed");
    return { cid, url, uri: "ipfs://" + cid };
  } catch {
    throw fail(
      "Image storage is unavailable or could not verify the upload. Please try again.",
    );
  }
}
