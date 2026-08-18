import {
  CHROME_UA,
  SAFARI_MOBILE_UA,
  getCookiesFromHeaders,
  serializeData,
} from "../utils/index.js";
import { getCleanUrl } from "../utils/urlUtils.js";
import { scraperFetch, createScraperResult } from "./httpHelper.js";

export let _igSource = null;

export function setInstagramSource(src) {
  _igSource = src;
}

async function scrapeInstagramEmbedDirect(cleanUrl) {
  try {
    const match = cleanUrl.match(
      /(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/,
    );

    if (!match) return null;

    const shortcode = match[1];

    const embedUrls = [
      `https://www.instagram.com/reel/${shortcode}/embed/captioned/`,
      `https://www.instagram.com/p/${shortcode}/embed/captioned/`,
      `https://www.instagram.com/reel/${shortcode}/embed/`,
      `https://www.instagram.com/p/${shortcode}/embed/`,
    ];

    let html = "";

    for (const embedUrl of embedUrls) {
      try {
        const res = await scraperFetch(
          {
            url: embedUrl,
            headers: {
              "User-Agent": SAFARI_MOBILE_UA,
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
            rawResponse: true,
          },
          "Instagram Direct Embed",
        );

        if (res?.data) {
          html =
            typeof res.data === "string"
              ? res.data
              : String(res.data);

          if (html.includes("shortcode_media")) break;
        }
      } catch {}
    }

    if (!html) return null;

    const unescaped = html
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");

    const marker = '"shortcode_media":';
    const index = unescaped.indexOf(marker);

    if (index === -1) return null;

    const start = index + marker.length;

    let depth = 0;
    let end = -1;

    for (let i = start; i < unescaped.length; i++) {
      if (unescaped[i] === "{") depth++;

      if (unescaped[i] === "}") {
        depth--;

        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }

    if (end === -1) return null;

    const media = JSON.parse(
      unescaped.slice(start, end),
    );

    const caption =
      media.edge_media_to_caption?.edges?.[0]?.node?.text ||
      "Instagram Media";

    const downloads = [];

    if (media.edge_sidecar_to_children?.edges) {
      media.edge_sidecar_to_children.edges.forEach(
        (edge, index) => {
          const node = edge.node;

          const mediaUrl =
            node.video_url ||
            node.display_url;

          if (!mediaUrl) return;

          downloads.push({
            url: mediaUrl,
            type: node.is_video ? "VIDEO" : "IMAGE",
            quality: node.is_video
              ? `HD Video ${index + 1}`
              : `HD Photo ${index + 1}`,
            thumbnail:
              node.display_url ||
              mediaUrl,
          });
        },
      );
    } else {
      const mediaUrl =
        media.video_url ||
        media.display_url;

      if (mediaUrl) {
        downloads.push({
          url: mediaUrl,
          type: media.is_video
            ? "VIDEO"
            : "IMAGE",
          quality: media.is_video
            ? "HD Video"
            : "HD Photo",
          thumbnail:
            media.display_url ||
            mediaUrl,
        });
      }
    }

    if (!downloads.length) return null;

    return createScraperResult(true, {
      title: caption.slice(0, 80),
      thumbnail:
        downloads[0].thumbnail ||
        downloads[0].url,
      downloads,
      sourceUrl: cleanUrl,
    });
  } catch (err) {
    console.warn(
      "[IG Embed Direct] Failed:",
      err,
    );

    return null;
  }
}

function extractLinksFromHtml(html) {
  try {
    const parser = new DOMParser();

    const doc = parser.parseFromString(
      html,
      "text/html",
    );

    const downloads = [];
    const seen = new Set();

    const add = (href, text = "") => {
      if (
        !href ||
        !/^https?:\/\//i.test(href)
      ) {
        return;
      }

      if (
        /instagram\.com/i.test(href)
      ) {
        return;
      }

      if (
        /\b(ads?|advert|premium|login|register)\b/i.test(
          href,
        )
      ) {
        return;
      }

      const clean = href.replace(
        /&amp;/g,
        "&",
      );

      if (seen.has(clean)) return;

      seen.add(clean);

      const isImage =
        /\.(jpe?g|png|webp|gif)(?:[?#]|$)/i.test(
          clean,
        ) ||
        /\b(image|photo|jpg|png)\b/i.test(
          text,
        );

      downloads.push({
        type: isImage
          ? "IMAGE"
          : "VIDEO",
        url: clean,
        quality:
          text.trim() ||
          (isImage
            ? "HD Photo"
            : "HD Video"),
      });
    };

    doc
      .querySelectorAll("a[href]")
      .forEach((a) => {
        add(
          a.getAttribute("href"),
          a.textContent || "",
        );
      });

    doc
      .querySelectorAll(
        "[data-url],[data-href],[onclick]",
      )
      .forEach((el) => {
        add(el.getAttribute("data-url"));
        add(el.getAttribute("data-href"));

        const onclick =
          el.getAttribute("onclick") || "";

        const matches =
          onclick.match(
            /https?:\/\/[^'"\s)]+/g,
          ) || [];

        matches.forEach((url) => add(url));
      });

    if (!downloads.length) {
      const matches =
        html.match(
          /https?:\/\/[^"'\s<>]+/g,
        ) || [];

      matches.forEach((url) => add(url));
    }

    return downloads;
  } catch {
    return [];
  }
}

async function scrapeInstagramSaveIg(
  cleanUrl,
) {
  const providers = [
    {
      name: "SaveIG",
      endpoint:
        "https://v3.saveig.app/api/ajaxSearch",
      origin: "https://saveig.app",
      referer: "https://saveig.app/",
    },
    {
      name: "IGDownloader",
      endpoint:
        "https://v3.igdownloader.app/api/ajaxSearch",
      origin:
        "https://igdownloader.app",
      referer:
        "https://igdownloader.app/en",
    },
  ];

  for (const provider of providers) {
    try {
      const res = await scraperFetch(
        {
          url: provider.endpoint,
          method: "POST",

          data: serializeData({
            recaptchaToken: "",
            q: cleanUrl,
            t: "media",
            lang: "en",
          }),

          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded; charset=UTF-8",

            Accept: "*/*",

            "User-Agent":
              SAFARI_MOBILE_UA,

            Origin: provider.origin,

            Referer: provider.referer,

            "X-Requested-With":
              "XMLHttpRequest",
          },

          rawResponse: true,
        },
        provider.name,
      );

      let body = res?.data;

      if (typeof body === "string") {
        if (
          body.trim().startsWith("<")
        ) {
          console.warn(
            `[${provider.name}] returned HTML`,
          );

          continue;
        }

        try {
          body = JSON.parse(body);
        } catch {
          continue;
        }
      }

      const html =
        body?.data ||
        body?.html ||
        body;

      if (
        typeof html !== "string"
      ) {
        continue;
      }

      const downloads =
        extractLinksFromHtml(html);

      if (!downloads.length) {
        continue;
      }

      return createScraperResult(
        true,
        {
          title: "Instagram Media",

          thumbnail:
            downloads[0].url,

          downloads,

          sourceUrl: cleanUrl,
        },
      );
    } catch (err) {
      console.warn(
        `[${provider.name}] failed:`,
        err?.message || err,
      );
    }
  }

  return null;
}

async function scrapeInstagramPostPage(
  cleanUrl,
) {
  try {
    const match = cleanUrl.match(
      /(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/,
    );

    if (!match) return null;

    const shortcode = match[1];

    const pageUrls = [
      `https://www.instagram.com/reel/${shortcode}/`,
      `https://www.instagram.com/p/${shortcode}/`,
    ];

    for (const pageUrl of pageUrls) {
      try {
        const res = await scraperFetch(
          {
            url: pageUrl,

            headers: {
              "User-Agent":
                SAFARI_MOBILE_UA,

              Accept:
                "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
            },

            rawResponse: true,
          },
          "Instagram Post Page",
        );

        const html =
          typeof res?.data === "string"
            ? res.data
            : String(res?.data || "");

        if (!html) continue;

        const parser = new DOMParser();

        const doc =
          parser.parseFromString(
            html,
            "text/html",
          );

        const downloads = [];

        const seen = new Set();

        const add = (
          url,
          type,
          thumbnail = url,
        ) => {
          if (
            !url ||
            !/^https?:\/\//i.test(
              url,
            ) ||
            seen.has(url)
          ) {
            return;
          }

          seen.add(url);

          downloads.push({
            url,
            type,
            quality:
              type === "VIDEO"
                ? "HD Video"
                : "HD Photo",
            thumbnail,
          });
        };

        const ogVideo =
          doc
            .querySelector(
              'meta[property="og:video"]',
            )
            ?.getAttribute(
              "content",
            ) ||
          doc
            .querySelector(
              'meta[property="og:video:secure_url"]',
            )
            ?.getAttribute(
              "content",
            );

        const ogImage =
          doc
            .querySelector(
              'meta[property="og:image"]',
            )
            ?.getAttribute(
              "content",
            );

        if (ogVideo) {
          add(
            ogVideo,
            "VIDEO",
            ogImage || ogVideo,
          );
        } else if (ogImage) {
          add(
            ogImage,
            "IMAGE",
            ogImage,
          );
        }

        if (!downloads.length) {
          continue;
        }

        return createScraperResult(
          true,
          {
            title:
              doc
                .querySelector(
                  'meta[property="og:title"]',
                )
                ?.getAttribute(
                  "content",
                ) ||
              "Instagram Media",

            thumbnail:
              ogImage ||
              downloads[0].url,

            downloads,

            sourceUrl: cleanUrl,
          },
        );
      } catch {}
    }
  } catch {}

  return null;
}

async function scrapeInstagramFallbacks(
  cleanUrl,
) {
  const embed =
    await scrapeInstagramEmbedDirect(
      cleanUrl,
    );

  if (embed) return embed;

  const post =
    await scrapeInstagramPostPage(
      cleanUrl,
    );

  if (post) return post;

  const saveIg =
    await scrapeInstagramSaveIg(
      cleanUrl,
    );

  if (saveIg) return saveIg;

  return null;
}

export async function scrapeInstagram(
  url,
) {
  let currentStatus = null;

  try {
    const cleanUrl =
      getCleanUrl(url).split("?")[0];

    if (!_igSource) {
      return {
        requireSource: true,
      };
    }

    if (
      _igSource === "downreels"
    ) {
      try {
        const res =
          await scraperFetch(
            {
              url:
                "https://api.zoraahub.com/fetch.php",

              method: "POST",

              data: {
                url: cleanUrl,
              },

              headers: {
                "Content-Type":
                  "application/json",

                "User-Agent":
                  CHROME_UA,

                Origin:
                  "https://downreels.com",

                Referer:
                  "https://downreels.com/",
              },

              rawResponse: true,
            },

            "DownReels",
          );

        currentStatus =
          res.status;

        let data = res.data;

        if (
          typeof data === "string"
        ) {
          if (
            data
              .trim()
              .startsWith("<")
          ) {
            throw new Error(
              "DownReels server returned HTML error page.",
            );
          }

          data = JSON.parse(data);
        }

        if (
          data &&
          data.status === "ok"
        ) {
          const items =
            data.videos ||
            data.images ||
            [];

          const downloads =
            items
              .filter(
                (item) =>
                  item?.url,
              )
              .map((item) => ({
                url: item.url,

                type: item.isVideo
                  ? "VIDEO"
                  : "IMAGE",

                quality:
                  item.quality ||
                  "HD",

                thumbnail:
                  item.thumb ||
                  null,
              }));

          if (downloads.length) {
            _igSource = null;

            return createScraperResult(
              true,
              {
                title:
                  "Instagram Media",

                thumbnail:
                  data.thumbnail ||
                  downloads[0].url,

                downloads,

                sourceUrl: url,
              },
            );
          }
        }
      } catch (err) {
        console.warn(
          "[DownReels] Failed:",
          err,
        );
      }

      const fallback =
        await scrapeInstagramFallbacks(
          cleanUrl,
        );

      if (fallback) {
        _igSource = null;
        return fallback;
      }

      throw new Error(
        "Instagram media could not be extracted. The post may be private, restricted, or the upstream extractor is unavailable.",
      );
    }

    if (
      _igSource === "indown"
    ) {
      try {
        const desktopUA =
          CHROME_UA;

        const acceptHeader =
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8";

        const r1 =
          await scraperFetch(
            {
              url:
                "https://indown.io/en2",

              headers: {
                "User-Agent":
                  desktopUA,

                Accept:
                  acceptHeader,
              },

              rawResponse: true,
            },

            "Indown Init",
          );

        currentStatus =
          r1.status;

        const parser =
          new DOMParser();

        const doc1 =
          parser.parseFromString(
            r1.data,
            "text/html",
          );

        const cookies =
          getCookiesFromHeaders(
            r1.headers,
          );

        const token =
          doc1
            .querySelector(
              'input[name="_token"]',
            )
            ?.value;

        if (token) {
          const r2 =
            await scraperFetch(
              {
                url:
                  "https://indown.io/download",

                method: "POST",

                data:
                  serializeData({
                    link: cleanUrl,
                    _token: token,
                    referer:
                      "https://indown.io/en2",
                    locale: "en",
                  }),

                headers: {
                  Cookie: cookies,

                  "Content-Type":
                    "application/x-www-form-urlencoded",

                  "User-Agent":
                    desktopUA,

                  Accept:
                    acceptHeader,

                  Referer:
                    "https://indown.io/en2",

                  Origin:
                    "https://indown.io",
                },

                rawResponse: true,
              },

              "Indown Download",
            );

          currentStatus =
            r2.status;

          const doc2 =
            parser.parseFromString(
              r2.data,
              "text/html",
            );

          const downloadsMap =
            new Map();

          const addLink = (a) => {
            const href =
              a.getAttribute(
                "href",
              );

            if (
              !href ||
              !href.startsWith(
                "http",
              ) ||
              href.includes(
                "indown.io",
              ) ||
              href.includes("ads")
            ) {
              return;
            }

            const key =
              href.split("?")[0];

            if (
              downloadsMap.has(
                key,
              )
            ) {
              return;
            }

            const text =
              (
                a.textContent ||
                ""
              ).toUpperCase();

            const isImage =
              /\.(jpe?g|png|webp|gif)(\?|$)/i.test(
                key,
              ) ||
              text.includes(
                "IMAGE",
              ) ||
              text.includes(
                "PHOTO",
              );

            downloadsMap.set(
              key,
              {
                type: isImage
                  ? "IMAGE"
                  : "VIDEO",

                url: href,
              },
            );
          };

          const btnLinks =
            doc2.querySelectorAll(
              ".btn-group-vertical a, a.btn-color, a.btn, a[href*='cdninstagram'], a[href*='fbcdn']",
            );

          btnLinks.forEach(
            addLink,
          );

          if (
            downloadsMap.size ===
            0
          ) {
            const resultArea =
              doc2.querySelector(
                ".container .row",
              ) || doc2;

            resultArea
              .querySelectorAll(
                "a[href]",
              )
              .forEach(addLink);
          }

          const downloads = [
            ...downloadsMap.values(),
          ];

          if (downloads.length) {
            _igSource = null;

            return createScraperResult(
              true,
              {
                title:
                  "Instagram Content",

                thumbnail:
                  downloads[0].url,

                downloads,

                sourceUrl: url,
              },
            );
          }
        }
      } catch (err) {
        console.warn(
          "[Indown] Failed:",
          err,
        );
      }

      const fallback =
        await scrapeInstagramFallbacks(
          cleanUrl,
        );

      if (fallback) {
        _igSource = null;
        return fallback;
      }

      throw new Error(
        "Instagram media could not be extracted. The post may be private, restricted, or the upstream extractor is unavailable.",
      );
    }

    throw new Error(
      "Invalid source selected.",
    );
  } catch (err) {
    _igSource = null;

    return createScraperResult(
      false,
      err.message,
      currentStatus,
    );
  }
}
