import React, { useState } from "react";
export function ImageUpload({ api, purpose, onUploaded, disabled = false }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="image-upload span2">
      <label>
        Upload to public IPFS
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled || busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy(true);
            setError("");
            try {
              if (file.size > 1048576)
                throw Error("Choose an image up to 1 MB.");
              const image = await new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onload = () => resolve(r.result);
                r.onerror = () => reject(Error("Unable to read this image."));
                r.readAsDataURL(file);
              });
              onUploaded(await api("images", { purpose, image }));
            } catch (err) {
              setError(err.message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      <small>
        JPEG, PNG or WebP, up to 1 MB. Images are public; removing them here
        does not erase copies on IPFS.
      </small>
      {busy && <p role="status">Uploading and verifying image…</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
export function ProfileImage({ user, setUser, api }) {
  const [pending, setPending] = useState(null),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  async function save(id) {
    setBusy(true);
    setError("");
    try {
      const result = await api("profile/image", { upload_id: id });
      setUser((u) => ({ ...u, ...result }));
      setPending(null);
      setStatus(id ? "Profile picture saved." : "Profile picture removed.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="profile-image">
      <h3>Profile picture</h3>
      {(pending?.url || user?.avatar_url) && (
        <img
          className="profile-avatar"
          src={pending?.url || user.avatar_url}
          alt="Profile picture preview"
        />
      )}
      <ImageUpload
        api={api}
        purpose="profile"
        disabled={busy}
        onUploaded={(r) => {
          setPending(r);
          setStatus("Image uploaded. Save to use it as your profile picture.");
        }}
      />
      {pending && (
        <button
          className="primary"
          disabled={busy}
          onClick={() => save(pending.id)}
        >
          Save profile picture
        </button>
      )}
      {pending && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            setPending(null);
            setStatus("");
          }}
        >
          Cancel change
        </button>
      )}
      {user?.avatar_url && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => save(null)}
        >
          Remove profile picture
        </button>
      )}
      {status && <p role="status">{status}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
