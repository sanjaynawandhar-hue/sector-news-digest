import { exportSections, exportPageSize } from "./export-model.mjs";
let loading;
async function library() {
  if (window.html2pdf) return;
  if (!loading)
    loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
      script.onload = resolve;
      script.onerror = () => {
        script.remove();
        loading = null;
        reject(
          Error(
            "The PDF library could not load. Check your connection and try again.",
          ),
        );
      };
      document.head.append(script);
    });
  await loading;
}
function block(tag, text, css = "") {
  const n = document.createElement(tag);
  n.textContent = text;
  n.style.cssText = css;
  return n;
}
const stamp = (value) =>
  value
    ? new Date(value).toLocaleString("en-GB", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short",
      }) + " IST"
    : "Unavailable";
function footer() {
  return block(
    "div",
    "SECTOR NEWS DIGEST  /  SANJAY NAVANDAR  /  ProfessorSK",
    "border-top:1px solid #cdd6c9;padding-top:12px;margin-top:auto;font:9px Arial;letter-spacing:1px;color:#536356",
  );
}
function storyLink(article) {
  const a = block(
    "a",
    "Read the original story ↗",
    "color:#235b46;font:11px Arial;text-decoration:underline;display:block;margin-top:10px;overflow-wrap:anywhere",
  );
  a.href = article.url;
  return a;
}
async function output(input, carousel) {
  const data = exportSections(input);
  await library();
  const root = document.createElement("div");
  root.style.cssText =
    "color:#202c27;background:#f8f7f2;font-family:Georgia,serif;";
  const { width, height } = exportPageSize(carousel);
  root.style.width = "100%";
  const page = (dark = false) => {
    const n = document.createElement("section");
    n.style.cssText = `width:100%;${carousel ? `height:${height}px;` : `min-height:${height}px;`}padding:46px;box-sizing:border-box;display:flex;flex-direction:column;background:${dark ? "#183f35" : "#f8f7f2"};color:${dark ? "#f4f1df" : "#202c27"};`;
    root.append(n);
    return n;
  };
  if (carousel) {
    const cover = page(true);
    cover.append(
      block(
        "div",
        "THE SECTOR PERSPECTIVE",
        "font:11px Arial;letter-spacing:2px;margin-bottom:100px",
      ),
      block(
        "h1",
        data.name,
        "font:62px Georgia;line-height:1.05;margin:0 0 25px",
      ),
      block("p", "Five stories. A wider view.", "font:22px Georgia"),
      block(
        "p",
        `Collected ${stamp(data.lastSuccessAt)}`,
        "font:12px Arial;color:#c7d7c6;margin-top:35px",
      ),
      block(
        "p",
        "Curated by Sanjay Navandar · ProfessorSK",
        "margin-top:auto;font:13px Arial",
      ),
    );
    for (const [index, a] of data.articles.entries()) {
      const p = page();
      p.className = "pdf-page";
      p.append(
        block(
          "div",
          `${String(index + 1).padStart(2, "0")} / ${String(data.articles.length).padStart(2, "0")}     ${data.name.toUpperCase()}`,
          "font:11px Arial;letter-spacing:1px;color:#235b46;margin-bottom:65px",
        ),
        block(
          "h2",
          a.title,
          "font:36px Georgia;line-height:1.2;margin:0 0 28px;overflow-wrap:anywhere",
        ),
        block(
          "p",
          `${a.publisher} · ${stamp(a.publishedAt)}`,
          "font:12px Arial;line-height:1.8;color:#536356",
        ),
        storyLink(a),
        footer(),
      );
    }
  } else {
    const p = page();
    p.append(
      block(
        "div",
        "THE READING DIGEST",
        "font:10px Arial;letter-spacing:2px;color:#235b46;margin-bottom:16px",
      ),
      block(
        "h1",
        data.name,
        "font:38px Georgia;line-height:1.1;margin:0 0 12px",
      ),
      block(
        "p",
        `Collected ${stamp(data.lastSuccessAt)} · Five latest headlines`,
        "font:10px Arial;color:#536356;margin-bottom:22px",
      ),
    );
    for (const [i, a] of data.articles.entries()) {
      const row = document.createElement("section");
      row.style.cssText =
        "padding:16px 0;border-top:1px solid #d5dccf;break-inside:avoid;";
      row.append(
        block(
          "h2",
          `${i + 1}. ${a.title}`,
          "font:19px Georgia;line-height:1.3;margin:0 0 9px",
        ),
        block(
          "p",
          `${a.publisher} · ${stamp(a.publishedAt)}`,
          "font:10px Arial;color:#536356;margin:0",
        ),
        storyLink(a),
      );
      p.append(row);
    }
    p.append(footer());
  }
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;pointer-events:none;`;
  host.append(root);
  document.body.append(host);
  try {
    await window
      .html2pdf()
      .set({
        margin: 0,
        filename: `${data.name.replace(/[^a-z0-9]+/gi, "_")}_${carousel ? "Carousel" : "Digest"}_${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())}.pdf`,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: {
          scale: 1.5,
          backgroundColor: "#f8f7f2",
          useCORS: true,
          scrollY: 0,
        },
        jsPDF: {
          unit: "pt",
          format: carousel ? [720, 720] : "a4",
          orientation: "portrait",
        },
        pagebreak: { mode: carousel ? [] : ["css"] },
        enableLinks: true,
      })
      .from(root)
      .save();
  } finally {
    host.remove();
  }
}
export const exportDigest = (input) => output(input, false);
export const exportCarousel = (input) => output(input, true);
