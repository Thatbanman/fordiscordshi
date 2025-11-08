const videosDirectory = "videos/";
const manifestPath = `${videosDirectory}videos.json`;
const MP4_PATTERN = /\.mp4$/i;
const NSFW_PATTERN = /nsfw/i;

const videoListEl = document.querySelector("#video-list");
const statusBannerEl = document.querySelector("#status");
const template = document.querySelector("#video-card-template");

// Bootstraps the gallery once the document is interactive.
document.addEventListener("DOMContentLoaded", () => {
  loadVideos().catch((error) => {
    displayStatus(error.message, true);
  });
});

async function loadVideos() {
  displayStatus("Loading videos…", false);

  try {
    const discovered = await discoverVideoEntries();
    const entries = dedupeEntries(discovered);

    if (!entries.length) {
      displayStatus(
        "No MP4 videos found in the videos directory. Ensure files are present and publicly readable.",
        true
      );
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    renderEntries(entries);
    hideStatus();
  } catch (error) {
    displayStatus(error.message, true);
  }
}

function renderEntries(entries) {
  videoListEl.innerHTML = "";
  const fragment = document.createDocumentFragment();

  entries.forEach((entry) => {
    const card = buildVideoCard(entry);
    fragment.appendChild(card);
  });

  videoListEl.appendChild(fragment);
}

async function discoverVideoEntries() {
  try {
    const manifestEntries = await fetchManifest();
    if (manifestEntries.length) {
      return manifestEntries;
    }
  } catch (manifestError) {
    console.warn("[video-library] Manifest lookup skipped:", manifestError);
  }

  return await scrapeDirectoryListing();
}

async function fetchManifest() {
  const response = await fetch(manifestPath, { cache: "no-store" });

  if (response.status === 404) {
    throw new Error(`Manifest not found at ${manifestPath}`);
  }

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

async function scrapeDirectoryListing() {
  const response = await fetch(videosDirectory, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(
      `Unable to read directory listing at ${videosDirectory} (status ${response.status}).`
    );
  }

  const html = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const anchors = Array.from(doc.querySelectorAll("a[href]"));

  const entries = anchors
    .map((anchor) => anchor.getAttribute("href") || "")
    .map((href) => href.split("?")[0])
    .map((href) => href.replace(/^\.\/?/, ""))
    .filter((href) => href && !href.startsWith("../"))
    .filter((href) => MP4_PATTERN.test(href))
    .map((href) => normalizeEntry({ name: nameFromPath(href), url: href }))
    .filter(Boolean);

  if (!entries.length) {
    throw new Error(
      "No MP4 files were discovered in the videos directory. Enable directory listings or add a videos.json manifest."
    );
  }

  return entries;
}

function normalizeEntry(rawEntry) {
  if (typeof rawEntry === "string") {
    return createEntryFromPath(rawEntry);
  }

  if (rawEntry && typeof rawEntry === "object") {
    const fileName = rawEntry.name ?? rawEntry.file ?? rawEntry.title ?? "";
    const rawUrl = rawEntry.url ?? fileName;

    if (!rawUrl) {
      return null;
    }

    const url = resolveVideoPath(rawUrl);
    const name = decodeURIComponent(fileName || nameFromPath(url));

    return {
      name,
      url,
      poster: rawEntry.poster ?? rawEntry.thumbnail ?? null,
    };
  }

  return null;
}

function createEntryFromPath(path) {
  const url = resolveVideoPath(path);
  const name = decodeURIComponent(nameFromPath(url));
  return name ? { name, url } : null;
}

function buildVideoCard(entry) {
  const instance = template.content.firstElementChild.cloneNode(true);

  const titleBtn = instance.querySelector(".video-card__title");
  const warningEl = instance.querySelector(".video-card__nsfw-warning");
  const videoEl = instance.querySelector(".video-card__player");
  const actionsEl = instance.querySelector(".video-card__actions");
  const downloadEl = instance.querySelector(".video-card__download");
  const copyBtn = instance.querySelector(".video-card__copy");

  const safeLabel = prettifyLabel(entry.name || nameFromPath(entry.url));
  titleBtn.textContent = safeLabel;

  videoEl.src = entry.url;
  videoEl.setAttribute("aria-label", `Preview of ${safeLabel}`);
  videoEl.tabIndex = 0;

  if (entry.poster) {
    videoEl.poster = entry.poster;
  }

  downloadEl.href = entry.url;
  downloadEl.download = entry.name || nameFromPath(entry.url);
  downloadEl.title = `Download ${safeLabel}`;

  copyBtn.addEventListener("click", () => handleCopy(entry.url, copyBtn));

  const nsfw = isNSFW(entry.name) || isNSFW(entry.url);

  if (nsfw) {
    instance.classList.add("video-card--nsfw");
    warningEl.hidden = false;
    videoEl.hidden = true;
    actionsEl.hidden = true;
  }

  titleBtn.addEventListener("click", () => {
    if (nsfw && !warningEl.hidden) {
      instance.classList.remove("video-card--nsfw");
      warningEl.hidden = true;
      videoEl.hidden = false;
      actionsEl.hidden = false;
    }

    scrollToVideo(videoEl);
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

  if (!button.dataset.originalLabel) {
    button.dataset.originalLabel = button.textContent;
  }

  button.textContent = "Copied!";

  setTimeout(() => {
    button.disabled = false;
    button.removeAttribute("aria-disabled");
    button.textContent = button.dataset.originalLabel || "Copy Link";
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
  return decodeURIComponent(label)
    .replace(/[-_]+/g, " ")
    .replace(/\.[a-z0-9]+$/i, "")
    .trim();
}

function scrollToVideo(videoEl) {
  videoEl.scrollIntoView({ behavior: "smooth", block: "center" });
  videoEl.focus({ preventScroll: true });
}

function resolveVideoPath(rawPath) {
  if (/^https?:/i.test(rawPath)) {
    return rawPath;
  }

  const sanitized = rawPath.trim().replace(/^\.?(?:\\|\/)+/, "");
  const relative = sanitized.startsWith(videosDirectory)
    ? sanitized
    : `${videosDirectory}${sanitized}`;

  return relative
    .split("/")
    .map((segment, index) => {
      if (index === 0) {
        return segment;
      }

      try {
        return encodeURIComponent(decodeURIComponent(segment));
      } catch (_error) {
        return encodeURIComponent(segment);
      }
    })
    .join("/");
}

function nameFromPath(path) {
  const withoutQuery = path.split("?")[0];
  return withoutQuery.split("/").pop() || "";
}

function isNSFW(value) {
  return typeof value === "string" && NSFW_PATTERN.test(value);
}

function dedupeEntries(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    if (!entry || !entry.url) {
      return false;
    }

    const key = entry.url.toLowerCase();
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
