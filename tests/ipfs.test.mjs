import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { prepareImage, publishImage, ipfsConfig } from "../lib/ipfs.mjs";
const env = {
  IPFS_API_URL: "https://writer.example/api/v0",
  IPFS_API_BEARER_TOKEN: "test-secret",
  IPFS_GATEWAY_BASE_URL: "https://read.example/ipfs",
};
const cid = "bafybeiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
test("image processing decodes, resizes and strips metadata", async () => {
  const png = await sharp({
    create: { width: 2500, height: 10, channels: 3, background: "#abc" },
  })
    .withMetadata({ exif: { IFD0: { Artist: "private" } } })
    .png()
    .toBuffer();
  const image = await prepareImage(
    "data:image/png;base64," + png.toString("base64"),
  );
  const meta = await sharp(image.data).metadata();
  assert.equal(meta.width, 2048);
  assert.equal(meta.format, "webp");
  assert.equal(meta.exif, undefined);
  await assert.rejects(() =>
    prepareImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=="),
  );
});
test("pin upload verifies bytes and never sends credentials to read gateway", async () => {
  let count = 0;
  const data = Buffer.from("test");
  const result = await publishImage(
    { data, mime: "image/webp" },
    {
      env,
      fetcher: async (url, options) => {
        count++;
        assert.equal(options.redirect, "error");
        if (count === 1) {
          assert.equal(options.headers.Authorization, "Bearer test-secret");
          assert.equal(new URL(url).searchParams.get("pin"), "true");
          assert.equal(new URL(url).pathname, "/api/v0/add");
          return new Response(JSON.stringify({ Hash: cid }));
        }
        assert.equal(options.headers, undefined);
        assert.equal(url, "https://read.example/ipfs/" + cid);
        return new Response(data);
      },
    },
  );
  assert.equal(result.uri, "ipfs://" + cid);
  assert.equal(count, 2);
});
test("storage failures and mismatched content never return a usable URL", async () => {
  assert.throws(() => ipfsConfig({}), { status: 503 });
  for (const hash of ["../../bad", cid]) {
    let n = 0;
    await assert.rejects(
      () =>
        publishImage(
          { data: Buffer.from("a"), mime: "image/webp" },
          {
            env,
            fetcher: async () =>
              ++n === 1
                ? new Response(JSON.stringify({ Hash: hash }))
                : new Response("wrong"),
          },
        ),
      { status: 502 },
    );
  }
});
