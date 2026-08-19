import "./bootstrap.js";
import express from "express";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  detectPlatform,
  listPlatforms,
  scrape,
} from "./platforms.js";

import {
  getPlatformConfigs,
  getPlatformConfig,
  savePlatformConfig,
  isAdminConfigured,
} from "./services/platformConfig.js";

import {
  recordPlatformRequest,
  getRequestStats,
} from "./services/requestStats.js";

const __dirname = path.dirname(
  fileURLToPath(import.meta.url)
);

const app = express();

const port = Number(
  process.env.PORT || 3000
);

const publicDir = path.join(
  __dirname,
  "..",
  "public"
);

app.disable("x-powered-by");

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
  })
);

app.use(compression());

app.use(
  express.json({
    limit: "16kb",
  })
);

app.use(
  express.urlencoded({
    extended: false,
    limit: "16kb",
  })
);


/* =========================
   RATE LIMIT
========================= */

const scrapeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(
    process.env.AIODL_RATE_LIMIT || 30
  ),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    status: false,
    message:
      "Too many requests. Please wait a moment and try again.",
  },
});


/* =========================
   HEALTH
========================= */

app.get(
  "/api/health",
  (_req, res) =>
    res.json({
      status: true,
      service: "AIODL",
      uptime: Math.round(
        process.uptime()
      ),
    })
);


/* =========================
   PUBLIC PLATFORMS
========================= */

app.get(
  "/api/platforms",
  async (_req, res) => {
    const configs =
      await getPlatformConfigs();

    res.json({
      status: true,
      platforms: listPlatforms().map(
        (p) => ({
          ...p,
          ...(configs[p.id] || {}),
        })
      ),
    });
  }
);


/* =========================
   ADMIN AUTH
========================= */

const requireAdmin = (
  req,
  res,
  next
) => {
  const expected =
    process.env.AIODL_ADMIN_TOKEN;

  const supplied =
    req.get("x-admin-token") || "";

  if (!expected) {
    return res.status(503).json({
      status: false,
      message:
        "Admin is not configured. Set AIODL_ADMIN_TOKEN in Vercel.",
    });
  }

  if (supplied !== expected) {
    return res.status(401).json({
      status: false,
      message: "Invalid admin token.",
    });
  }

  next();
};


/* =========================
   ADMIN PLATFORMS
========================= */

app.get(
  "/api/admin/platforms",
  requireAdmin,
  async (_req, res) => {
    const configs =
      await getPlatformConfigs();

    res.json({
      status: true,
      configured:
        isAdminConfigured(),

      platforms:
        listPlatforms().map(
          (p) => ({
            ...p,
            ...(configs[p.id] || {}),
          })
        ),
    });
  }
);


/* =========================
   ADMIN PLATFORM STATS
========================= */

app.get(
  "/api/admin/stats",
  requireAdmin,
  async (_req, res) => {
    try {
      const stats =
        await getRequestStats({
          force: true,
        });

      res.json({
        status: true,
        stats,
      });
    } catch (error) {
      res.status(500).json({
        status: false,
        message:
          error?.message ||
          "Unable to load request statistics.",
      });
    }
  }
);


/* =========================
   SAVE PLATFORM CONFIG
========================= */

app.put(
  "/api/admin/platforms/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const id = req.params.id;

      const patch = {
        enabled:
          req.body?.enabled,

        maintenance:
          req.body?.maintenance,

        maintenance_message:
          req.body?.maintenance_message,
      };

      const saved =
        await savePlatformConfig(
          id,
          patch
        );

      res.json({
        status: true,
        platform: saved,
      });
    } catch (err) {
      res.status(400).json({
        status: false,
        message:
          err?.message ||
          "Unable to save platform config.",
      });
    }
  }
);


/* =========================
   SCRAPE
========================= */

app.post(
  "/api/scrape",
  scrapeLimiter,
  async (req, res) => {

    const input =
      typeof req.body?.url === "string"
        ? req.body.url.trim()
        : "";

    if (
      !input ||
      input.length > 2048
    ) {
      return res.status(400).json({
        status: false,
        message:
          "Please enter a valid URL.",
      });
    }

    let url;

    try {
      url = new URL(input).href;
    } catch {
      return res.status(400).json({
        status: false,
        message:
          "That URL is not valid.",
      });
    }

    if (
      !/^https?:$/.test(
        new URL(url).protocol
      )
    ) {
      return res.status(400).json({
        status: false,
        message:
          "Only HTTP and HTTPS links are supported.",
      });
    }


    /* =========================
       DETECT PLATFORM
    ========================= */

    const platform =
      detectPlatform(url);

    if (!platform) {
      return res.status(400).json({
        status: false,
        message:
          "This platform is not supported yet.",
      });
    }


    /* =========================
       MAINTENANCE CHECK
    ========================= */

    const config =
      await getPlatformConfig(
        platform.id
      );

    if (
      config?.maintenance ||
      config?.enabled === false
    ) {

      /*
       * Maintenance request is still
       * counted as a failed request.
       */

      void recordPlatformRequest(
        platform.id,
        false
      );

      return res.status(503).json({
        status: false,
        code:
          "PLATFORM_MAINTENANCE",

        message:
          config.maintenance_message ||
          `${platform.name} sedang dalam maintenance.`,

        platform:
          platform.id,
      });
    }


    const started = Date.now();


    /* =========================
       SCRAPER
    ========================= */

    try {

      const response =
        await scrape(url);

      const result =
        response.result || {};


      const safeDownloads =
        Array.isArray(
          result.downloads
        )
          ? result.downloads
              .filter(
                (d) =>
                  d?.url &&
                  /^https?:\/\//i.test(
                    d.url
                  )
              )
              .map(
                (d, i) => ({
                  id: i + 1,

                  type: String(
                    d.type ||
                    d.quality ||
                    "Download"
                  ).slice(
                    0,
                    80
                  ),

                  quality:
                    d.quality
                      ? String(
                          d.quality
                        ).slice(
                          0,
                          50
                        )
                      : null,

                  url: d.url,

                  thumbnail:
                    d.thumbnail ||
                    null,
                })
              )
          : [];


      if (
        !safeDownloads.length
      ) {
        throw new Error(
          "No downloadable media was found."
        );
      }


      /*
       * SUCCESS STAT
       *
       * void = don't make the user
       * wait for Supabase.
       */

      void recordPlatformRequest(
        platform.id,
        true
      );


      res.json({
        status: true,

        platform: {
          id: platform.id,
          name: platform.name,
          icon: platform.icon,
        },

        result: {
          title:
            result.title ||
            `${platform.name} Media`,

          author:
            result.author ||
            null,

          thumbnail:
            result.thumbnail ||
            null,

          downloads:
            safeDownloads,

          sourceUrl:
            url,
        },

        tookMs:
          Date.now() -
          started,
      });

    } catch (err) {

      console.error(
        `[${platform.id}]`,
        err
      );


      /*
       * FAILED STAT
       */

      void recordPlatformRequest(
        platform.id,
        false
      );


      res.status(502).json({
        status: false,

        message:
          err?.message ||
          "Unable to process this link right now.",

        platform:
          platform.id,
      });
    }
  }
);


/* =========================
   SYSTEM FILES
========================= */

app.get("/robots.txt", (_req, res) => {
  res
    .type("text/plain")
    .send(
`User-agent: *
Allow: /

Sitemap: https://aiodl.suwung.id/sitemap.xml`
    );
});

/* =========================
   API GET PROTECTION
========================= */

app.get("/api/scrape", (_req, res) => {
  res.status(405).json({
    status: false,
    message: "Method GET not allowed. Use POST /api/scrape.",
  });
});


/* =========================
   STATIC
========================= */

app.use(
  express.static(
    publicDir,
    {
      maxAge: "1d",
      etag: true,
      extensions: ["html"],
    }
  )
);

app.get(
  "/{*splat}",
  (_req, res) =>
    res.sendFile(
      path.join(
        publicDir,
        "index.html"
      )
    )
);


export {
  app,
};

export default app;