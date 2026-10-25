require("dotenv").config();

const express = require("express");
const multer = require("multer");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Поддерживаются JPG, PNG и WEBP."));
    }
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    configured: Boolean(
      process.env.CLOUDFLARE_API_TOKEN &&
      process.env.CLOUDFLARE_ACCOUNT_ID
    )
  });
});

app.post("/api/generate", upload.single("reference"), async (req, res) => {
  try {
    const token = process.env.CLOUDFLARE_API_TOKEN;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

    if (!token || !accountId) {
      return res.status(503).json({
        error: "Не настроен Cloudflare. Проверь CLOUDFLARE_API_TOKEN и CLOUDFLARE_ACCOUNT_ID в Render."
      });
    }

    const idea = (req.body.idea || "").trim();
    const headline = (req.body.headline || "").trim();
    const style = (req.body.style || "cinematic").trim();

    if (!idea) {
      return res.status(400).json({
        error: "Напиши, о чём видео."
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: "Прикрепи фото-референс."
      });
    }

    const styleMap = {
      cinematic:
        "cinematic lighting, dramatic shadows, strong contrast, professional YouTube thumbnail",
      realistic:
        "photorealistic, realistic materials, natural details, sharp focus",
      gaming:
        "high-energy gaming thumbnail, vivid colors, dramatic atmosphere",
      minimal:
        "clean minimal composition, one strong focal point, restrained colors"
    };

    const textInstruction = headline
      ? `The requested Russian headline is: "${headline}". Leave clear space for this headline. Do not generate additional text.`
      : "No text, letters, logos, watermarks, or typography.";

    const prompt = `
Create a professional YouTube thumbnail in a wide 16:9 landscape format.

VIDEO TOPIC:
${idea}

VISUAL STYLE:
${styleMap[style] || styleMap.cinematic}

Use the uploaded image as the main visual reference. Preserve the recognizable identity of the vehicle or object, its important details, colors, and overall character.

Create a more striking composition suitable for a professional YouTube thumbnail. Clear focal subject, dramatic but believable lighting, readable at small size, strong foreground/background separation, detailed image, uncluttered composition.

${textInstruction}

No borders, no mockups, no user interface, no collage panels.
`;

    const endpoint =
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/runwayml/stable-diffusion-v1-5-img2img`;

    const apiResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt,
        negative_prompt:
          "blurry, low quality, distorted vehicle, duplicate objects, extra wheels, deformed details, watermark, unreadable text",
        image_b64: req.file.buffer.toString("base64"),
        width: 1024,
        height: 576,
        num_steps: 20,
        strength: 0.65,
        guidance: 7.5
      })
    });

    const contentType =
      apiResponse.headers.get("content-type") || "";

    if (!apiResponse.ok) {
      let detail = "Cloudflare не смог создать изображение.";

      if (contentType.includes("application/json")) {
        const errorData = await apiResponse.json();

        detail =
          errorData.errors?.map(e => e.message).join("; ") ||
          errorData.error ||
          detail;

        console.error("Cloudflare API error:", errorData);
      } else {
        detail = (await apiResponse.text()).slice(0, 500);
        console.error("Cloudflare API error:", detail);
      }

      const status =
        apiResponse.status === 401 || apiResponse.status === 403
          ? 401
          : apiResponse.status === 429
          ? 429
          : 502;

      return res.status(status).json({
        error:
          status === 401
            ? "Cloudflare не принял токен или у токена недостаточно прав. Проверь настройки API."
            : status === 429
            ? "Лимит Cloudflare исчерпан или модель временно перегружена. Попробуй позже."
            : `Ошибка Cloudflare: ${detail}`
      });
    }

    let imageBuffer;
    let mimeType = "image/png";

    if (contentType.startsWith("image/")) {
      imageBuffer = Buffer.from(await apiResponse.arrayBuffer());
      mimeType = contentType.split(";")[0];
    } else if (contentType.includes("application/json")) {
      const data = await apiResponse.json();

      const imageData =
        data.result?.image ||
        data.result?.data ||
        data.image;

      if (typeof imageData === "string") {
        imageBuffer = Buffer.from(imageData, "base64");
      }

      if (!imageBuffer) {
        console.error(
          "Unexpected Cloudflare response:",
          JSON.stringify(data).slice(0, 1500)
        );

        throw new Error(
          "Cloudflare ответил, но изображение не найдено в ответе."
        );
      }
    } else {
      throw new Error(
        "Cloudflare вернул неизвестный формат ответа."
      );
    }

    res.json({
      image: `data:${mimeType};base64,${imageBuffer.toString("base64")}`
    });

  } catch (err) {
    console.error("Generation error:", err);

    res.status(500).json({
      error: err.message || "Не удалось создать превью."
    });
  }
});

app.use((err, _req, res, _next) => {
  if (
    err instanceof multer.MulterError &&
    err.code === "LIMIT_FILE_SIZE"
  ) {
    return res.status(400).json({
      error: "Файл слишком большой. Максимум — 12 МБ."
    });
  }

  res.status(400).json({
    error: err.message || "Не удалось загрузить файл."
  });
});

app.listen(port, () => {
  console.log(`Thumbnail AI Studio listening on port ${port}`);
});
