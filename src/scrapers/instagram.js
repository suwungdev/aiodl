import { igdl } from "btch-downloader";
import { getCleanUrl } from "../utils/urlUtils.js";
import { createScraperResult } from "./httpHelper.js";

export let _igSource = null;

export function setInstagramSource(source) {
  _igSource = source;
}

function getMediaType(item, sourceUrl) {
  const values = [
    item?.type,
    item?.mediaType,
    item?.media_type,
    item?.mime,
    item?.mimeType,
    item?.mime_type,
    item?.format,
  ];

  for (const value of values) {
    if (!value) continue;

    const v = String(value).toLowerCase();

    if (
      v.includes("video") ||
      v.includes("mp4")
    ) {
      return "VIDEO";
    }

    if (
      v.includes("image") ||
      v.includes("photo") ||
      v.includes("jpg") ||
      v.includes("jpeg") ||
      v.includes("png")
    ) {
      return "IMAGE";
    }
  }

  const mediaUrl = String(item?.url || "").toLowerCase();

  if (
    /\.(mp4|mov|m4v|webm)(?:[?#]|$)/i.test(mediaUrl) ||
    mediaUrl.includes(".mp4")
  ) {
    return "VIDEO";
  }

  // Reel/Reels/TV URL dari Instagram = video.
  const source = String(sourceUrl).toLowerCase();

  if (
    source.includes("/reel/") ||
    source.includes("/reels/") ||
    source.includes("/tv/")
  ) {
    return "VIDEO";
  }

  return "IMAGE";
}

function getThumbnail(item) {
  return (
    item?.thumbnail ||
    item?.thumb ||
    item?.cover ||
    item?.preview ||
    null
  );
}

export async function scrapeInstagram(
  url,
  source = "btch",
) {
  try {
    const cleanUrl = getCleanUrl(url);

    console.log(
      `[Instagram] Using btch-downloader: ${cleanUrl}`,
    );

    const result = await igdl(cleanUrl);

    console.log(
      "[Instagram] btch status:",
      result?.status,
    );

    console.log(
      "[Instagram] btch items:",
      Array.isArray(result?.result)
        ? result.result.length
        : 0,
    );

    if (!result) {
      throw new Error(
        "Instagram downloader returned no response.",
      );
    }

    if (result.status === false) {
      throw new Error(
        result.message ||
          result.error ||
          "Instagram downloader failed.",
      );
    }

    if (
      !Array.isArray(result.result) ||
      result.result.length === 0
    ) {
      throw new Error(
        "No downloadable media was found.",
      );
    }

    const downloads = [];
    const seen = new Set();

    for (const item of result.result) {
      if (!item?.url) continue;

      const mediaUrl = String(item.url);

      if (
        !/^https?:\/\//i.test(mediaUrl)
      ) {
        continue;
      }

      if (seen.has(mediaUrl)) {
        continue;
      }

      seen.add(mediaUrl);

      const thumbnail = getThumbnail(item);

      const type = getMediaType(
        item,
        cleanUrl,
      );

      downloads.push({
        url: mediaUrl,
        type,
        quality:
          type === "VIDEO"
            ? "HD Video"
            : "HD Photo",
        thumbnail,
      });
    }

    if (downloads.length === 0) {
      throw new Error(
        "Instagram returned media data, but no valid media URL was found.",
      );
    }

    console.log(
      `[Instagram] Found ${downloads.length} media item(s).`,
    );

    return createScraperResult(true, {
      title:
        downloads.length > 1
          ? `Instagram Media (${downloads.length})`
          : "Instagram Media",

      thumbnail:
        downloads[0].thumbnail ||
        downloads[0].url,

      downloads,

      sourceUrl: url,
    });
  } catch (error) {
    console.error(
      "[Instagram] btch error:",
      error,
    );

    return createScraperResult(
      false,
      error?.message ||
        "Instagram download failed.",
    );
  }
}
