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
    cb(allowed.includes(file.mimetype) ? null : new Error("Поддерживаются JPG, PNG и WEBP."), allowed.includes(file.mimetype));
  }
});

app.use(express.static(path.join(__dirname, "public")));
app.get("/api/health", (_req, res) => res.json({ ok: true, configured: Boolean(process.env.GEMINI_API_KEY) }));

app.post("/api/generate", upload.single("reference"), async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: "Не настроен Gemini API-ключ. Добавь GEMINI_API_KEY в файл .env и перезапусти сайт." });
    }
    const idea = (req.body.idea || "").trim();
    const headline = (req.body.headline || "").trim();
    const style = (req.body.style || "cinematic").trim();
    if (!idea) return res.status(400).json({ error: "Напиши, о чём видео." });
    if (!req.file) return res.status(400).json({ error: "Прикрепи фото-референс." });

    const styleMap = {
      cinematic: "cinematic, dramatic lighting, strong contrast, premium YouTube creator thumbnail",
      realistic: "photorealistic, natural details, realistic materials, crisp editorial composition",
      gaming: "high-energy gaming thumbnail, vivid colors, dramatic game-like atmosphere",
      minimal: "clean minimal composition, a single strong focal point, restrained colors"
    };
    const titleInstruction = headline
      ? `If possible, include this exact short Russian headline: "${headline}". Keep the letters large and readable.`
      : "Do not add any text, letters, logos, watermarks, or random typography.";
    const prompt = `Create a polished YouTube video thumbnail in a wide 16:9 landscape composition.
Video topic and creative brief: ${idea}
Visual style: ${styleMap[style] || styleMap.cinematic}.
Use the uploaded image as a visual reference for subject, vehicle/object identity, colors, mood, and composition. Keep the important recognizable features from the reference, but create a new, visually striking thumbnail rather than simply returning the original photo.
Composition: clear focal subject, readable at small size, strong foreground/background separation, purposeful negative space, dynamic but uncluttered, professional creator-thumbnail art direction.
${titleInstruction}
No borders, no mockup, no UI, no extra panels. Output only the finished thumbnail artwork.`;

    const endpoint = "https://generativelanguage.googleapis.com/v1beta/interactions";
    const apiResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "x-goog-api-key": process.env.GEMINI_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gemini-nano-banana-2.1",
        input: [
          { type: "text", text: prompt },
          {
            type: "image",
            mime_type: req.file.mimetype,
            data: req.file.buffer.toString("base64")
          }
        ],
        response_format: {
          type: "image",
          aspect_ratio: "16:9",
          image_size: "1K"
        }
      })
    });

    const payload = await apiResponse.json();
    if (!apiResponse.ok) {
      console.error("Gemini API error:", payload);
      const detail = payload.error?.message || "Gemini API вернул ошибку.";
      const status = apiResponse.status === 401 || apiResponse.status === 403 ? 401 :
                     apiResponse.status === 429 ? 429 : 502;
      return res.status(status).json({
        error: status === 401 ? "Gemini API-ключ не принят. Проверь ключ и доступ к Gemini API." :
                status === 429 ? "Достигнут лимит Gemini API. Проверь квоту и биллинг." :
                `Ошибка Gemini API: ${detail}`
      });
    }

    let imageData = payload.output_image?.data;
    let mimeType = payload.output_image?.mime_type || "image/png";
    if (!imageData && Array.isArray(payload.steps)) {
      for (const step of payload.steps) {
        const blocks = step.content || step.summary || [];
        const found = blocks.find(block => block.type === "image" && block.data);
        if (found) {
          imageData = found.data;
          mimeType = found.mime_type || "image/png";
          break;
        }
      }
    }
    if (!imageData) {
      console.error("Gemini returned no image:", JSON.stringify(payload).slice(0, 2000));
      throw new Error("Gemini не вернул изображение. Попробуй ещё раз или проверь доступность модели.");
    }
    res.json({ image: `data:${mimeType};base64,${imageData}` });
  } catch (err) {
    console.error("Generation error:", err);
    res.status(500).json({ error: err.message || "Не удалось создать превью." });
  }
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: "Файл слишком большой. Максимум — 12 МБ." });
  }
  res.status(400).json({ error: err.message || "Не удалось загрузить файл." });
});

app.listen(port, () => console.log(`Thumbnail AI Studio: http://localhost:${port}`));
