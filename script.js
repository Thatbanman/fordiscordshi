const manifestPath = "videos/videos.json";
const videoListEl = document.querySelector("#video-list");
const statusBannerEl = document.querySelector("#status");
const template = document.querySelector("#video-card-template");

/**
 * Load and render the video library once the document is ready.
 */
document.addEventListener("DOMContentLoaded", () => {
  loadVideos().catch((error) => {
    displayStatus(error.message, true);
  });
});

async function loadVideos() {
  displayStatus("Loading videos…", false);
  const entries = await fetchManifest();

  if (!entries.length) {
    displayStatus("No videos found in the manifest.", true);
    return;
  }

  videoListEl.innerHTML = "";
  const fragment = document.createDocumentFragment();

  entries.forEach((entry) => {
    const card = buildVideoCard(entry);
    fragment.appendChild(card);
  });

  videoListEl.appendChild(fragment);
  hideStatus();
}

async function fetchManifest() {
  const response = await fetch(manifestPath, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      `Unable to load manifest at ${manifestPath} (status ${response.status}).`
    );
  }

  const payload = await response.json();
  if (Array.isArray(payload)) {
    return payload.map(normalizeEntry).filter(Boolean);
  }

  if (Array.isArray(payload.files)) {
    return payload.files.map(normalizeEntry).filter(Boolean);
  }

  throw new Error("Manifest format invalid. Expected an array or an object with a files array.");
}

function normalizeEntry(rawEntry) {
  if (typeof rawEntry === "string") {
    return {
      name: rawEntry,
      url: `videos/${encodeURIComponent(rawEntry)}`,
    };
  }

  if (rawEntry && typeof rawEntry === "object") {
    const fileName = rawEntry.name ?? rawEntry.file ?? rawEntry.title;
    const fileUrl = rawEntry.url ?? (fileName ? `videos/${encodeURIComponent(fileName)}` : null);

    if (!fileName || !fileUrl) {
      return null;
    }

    return {
      name: fileName,
      url: fileUrl,
      poster: rawEntry.poster ?? rawEntry.thumbnail ?? null,
    };
  }

  return null;
}

function buildVideoCard(entry) {
  const instance = template.content.firstElementChild.cloneNode(true);

  const titleBtn = instance.querySelector(".video-card__title");
  const videoEl = instance.querySelector(".video-card__player");
  const downloadEl = instance.querySelector(".video-card__download");
  const copyBtn = instance.querySelector(".video-card__copy");

  const safeLabel = prettifyLabel(entry.name);
  titleBtn.textContent = safeLabel;

  videoEl.src = entry.url;
  videoEl.setAttribute("aria-label", `Preview of ${safeLabel}`);
  videoEl.tabIndex = 0;

  if (entry.poster) {
    videoEl.poster = entry.poster;
  }

  downloadEl.href = entry.url;
  downloadEl.download = entry.name;
  downloadEl.title = `Download ${safeLabel}`;

  copyBtn.addEventListener("click", () => handleCopy(entry.url, copyBtn));

  titleBtn.addEventListener("click", () => {
    videoEl.scrollIntoView({ behavior: "smooth", block: "center" });
    videoEl.focus({ preventScroll: true });
  });

  return instance;
}

async function handleCopy(url, button) {
  if (!navigator.clipboard) {
    displayStatus("Clipboard access is not available in this browser.", true);
    return;
  }

  try {
    await navigator.clipboard.writeText(new URL(url, document.baseURI).href);
    flashButton(button);
    displayStatus("Link copied to clipboard.", false);
  } catch (error) {
    displayStatus("Unable to copy link. Check browser permissions.", true);
  }
}

function flashButton(button) {
  button.disabled = true;
  button.setAttribute("aria-disabled", "true");
  button.textContent = "Copied!";

  setTimeout(() => {
    button.disabled = false;
    button.removeAttribute("aria-disabled");
    button.textContent = "Copy Link";
  }, 1500);
}

function displayStatus(message, isError) {
  statusBannerEl.textContent = message;
  statusBannerEl.hidden = false;
  statusBannerEl.classList.toggle("status-banner--error", Boolean(isError));
}

function hideStatus() {
  statusBannerEl.hidden = true;
  statusBannerEl.textContent = "";
  statusBannerEl.classList.remove("status-banner--error");
}

function prettifyLabel(label) {
  return label.replace(/[-_]+/g, " ").replace(/\.[a-z0-9]+$/i, "");
}
