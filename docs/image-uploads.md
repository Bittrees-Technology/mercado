# Image uploads

Mercado uses the existing Bittrees authenticated IPFS upload service and public gateway. Server credentials never enter the browser bundle.

## User workflow

- **Profile picture:** open your account, choose an image under “Upload to public IPFS,” review the preview, then save. Removing the picture clears the account association.
- **Catalog image:** use the product editor’s replacement-photo upload, then save the product.
- **Vendor image:** upload in Product submissions, then submit for review. Catalog staff retain publication control.

JPEG, PNG and WebP files up to 1 MB are accepted. The server decodes the image, applies its orientation, strips metadata and converts it to WebP with a maximum side of 2,048 pixels. Images over 25 million input pixels are rejected. Animated uploads become a still image.

Uploads are public. Replacing, canceling or removing an image does not delete copies on IPFS. Avoid uploading sensitive material. Product and profile changes take effect only when saved; abandoned uploads remain pinned.

## Configuration and storage

Production uses `IPFS_API_URL=https://ipfs-api.nftfactory.org`, the server-only `IPFS_API_BEARER_TOKEN`, and `IPFS_GATEWAY_BASE_URL=https://ipfs.nftfactory.org`. Set these variables in each environment that should permit uploads. Never expose the token with a client-side environment prefix.

The server sends multipart content to `/api/v0/add` with pinning enabled and CID v1. It verifies the returned content through the public gateway before recording the upload. Uploads and reads have bounded response sizes, deadlines and no redirects. A failed verification leaves the current product or profile unchanged; a pin may already exist upstream.

`marcada.ipfs_uploads` records the account, purpose, CID, gateway URL, media type and size. Account picture references live on `marcada.users`. Existing database-backed product images remain readable through their original URLs. Apply `npm run db:migrate` before deploying this version.

All uploads require authentication and CSRF protection. Product uploads require vendor or catalog permissions. Profile save requires an owned profile-upload ID; arbitrary URLs or another account’s uploads are rejected. Upload attempts are limited to 10 per 10 minutes per account/IP and successful distinct uploads to 20 per account per day. Shared-service capacity and pin retention are operational responsibilities; this release does not automatically unpin content.

## Validation

`npm test` covers decoding, metadata stripping, resizing, authenticated pinning, credential isolation and readback failures. The isolated API integration suite checks upload permissions, account ownership, profile persistence/removal and existing catalog/workflow boundaries. Live storage can be checked with a small non-sensitive test image; never use a customer image as a test fixture.
