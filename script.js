const { FFmpeg } = FFmpegWASM;
const { fetchFile } = FFmpegUtil;

let ffmpeg = null;
let currentFile = null;

async function initFFmpeg() {
    if (ffmpeg) return ffmpeg;
    log("Загрузка FFmpeg (≈30 MB, кэшируется)...", "info");
    ffmpeg = new FFmpeg();
    ffmpeg.on("progress", ({ progress }) => {
        updateProgress(Math.round(progress * 100), `Обработка: ${Math.round(progress*100)}%`);
    });
    await ffmpeg.load({
        coreURL: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js",
        wasmURL: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm"
    });
    log("FFmpeg загружен ✓", "success");
    return ffmpeg;
}

const uploadZone = document.getElementById("uploadZone");
const fileInput = document.getElementById("fileInput");
const browseBtn = document.getElementById("browseBtn");
const editor = document.getElementById("editor");
const preview = document.getElementById("preview");
const fileName = document.getElementById("fileName");
const fileSize = document.getElementById("fileSize");
const processBtn = document.getElementById("processBtn");
const resetBtn = document.getElementById("resetBtn");
const progress = document.getElementById("progress");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const logEl = document.getElementById("log");

function log(msg, type = "info") {
    logEl.classList.add("visible");
    const line = document.createElement("div");
    line.className = type;
    line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
}
function clearLog(){ logEl.innerHTML = ""; }
function updateProgress(p, t){ progress.style.display="block"; progressBar.style.width=p+"%"; progressText.textContent=t; }
function hideProgress(){ setTimeout(()=>{ progress.style.display="none"; progressBar.style.width="0%"; }, 2000); }

uploadZone.addEventListener("dragover", e => { e.preventDefault(); uploadZone.classList.add("dragover"); });
uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("dragover"));
uploadZone.addEventListener("drop", e => {
    e.preventDefault(); uploadZone.classList.remove("dragover");
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
});
browseBtn.addEventListener("click", e => { e.stopPropagation(); fileInput.click(); });
uploadZone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", e => { if (e.target.files[0]) handleFile(e.target.files[0]); });

function handleFile(file){
    if (!file.type.startsWith("video/")) { alert("Нужен видеофайл"); return; }
    currentFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = (file.size/1048576).toFixed(2) + " MB";
    preview.src = URL.createObjectURL(file);
    uploadZone.style.display = "none";
    editor.style.display = "grid";
    clearLog();
    log("Файл загружен: " + file.name, "success");
}

resetBtn.addEventListener("click", () => {
    currentFile = null; preview.src = "";
    uploadZone.style.display = "block"; editor.style.display = "none";
    fileInput.value = ""; clearLog(); hideProgress();
});

processBtn.addEventListener("click", async () => {
    if (!currentFile) return;
    processBtn.disabled = true;
    clearLog();
    log("Начало обработки...", "info");
    try {
        const ff = await initFFmpeg();
        const ext = currentFile.name.slice(currentFile.name.lastIndexOf(".")) || ".mp4";
        const inputName = "input" + ext;
        await ff.writeFile(inputName, await fetchFile(currentFile));
        log("Файл в виртуальной ФС: " + inputName, "info");

        const stripAll = document.getElementById("stripAll").checked;
        const stripAudio = document.getElementById("stripAudio").checked;
        const addNoise = document.getElementById("addNoise").checked;
        const mirror = document.getElementById("mirror").checked;
        const rotate = document.getElementById("rotate").checked;
        const res = document.getElementById("resSelect").value;
        const fps = document.getElementById("fpsSelect").value;
        const br = document.getElementById("bitrateInput").value;
        const codec = document.getElementById("codecSelect").value;

        const meta = {
            title: document.getElementById("metaTitle").value,
            artist: document.getElementById("metaArtist").value,
            comment: document.getElementById("metaComment").value,
            date: document.getElementById("metaDate").value,
            gps: document.getElementById("metaGPS").value,
            encoder: document.getElementById("metaEncoder").value
        };

        const vf = [];
        if (mirror) vf.push("hflip");
        if (rotate) vf.push("rotate=1*PI/180");
        if (addNoise) vf.push("noise=alls=2:allf=t");
        if (res !== "original") {
            const [w,h] = res.split("x");
            vf.push(`scale=${w}:${h}`);
        }
        if (fps !== "original") vf.push(`fps=${fps}`);

        const af = [];
        if (stripAudio) {
            af.push("asetrate=48000*1.05");
            af.push("aresample=48000");
            af.push("atempo=1.05");
            af.push("asetrate=48000*1.05");
        }

        const args = ["-i", inputName];
        if (vf.length) args.push("-vf", vf.join(","));
        if (af.length) args.push("-af", af.join(","));

        const codecMap = { h264:"libx264", h265:"libx265", vp9:"libvpx-vp9" };
        args.push("-c:v", codecMap[codec] || "libx264");
        args.push("-b:v", br + "k");
        args.push("-c:a", "aac");
        args.push("-b:a", "128k");

        if (stripAll) args.push("-map_metadata", "-1");
        if (meta.title) args.push("-metadata", "title=" + meta.title);
        if (meta.artist) args.push("-metadata", "artist=" + meta.artist);
        if (meta.comment) args.push("-metadata", "comment=" + meta.comment);
        if (meta.date) args.push("-metadata", "date=" + meta.date);
        if (meta.encoder) args.push("-metadata", "encoder=" + meta.encoder);
        if (meta.gps) {
            args.push("-metadata", "location=" + meta.gps);
            args.push("-metadata", "location-eng=" + meta.gps);
        }

        const outputName = "output_" + Date.now() + ".mp4";
        args.push(outputName);

        log("FFmpeg: " + args.join(" "), "info");
        await ff.exec(args);
        log("FFmpeg завершил ✓", "success");

        const data = await ff.readFile(outputName);
        const blob = new Blob([data.buffer], { type: "video/mp4" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = outputName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        log("Скачано: " + outputName, "success");
        updateProgress(100, "Готово!");
        hideProgress();
    } catch (err) {
        console.error(err);
        log("Ошибка: " + err.message, "error");
        alert("Ошибка: " + err.message);
        hideProgress();
    } finally {
        processBtn.disabled = false;
    }
});
