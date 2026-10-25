const form = document.getElementById("generatorForm");
const idea = document.getElementById("idea");
const reference = document.getElementById("reference");
const uploadZone = document.getElementById("uploadZone");
const uploadContent = document.getElementById("uploadContent");
const referencePreview = document.getElementById("referencePreview");
const changeFile = document.getElementById("changeFile");
const charCount = document.getElementById("charCount");
const generateButton = document.getElementById("generateButton");
const buttonText = document.getElementById("buttonText");
const emptyState = document.getElementById("emptyState");
const loadingState = document.getElementById("loadingState");
const resultImage = document.getElementById("resultImage");
const resultStatus = document.getElementById("resultStatus");
const downloadButton = document.getElementById("downloadButton");
const errorMessage = document.getElementById("errorMessage");
let generatedImageUrl = null;

idea.addEventListener("input", () => charCount.textContent = `${idea.value.length} / 1800`);

document.querySelectorAll(".style-option input").forEach(input => {
  input.addEventListener("change", () => {
    document.querySelectorAll(".style-option").forEach(el => el.classList.toggle("selected", el.querySelector("input").checked));
  });
});

function showReference(file) {
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    showError("Поддерживаются только JPG, PNG и WEBP.");
    reference.value = "";
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    showError("Файл слишком большой. Максимум — 12 МБ.");
    reference.value = "";
    return;
  }
  clearError();
  referencePreview.src = URL.createObjectURL(file);
  referencePreview.hidden = false;
  uploadContent.hidden = true;
  changeFile.hidden = false;
  uploadZone.classList.add("has-image");
}
reference.addEventListener("change", () => showReference(reference.files[0]));
["dragenter", "dragover"].forEach(name => uploadZone.addEventListener(name, e => {
  e.preventDefault(); uploadZone.classList.add("dragover");
}));
["dragleave", "drop"].forEach(name => uploadZone.addEventListener(name, e => {
  e.preventDefault(); uploadZone.classList.remove("dragover");
}));
uploadZone.addEventListener("drop", e => {
  const file = e.dataTransfer.files[0];
  if (!file) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  reference.files = transfer.files;
  showReference(file);
});

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}
function clearError() {
  errorMessage.hidden = true;
  errorMessage.textContent = "";
}
function setLoading(on) {
  generateButton.disabled = on;
  buttonText.textContent = on ? "Генерируем…" : "Создать превью";
  loadingState.hidden = !on;
  if (on) {
    emptyState.hidden = true;
    resultImage.hidden = true;
    resultStatus.textContent = "Нейросеть создаёт изображение";
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  clearError();
  if (!idea.value.trim()) return showError("Напиши, о чём видео.");
  if (!reference.files[0]) return showError("Сначала прикрепи фото-референс.");
  const data = new FormData(form);
  setLoading(true);
  try {
    const response = await fetch("/api/generate", { method: "POST", body: data });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Не удалось создать превью.");
    generatedImageUrl = result.image;
    resultImage.src = generatedImageUrl;
    resultImage.hidden = false;
    emptyState.hidden = true;
    resultStatus.textContent = "Превью готово";
    downloadButton.disabled = false;
  } catch (error) {
    showError(error.message || "Ошибка соединения. Проверь сервер и попробуй снова.");
    resultStatus.textContent = "Ошибка генерации";
    if (!resultImage.src || resultImage.hidden) emptyState.hidden = false;
  } finally {
    setLoading(false);
  }
});

downloadButton.addEventListener("click", () => {
  if (!generatedImageUrl) return;
  const a = document.createElement("a");
  a.href = generatedImageUrl;
  a.download = `thumbnail-${new Date().toISOString().slice(0,10)}.png`;
  document.body.appendChild(a); a.click(); a.remove();
});
